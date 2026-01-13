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
const workerFn = async (job) => {
    const { command, cwd, sessionId, repo, branch } = job.payload;
    if (job.type === 'execute_command') {
        const apiKey = (0, credentials_js_1.loadApiKey)();
        if (!apiKey) {
            throw new Error("Missing API Key. Please configure it in Settings.");
        }
        if (!agents.has(job.id)) {
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
                agents.set(job.id, new AgentService_js_1.AgentService(agentOptions));
            }
            catch (e) {
                throw new Error(`Failed to initialize Agent: ${e.message}`);
            }
        }
        const agent = agents.get(job.id);
        let fullResponse = "";
        const maxTurns = 50; // Safety limit
        let turnCount = 0;
        let currentMessage = command;
        // Main agent loop - continues until no more tool calls
        while (turnCount < maxTurns) {
            turnCount++;
            const eventStream = await agent.sendMessage(currentMessage);
            const pendingToolCalls = [];
            let hasFinished = false;
            // Process events from this turn
            for await (const event of eventStream) {
                switch (event.type) {
                    case 'content':
                        fullResponse += event.value;
                        jobManager.addLog(job.id, event.value);
                        break;
                    case 'thought':
                        // @ts-ignore
                        jobManager.addLog(job.id, `[Thinking] ${event.value.summary || '...'}`);
                        break;
                    case 'tool_call_request':
                        // @ts-ignore
                        const toolRequest = event.value;
                        jobManager.addLog(job.id, `[Tool Call] ${toolRequest.name}(${JSON.stringify(toolRequest.args).slice(0, 100)}...)`);
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
                        jobManager.addLog(job.id, `[Error] ${event.value.error?.message || 'Unknown error'}`);
                        break;
                    case 'finished':
                        // @ts-ignore
                        jobManager.addLog(job.id, `[Finished] Reason: ${event.value.reason}`);
                        hasFinished = true;
                        break;
                }
            }
            // Execute any pending tool calls
            if (pendingToolCalls.length > 0) {
                jobManager.addLog(job.id, `[Executing ${pendingToolCalls.length} tool call(s)...]`);
                const toolResults = await agent.executeToolCalls(pendingToolCalls);
                for (const result of toolResults) {
                    jobManager.addLog(job.id, `[Tool ${result.name}] Exit: ${result.exitCode ?? 'ok'}, Output: ${(result.output || '').slice(0, 300)}...`);
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
app.get('/settings', (req, res) => {
    res.json((0, settings_js_1.loadSettings)());
});
app.post('/settings', (req, res) => {
    const updated = (0, settings_js_1.saveSettings)(req.body);
    res.json(updated);
});
app.post('/auth', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey)
        return res.status(400).json({ error: 'API Key is required' });
    (0, credentials_js_1.saveApiKey)(apiKey);
    res.json({ success: true, message: 'API Key saved' });
});
app.get('/auth/status', (req, res) => {
    const key = (0, credentials_js_1.loadApiKey)();
    res.json({ configured: !!key });
});
app.post('/tasks', (req, res) => {
    const { command, cwd } = req.body;
    const job = jobManager.createJob('execute_command', { command, cwd });
    res.status(202).json({
        jobId: job.id,
        status: job.status,
        message: 'Task accepted.'
    });
});
app.get('/tasks/:id', (req, res) => {
    const job = jobManager.getJob(req.params.id);
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});
app.get('/tasks', (req, res) => {
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
        console.error('GitHub OAuth error:', error);
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
        console.error('Failed to list repos:', error);
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
        console.error('Failed to list branches:', error);
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
        const repos = await GitHubService_js_1.githubService.listRepos(token);
        const repo = repos.find(r => r.id === repoId);
        if (!repo) {
            return res.status(404).json({ error: 'Repository not found' });
        }
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
        console.error('Failed to select repo:', error);
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
        console.error('Failed to change branch:', error);
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
