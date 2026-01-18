"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const cors_1 = __importDefault(require("cors"));
const JobManager_js_1 = require("./services/JobManager.js");
const AgentService_js_1 = require("./llm/AgentService.js");
const credentials_js_1 = require("./config/credentials.js");
const settings_js_1 = require("./config/settings.js");
const GitHubService_js_1 = require("./services/GitHubService.js");
const SessionManager_js_1 = require("./services/SessionManager.js");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
const PORT = 3000;
// Helper to sanitize error logs
function logError(context, error) {
    if (error.config || error.isAxiosError) {
        // Sanitize Axios errors to avoid leaking headers (tokens)
        const sanitized = {
            message: error.message,
            code: error.code,
            status: error.response?.status,
            url: error.config?.url,
            method: error.config?.method,
        };
        console.error(`${context}:`, sanitized);
    }
    else {
        console.error(`${context}:`, error);
    }
}
// Map of JobID -> Agent Instance
const agents = new Map();
// Store OAuth states temporarily (in production, use Redis)
const oauthStates = new Map();
// Cleanup old OAuth states every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of oauthStates.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes expiry
            oauthStates.delete(state);
        }
    }
}, 5 * 60 * 1000);
// Tools that require user approval before execution
const TOOLS_REQUIRING_APPROVAL = ['shell', 'write_file', 'edit'];
// Check if any tool calls require approval
function requiresApproval(toolCalls) {
    const dangerous = toolCalls.filter(tc => TOOLS_REQUIRING_APPROVAL.includes(tc.name.toLowerCase()));
    return { needs: dangerous.length > 0, dangerous };
}
// Format tool calls for display in approval message
function formatToolCallsForApproval(toolCalls) {
    return toolCalls.map(tc => {
        if (tc.name.toLowerCase() === 'shell') {
            return `\`${tc.args?.command || 'unknown command'}\``;
        }
        else if (tc.name.toLowerCase() === 'write_file') {
            return `Write to \`${tc.args?.path || 'unknown file'}\``;
        }
        else if (tc.name.toLowerCase() === 'edit') {
            return `Edit \`${tc.args?.filePath || 'unknown file'}\``;
        }
        return `${tc.name}(...)`;
    }).join('\n- ');
}
// Custom error to signal approval is needed
class ApprovalRequiredError extends Error {
    constructor() {
        super('Approval required');
        this.name = 'ApprovalRequiredError';
    }
}
const workerFn = async (job) => {
    const { command, cwd, sessionId, repo, branch } = job.payload;
    if (job.type === 'execute_command') {
        const apiKey = (0, credentials_js_1.loadApiKey)();
        if (!apiKey) {
            throw new Error("Missing API Key. Please configure it in Settings.");
        }
        // Use sessionId as key to persist agent (conversation history) across tasks
        // If no sessionId, use jobId (one-off task)
        const agentKey = sessionId || job.id;
        if (!agents.has(agentKey)) {
            try {
                // Build agent options with session context if available
                const agentOptions = { apiKey };
                if (sessionId) {
                    const session = SessionManager_js_1.sessionManager.getSession(sessionId);
                    if (session) {
                        // Use session workspace path
                        agentOptions.workspacePath = cwd || SessionManager_js_1.sessionManager.getRepoPath(sessionId) || undefined;
                        // Inject GitHub token from session
                        const githubToken = SessionManager_js_1.sessionManager.getGitHubToken(sessionId);
                        if (githubToken) {
                            agentOptions.githubToken = githubToken;
                        }
                        // Add repo context
                        if (repo && branch) {
                            agentOptions.repoContext = {
                                fullName: repo.fullName,
                                branch: branch,
                                owner: repo.owner,
                                name: repo.name,
                            };
                        }
                    }
                }
                agents.set(agentKey, new AgentService_js_1.AgentService(agentOptions));
            }
            catch (e) {
                throw new Error(`Failed to initialize Agent: ${e.message}`);
            }
        }
        const agent = agents.get(agentKey);
        let fullResponse = "";
        const maxTurns = 50; // Safety limit
        let turnCount = job.turnCount || 0; // Resume from stored turn count if available
        let currentMessage = command;
        // Check if we're resuming from an approval - execute stored tool calls first
        const pendingToolCalls = jobManager.getPendingToolCalls(job.id);
        if (pendingToolCalls && pendingToolCalls.length > 0) {
            jobManager.addLog(job.id, `[Resuming after approval - executing ${pendingToolCalls.length} tool call(s)]`);
            const toolResults = await agent.executeToolCalls(pendingToolCalls);
            for (const result of toolResults) {
                jobManager.addLog(job.id, `[Tool ${result.name}] Exit: ${result.exitCode ?? 'ok'}, Output: ${(result.output || '').slice(0, 300)}...`);
                jobManager.addMessage(job.id, {
                    role: 'tool_result',
                    content: result.output || result.error || 'completed',
                    metadata: { toolName: result.name, exitCode: result.exitCode },
                });
            }
            // Clear pending tool calls and continue with tool results
            jobManager.clearPendingToolCalls(job.id);
            currentMessage = `Tool execution results:\n${toolResults.map(r => `${r.name}: ${r.output || r.error || 'completed'}`).join('\n')}`;
        }
        // Main agent loop - continues until no more tool calls
        while (turnCount < maxTurns) {
            turnCount++;
            const eventStream = await agent.sendMessage(currentMessage);
            const pendingToolCalls = [];
            let hasFinished = false;
            let currentTurnContent = "";
            // Process events from this turn
            for await (const event of eventStream) {
                switch (event.type) {
                    case 'content':
                        fullResponse += event.value;
                        currentTurnContent += event.value;
                        jobManager.addLog(job.id, event.value);
                        break;
                    case 'thought':
                        // @ts-ignore
                        const thoughtSummary = event.value.summary || '...';
                        jobManager.addLog(job.id, `[Thinking] ${thoughtSummary}`);
                        jobManager.addMessage(job.id, {
                            role: 'thinking',
                            content: thoughtSummary,
                        });
                        break;
                    case 'tool_call_request':
                        // @ts-ignore
                        const toolRequest = event.value;
                        jobManager.addLog(job.id, `[Tool Call] ${toolRequest.name}(${JSON.stringify(toolRequest.args).slice(0, 100)}...)`);
                        jobManager.addMessage(job.id, {
                            role: 'tool_call',
                            content: `Calling \`${toolRequest.name}\``,
                            metadata: { toolName: toolRequest.name, toolArgs: toolRequest.args },
                        });
                        pendingToolCalls.push(toolRequest);
                        break;
                    case 'tool_call_response':
                        // @ts-ignore
                        const toolName = event.value.request?.name || 'tool';
                        // @ts-ignore
                        const resultPreview = (event.value.response?.resultDisplay || '').slice(0, 200);
                        jobManager.addLog(job.id, `[Tool Result] ${toolName}: ${resultPreview}...`);
                        break;
                    case 'error':
                        // @ts-ignore
                        const errorMsg = event.value.error?.message || 'Unknown error';
                        jobManager.addLog(job.id, `[Error] ${errorMsg}`);
                        jobManager.addMessage(job.id, {
                            role: 'system',
                            content: `❌ Error: ${errorMsg}`,
                        });
                        break;
                    case 'finished':
                        // @ts-ignore
                        jobManager.addLog(job.id, `[Finished] Reason: ${event.value.reason}`);
                        hasFinished = true;
                        break;
                }
            }
            // Add assistant response if there was content
            if (currentTurnContent.trim()) {
                jobManager.addMessage(job.id, {
                    role: 'assistant',
                    content: currentTurnContent,
                });
            }
            // Execute any pending tool calls
            if (pendingToolCalls.length > 0) {
                // Check if approval is enabled in settings
                const settings = (0, settings_js_1.loadSettings)();
                const approvalEnabled = settings.requireApproval !== false; // Default to true if not set
                // Check if any tool calls require approval (only if approval is enabled)
                const approvalCheck = requiresApproval(pendingToolCalls);
                if (approvalEnabled && approvalCheck.needs) {
                    const commandSummary = formatToolCallsForApproval(approvalCheck.dangerous);
                    jobManager.addLog(job.id, `[Approval Required] Dangerous operation detected`);
                    // Request approval and store pending tool calls
                    jobManager.requestApproval(job.id, commandSummary, `The agent wants to execute the following operation(s):\n- ${commandSummary}`, pendingToolCalls, turnCount);
                    // Throw to pause the job - it will be re-queued after approval
                    throw new ApprovalRequiredError();
                }
                jobManager.addLog(job.id, `[Executing ${pendingToolCalls.length} tool call(s)...]`);
                const toolResults = await agent.executeToolCalls(pendingToolCalls);
                for (const result of toolResults) {
                    jobManager.addLog(job.id, `[Tool ${result.name}] Exit: ${result.exitCode ?? 'ok'}, Output: ${(result.output || '').slice(0, 300)}...`);
                    jobManager.addMessage(job.id, {
                        role: 'tool_result',
                        content: result.output || result.error || 'completed',
                        metadata: { toolName: result.name, exitCode: result.exitCode },
                    });
                }
                // Continue conversation with tool results
                currentMessage = `Tool execution results:\n${toolResults.map(r => `${r.name}: ${r.output || r.error || 'completed'}`).join('\n')}`;
            }
            else {
                // No more tool calls, we're done
                break;
            }
            if (hasFinished && pendingToolCalls.length === 0) {
                break;
            }
        }
        if (turnCount >= maxTurns) {
            jobManager.addLog(job.id, `[Warning] Reached maximum turn limit (${maxTurns})`);
        }
        return { stdout: fullResponse, exitCode: 0 };
    }
    throw new Error(`Unknown job type: ${job.type}`);
};
const jobManager = new JobManager_js_1.JobManager(workerFn);
// --- API Endpoints ---
app.get('/api/settings', (req, res) => {
    res.json((0, settings_js_1.loadSettings)());
});
app.post('/api/settings', (req, res) => {
    const updated = (0, settings_js_1.saveSettings)(req.body);
    res.json(updated);
});
app.post('/api/auth', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey)
        return res.status(400).json({ error: 'API Key is required' });
    (0, credentials_js_1.saveApiKey)(apiKey);
    res.json({ success: true, message: 'API Key saved' });
});
app.get('/api/auth/status', (req, res) => {
    const key = (0, credentials_js_1.loadApiKey)();
    res.json({ configured: !!key });
});
app.post('/api/tasks', (req, res) => {
    const { command, cwd } = req.body;
    const job = jobManager.createJob('execute_command', { command, cwd });
    res.status(202).json({
        jobId: job.id,
        status: job.status,
        message: 'Task accepted.'
    });
});
app.get('/api/tasks/:id', (req, res) => {
    const job = jobManager.getJob(req.params.id);
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});
// Get active tasks (pending, running, waiting_approval)
app.get('/api/tasks/filter/active', (_req, res) => {
    const jobs = jobManager.getActiveJobs();
    res.json(jobs);
});
// Get completed tasks (completed, failed)
app.get('/api/tasks/filter/history', (_req, res) => {
    const jobs = jobManager.getCompletedJobs();
    res.json(jobs);
});
// Approve or reject a pending approval
app.post('/api/tasks/:id/approval', (req, res) => {
    const { approvalId, approved } = req.body;
    const jobId = req.params.id;
    if (!approvalId || typeof approved !== 'boolean') {
        return res.status(400).json({ error: 'approvalId and approved (boolean) are required' });
    }
    const success = jobManager.resolveApproval(jobId, approvalId, approved);
    if (!success) {
        return res.status(404).json({ error: 'Approval not found or already resolved' });
    }
    res.json({ success: true, approved });
});
app.get('/api/tasks', (_req, res) => {
    // @ts-ignore
    const jobs = Array.from(jobManager['jobs'].values());
    res.json(jobs);
});
// --- GitHub OAuth & Session Endpoints ---
// Check if GitHub OAuth is configured
app.get('/api/github/status', (req, res) => {
    res.json({
        configured: GitHubService_js_1.githubService.isConfigured(),
        message: GitHubService_js_1.githubService.isConfigured()
            ? 'GitHub OAuth is configured'
            : 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
    });
});
// Start GitHub OAuth flow
app.get('/api/github/auth', (req, res) => {
    if (!GitHubService_js_1.githubService.isConfigured()) {
        return res.status(503).json({
            error: 'GitHub OAuth not configured',
            message: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
        });
    }
    const state = crypto_1.default.randomBytes(16).toString('hex');
    const redirectUrl = req.query.redirect;
    oauthStates.set(state, {
        timestamp: Date.now(),
        redirectUrl
    });
    const authUrl = GitHubService_js_1.githubService.getAuthorizationUrl(state);
    res.json({ authUrl });
});
// GitHub OAuth callback
app.get('/api/github/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    const stateData = oauthStates.get(state);
    if (!stateData) {
        return res.status(400).json({ error: 'Invalid or expired state' });
    }
    oauthStates.delete(state);
    try {
        // Exchange code for token
        const accessToken = await GitHubService_js_1.githubService.exchangeCodeForToken(code);
        // Get user info
        const user = await GitHubService_js_1.githubService.getUser(accessToken);
        // Create or update session
        const session = SessionManager_js_1.sessionManager.getOrCreateSession(user.id.toString(), accessToken, {
            login: user.login,
            name: user.name,
            avatarUrl: user.avatarUrl,
        });
        // Redirect to frontend with session ID
        const redirectUrl = stateData.redirectUrl || 'http://localhost:5173';
        res.redirect(`${redirectUrl}?sessionId=${session.id}`);
    }
    catch (error) {
        logError('GitHub OAuth error', error);
        res.status(500).json({ error: 'OAuth failed', message: error.message });
    }
});
// Get current session
app.get('/api/sessions/:id', (req, res) => {
    const session = SessionManager_js_1.sessionManager.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    // Return session without sensitive data
    res.json({
        id: session.id,
        githubUser: session.githubUser,
        selectedRepo: session.selectedRepo,
        selectedBranch: session.selectedBranch,
        status: session.status,
        statusMessage: session.statusMessage,
        agentsConfig: session.agentsConfig,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
    });
});
// List user's GitHub repos
app.get('/api/sessions/:id/repos', async (req, res) => {
    const session = SessionManager_js_1.sessionManager.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const token = SessionManager_js_1.sessionManager.getGitHubToken(req.params.id);
    if (!token) {
        return res.status(401).json({ error: 'No GitHub token available' });
    }
    try {
        const repos = await GitHubService_js_1.githubService.listRepos(token);
        res.json(repos);
    }
    catch (error) {
        logError('Failed to list repos', error);
        res.status(500).json({ error: 'Failed to list repositories', message: error.message });
    }
});
// List branches for a repo
app.get('/api/sessions/:id/repos/:owner/:repo/branches', async (req, res) => {
    const session = SessionManager_js_1.sessionManager.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const token = SessionManager_js_1.sessionManager.getGitHubToken(req.params.id);
    if (!token) {
        return res.status(401).json({ error: 'No GitHub token available' });
    }
    try {
        const branches = await GitHubService_js_1.githubService.listBranches(token, req.params.owner, req.params.repo);
        res.json(branches);
    }
    catch (error) {
        logError('Failed to list branches', error);
        res.status(500).json({ error: 'Failed to list branches', message: error.message });
    }
});
// Select a repo for the session
app.post('/api/sessions/:id/select-repo', async (req, res) => {
    const { repoId, branch } = req.body;
    const session = SessionManager_js_1.sessionManager.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const token = SessionManager_js_1.sessionManager.getGitHubToken(req.params.id);
    if (!token) {
        return res.status(401).json({ error: 'No GitHub token available' });
    }
    try {
        // Get full repo details
        const repo = await GitHubService_js_1.githubService.getRepoById(token, repoId);
        // Select the repo (this triggers cloning in background)
        const updatedSession = await SessionManager_js_1.sessionManager.selectRepo(req.params.id, repo, branch);
        res.json({
            id: updatedSession.id,
            selectedRepo: updatedSession.selectedRepo,
            selectedBranch: updatedSession.selectedBranch,
            status: updatedSession.status,
            statusMessage: updatedSession.statusMessage,
        });
    }
    catch (error) {
        logError('Failed to select repo', error);
        res.status(500).json({ error: 'Failed to select repository', message: error.message });
    }
});
// Change branch for current repo
app.post('/api/sessions/:id/change-branch', async (req, res) => {
    const { branch } = req.body;
    if (!branch) {
        return res.status(400).json({ error: 'Branch is required' });
    }
    try {
        const updatedSession = await SessionManager_js_1.sessionManager.changeBranch(req.params.id, branch);
        res.json({
            id: updatedSession.id,
            selectedBranch: updatedSession.selectedBranch,
            status: updatedSession.status,
        });
    }
    catch (error) {
        logError('Failed to change branch', error);
        res.status(500).json({ error: 'Failed to change branch', message: error.message });
    }
});
// Submit task scoped to session's repo
app.post('/api/sessions/:id/tasks', (req, res) => {
    const { command } = req.body;
    const session = SessionManager_js_1.sessionManager.getSession(req.params.id);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status !== 'ready') {
        return res.status(400).json({
            error: 'Session not ready',
            status: session.status,
            message: session.statusMessage
        });
    }
    const repoPath = SessionManager_js_1.sessionManager.getRepoPath(req.params.id);
    if (!repoPath) {
        return res.status(400).json({ error: 'No repository selected' });
    }
    // Create job with session context
    const job = jobManager.createJob('execute_command', {
        command,
        cwd: repoPath,
        sessionId: req.params.id,
        repo: session.selectedRepo,
        branch: session.selectedBranch,
    });
    // Touch session activity
    SessionManager_js_1.sessionManager.touchSession(req.params.id);
    res.status(202).json({
        jobId: job.id,
        status: job.status,
        message: 'Task accepted.',
        repo: session.selectedRepo?.fullName,
        branch: session.selectedBranch,
    });
});
// Delete session
app.delete('/api/sessions/:id', (req, res) => {
    const deleted = SessionManager_js_1.sessionManager.deleteSession(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true, message: 'Session deleted' });
});
app.listen(PORT, () => {
    console.log(`OpenJules Async Server running on http://localhost:${PORT}`);
});
