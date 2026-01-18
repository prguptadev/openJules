import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { JobManager, Job } from './services/JobManager.js';
import { AgentService, AgentServiceOptions } from './llm/AgentService.js';
import { saveApiKey, loadApiKey } from './config/credentials.js';
import { loadSettings, saveSettings } from './config/settings.js';
import { githubService } from './services/GitHubService.js';
import { sessionManager } from './services/SessionManager.js';
import { authService } from './services/AuthService.js';
import * as dotenv from 'dotenv';
import path from 'path';

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; name?: string };
}

// Tool call interface
interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

// Repo context interface
interface RepoContext {
  fullName: string;
  branch: string;
  owner: string;
  name: string;
}

// Tool result interface
interface ToolResult {
  name: string;
  output?: string;
  error?: string;
  exitCode?: number;
}

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3000;

// Authentication Middleware
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  const user = await authService.verifyToken(token);
  if (!user) return res.sendStatus(403);

  req.user = user;
  next();
};

// Helper to sanitize error logs
function logError(context: string, error: unknown) {
  const err = error as { config?: unknown; isAxiosError?: boolean; message?: string; code?: string; response?: { status?: number }; };
  if (err.config || err.isAxiosError) {
    // Sanitize Axios errors to avoid leaking headers (tokens)
    const sanitized = {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      url: (err.config as { url?: string })?.url,
      method: (err.config as { method?: string })?.method,
    };
    console.error(`${context}:`, sanitized);
  } else {
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
function requiresApproval(toolCalls: ToolCall[]) {
  const dangerous = toolCalls.filter((tc: ToolCall) =>
    TOOLS_REQUIRING_APPROVAL.includes(tc.name.toLowerCase())
  );
  return { needs: dangerous.length > 0, dangerous };
}

// Format tool calls for display in approval message
function formatToolCallsForApproval(toolCalls: ToolCall[]) {
  return toolCalls.map((tc: ToolCall) => {
    if (tc.name.toLowerCase() === 'shell') {
      return `
${tc.args?.command || 'unknown command'}
`}
    else if (tc.name.toLowerCase() === 'write_file') {
      return `Write to 
${tc.args?.path || 'unknown file'}
`}
    else if (tc.name.toLowerCase() === 'edit') {
      return `Edit 
${tc.args?.filePath || 'unknown file'}
`}
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

const workerFn = async (job: Job) => {
  const { command, cwd, sessionId, repo, branch } = job.payload;

  if (job.type === 'execute_command') {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error("Missing API Key. Please configure it in Settings.");
    }

    // Use sessionId as key to persist agent (conversation history) across tasks
    // If no sessionId, use jobId (one-off task)
    const agentKey = sessionId || job.id;

    if (!agents.has(agentKey)) {
      try {
        // Build agent options with session context if available
        const agentOptions: AgentServiceOptions & { githubToken?: string; repoContext?: RepoContext } = { apiKey };

        if (sessionId) {
          const session = await sessionManager.getSession(sessionId);
          if (session) {
            // Use session workspace path
            agentOptions.workspacePath = cwd || await sessionManager.getRepoPath(sessionId) || undefined;

            // Inject GitHub token from session
            const githubToken = await sessionManager.getGitHubToken(sessionId);
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

        agents.set(agentKey, new AgentService(agentOptions));
      } catch (e) {
        const err = e as Error;
        throw new Error(`Failed to initialize Agent: ${err.message}`);
      }
    }

    const agent = agents.get(agentKey)!;

    let fullResponse = "";
    const maxTurns = 50;
    let turnCount = job.turnCount || 0;
    let currentMessage = command;

    // Check if we're resuming from an approval - execute stored tool calls first
    const pendingToolCalls = jobManager.getPendingToolCalls(job.id);
    if (pendingToolCalls && pendingToolCalls.length > 0) {
      jobManager.addLog(job.id, `[Resuming after approval - executing ${pendingToolCalls.length} tool call(s)]`);
      const toolResults = await agent.executeToolCalls(pendingToolCalls);
      for (const result of toolResults) {
        jobManager.addLog(job.id, `[Tool ${result.name}] Exit: ${result.exitCode ?? 'ok'}, Output: ${(result.output || '').slice(0, 300)}...`);
        jobManager.addMessage(job.id, { role: 'tool_result', content: result.output || result.error || 'completed', metadata: { toolName: result.name, exitCode: result.exitCode } });
      }
      jobManager.clearPendingToolCalls(job.id);
      currentMessage = `Tool execution results:\n${toolResults.map((r: ToolResult) => `${r.name}: ${r.output || r.error || 'completed'}`).join('\n')}`;
    }

    while (turnCount < maxTurns) {
      turnCount++;
      const eventStream = await agent.sendMessage(currentMessage);
      const pendingToolCalls = [];
      let hasFinished = false;
      let currentTurnContent = "";

      for await (const event of eventStream) {
        switch (event.type) {
          case 'content': fullResponse += event.value; currentTurnContent += event.value; jobManager.addLog(job.id, event.value); break;
          case 'thought': 
            const thoughtSummary = (event.value ).summary || '...';
            jobManager.addLog(job.id, `[Thinking] ${thoughtSummary}`); 
            jobManager.addMessage(job.id, { role: 'thinking', content: thoughtSummary }); 
            break;
          case 'tool_call_request':
            const toolRequest = event.value ;
            jobManager.addLog(job.id, `[Tool Call] ${toolRequest.name}(${JSON.stringify(toolRequest.args).slice(0, 100)}...)`);
            jobManager.addMessage(job.id, { role: 'tool_call', content: `Calling 
${toolRequest.name}
`, metadata: { toolName: toolRequest.name, toolArgs: toolRequest.args } });
            pendingToolCalls.push(toolRequest);
            break;
          case 'tool_call_response': 
            const toolName = (event.value ).request?.name || 'tool';
            const resultPreview = ((event.value ).response?.resultDisplay || '').slice(0, 200);
            jobManager.addLog(job.id, `[Tool Result] ${toolName}: ${resultPreview}...`); 
            break;
          case 'error': 
            const errorMsg = (event.value ).error?.message || 'Unknown error';
            jobManager.addLog(job.id, `[Error] ${errorMsg}`); 
            jobManager.addMessage(job.id, { role: 'system', content: `❌ Error: ${errorMsg}` }); 
            break;
          case 'finished': 
            jobManager.addLog(job.id, `[Finished] Reason: ${(event.value ).reason}`); 
            hasFinished = true; 
            break;
        }
      }

      if (currentTurnContent.trim()) {
        jobManager.addMessage(job.id, { role: 'assistant', content: currentTurnContent });
      }

      if (pendingToolCalls.length > 0) {
        const approvalCheck = requiresApproval(pendingToolCalls);
        if (approvalCheck.needs) {
          const commandSummary = formatToolCallsForApproval(approvalCheck.dangerous);
          jobManager.addLog(job.id, `[Approval Required] Dangerous operation detected`);
          jobManager.requestApproval(job.id, commandSummary, `The agent wants to execute the following operation(s):\n- ${commandSummary}`, pendingToolCalls, turnCount);
          throw new ApprovalRequiredError();
        }
        jobManager.addLog(job.id, `[Executing ${pendingToolCalls.length} tool call(s)...]`);
        const toolResults = await agent.executeToolCalls(pendingToolCalls);
        for (const result of toolResults) {
          jobManager.addLog(job.id, `[Tool ${result.name}] Exit: ${result.exitCode ?? 'ok'}, Output: ${(result.output || '').slice(0, 300)}...`);
          jobManager.addMessage(job.id, { role: 'tool_result', content: result.output || result.error || 'completed', metadata: { toolName: result.name, exitCode: result.exitCode } });
        }
        currentMessage = `Tool execution results:\n${toolResults.map((r: ToolResult) => `${r.name}: ${r.output || r.error || 'completed'}`).join('\n')}`;
      } else { break; }
      if (hasFinished && pendingToolCalls.length === 0) break;
    }
    if (turnCount >= maxTurns) jobManager.addLog(job.id, `[Warning] Reached maximum turn limit (${maxTurns})`);
    return { stdout: fullResponse, exitCode: 0 };
  }
  throw new Error(`Unknown job type: ${job.type}`);
};

const jobManager = new JobManager(workerFn);

// --- API Endpoints ---

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = saveSettings(req.body);
  res.json(updated);
});

// Authentication Endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = await authService.verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  res.json(decoded);
});

// Protected Routes
app.post('/api/tasks', authenticateToken, (req, res) => {
  const { command, cwd } = req.body;
  const job = jobManager.createJob('execute_command', { command, cwd });
  res.status(202).json({
    jobId: job.id,
    status: job.status,
    message: 'Task accepted.'
  });
});

app.get('/api/tasks/:id', authenticateToken, (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/api/tasks', authenticateToken, (req, res) => {
  // @ts-ignore
  const jobs = Array.from(jobManager['jobs'].values()); 
  res.json(jobs);
});

app.post('/api/tasks/:id/approval', authenticateToken, (req, res) => {
  const { approvalId, approved } = req.body;
  const jobId = req.params.id;
  const success = jobManager.resolveApproval(jobId, approvalId, approved);
  if (!success) return res.status(404).json({ error: 'Approval not found or already resolved' });
  res.json({ success: true, approved });
});

// GitHub & Sessions (Protected)
app.get('/api/github/status', authenticateToken, (req, res) => {
  res.json({
    configured: githubService.isConfigured(),
    message: githubService.isConfigured() ? 'GitHub OAuth is configured' : 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
  });
});

app.get('/api/github/auth', authenticateToken, (req, res) => {
  if (!githubService.isConfigured()) return res.status(503).json({ error: 'GitHub OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUrl = req.query.redirect;
  oauthStates.set(state, { timestamp: Date.now(), redirectUrl });
  res.json({ authUrl: githubService.getAuthorizationUrl(state) });
});

app.get('/api/sessions/:id', authenticateToken, async (req, res) => {
  const session = await sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.get('/api/sessions', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const sessions = await sessionManager.listSessions(authReq.user!.id);
  res.json(sessions);
});

app.get('/api/sessions/:id/repos', authenticateToken, async (req, res) => {
  const token = await sessionManager.getGitHubToken(req.params.id);
  if (!token) return res.status(401).json({ error: 'No GitHub token available' });
  try {
    const repos = await githubService.listRepos(token);
    res.json(repos);
  } catch (error) {
    logError('Failed to list repos', error);
    const err = error as Error;
    res.status(500).json({ error: 'Failed to list repositories', message: err.message });
  }
});

app.get('/api/sessions/:id/repos/:owner/:repo/branches', authenticateToken, async (req, res) => {
  const token = await sessionManager.getGitHubToken(req.params.id);
  if (!token) return res.status(401).json({ error: 'No GitHub token available' });
  try {
    const branches = await githubService.listBranches(token, req.params.owner, req.params.repo);
    res.json(branches);
  } catch (error) {
    logError('Failed to list branches', error);
    const err = error as Error;
    res.status(500).json({ error: 'Failed to list branches', message: err.message });
  }
});

app.post('/api/sessions/:id/select-repo', authenticateToken, async (req, res) => {
  const { repoId } = req.body;
  const authReq = req as AuthenticatedRequest;
  const token = await sessionManager.getGitHubToken(req.params.id);

  if (!token) return res.status(401).json({ error: 'No GitHub token available' });

  try {
    const repo = await githubService.getRepoById(token, repoId);
    if (agents.has(req.params.id)) {
      console.log(`[SessionManager] Clearing agent cache for session ${req.params.id} (Repo Switch)`);
      agents.delete(req.params.id);
    }
    const updatedSession = await sessionManager.selectRepo(authReq.user!.id, repo, token);
    res.json(updatedSession);
  } catch (error) {
    logError('Failed to select repo', error);
    const err = error as Error;
    res.status(500).json({ error: 'Failed to select repository', message: err.message });
  }
});

app.post('/api/sessions/:id/change-branch', authenticateToken, async (req, res) => {
  const { branch } = req.body;
  if (!branch) return res.status(400).json({ error: 'Branch is required' });
  try {
    const updatedSession = await sessionManager.changeBranch(req.params.id, branch);
    if (agents.has(req.params.id)) {
      console.log(`[SessionManager] Clearing agent cache for session ${req.params.id} (Branch Switch)`);
      agents.delete(req.params.id);
    }
    res.json(updatedSession);
  } catch (error) {
    logError('Failed to change branch', error);
    const err = error as Error;
    res.status(500).json({ error: 'Failed to change branch', message: err.message });
  }
});

// Clone repository by URL (without GitHub OAuth)
app.post('/api/clone-url', authenticateToken, async (req: any, res) => {
  const { url, authType, credential } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!['none', 'pat', 'ssh'].includes(authType)) {
    return res.status(400).json({ error: 'authType must be one of: none, pat, ssh' });
  }

  if ((authType === 'pat' || authType === 'ssh') && !credential) {
    return res.status(400).json({ error: `Credential is required for ${authType} authentication` });
  }

  try {
    const session = await sessionManager.cloneByUrl(req.user.id, { url, authType, credential });
    res.status(202).json({
      sessionId: session.id,
      status: session.status,
      message: 'Repository cloning started',
      repo: session.selectedRepo?.fullName,
    });
  } catch (error: any) {
    logError('Failed to clone by URL', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:id/tasks', authenticateToken, async (req, res) => {
  const { command } = req.body;
  const session = await sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  if (session.status !== 'ready' && session.status !== 'idle') { 
      return res.status(400).json({ error: 'Session not ready', status: session.status });
  }

  const repoPath = await sessionManager.getRepoPath(req.params.id);
  if (!repoPath) return res.status(400).json({ error: 'No repository selected' });

  const job = jobManager.createJob('execute_command', {
    command,
    cwd: repoPath,
    sessionId: req.params.id,
    repo: session.selectedRepo,
    branch: session.selectedBranch,
  });
  
  await sessionManager.touchSession(req.params.id);
  
  res.status(202).json({
    jobId: job.id,
    status: job.status,
    message: 'Task accepted.',
    repo: session.selectedRepo?.fullName,
    branch: session.selectedBranch,
  });
});

app.delete('/api/sessions/:id', authenticateToken, async (req, res) => {
  const deleted = await sessionManager.deleteSession(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  if (agents.has(req.params.id)) agents.delete(req.params.id);
  res.json({ success: true, message: 'Session deleted' });
});

app.listen(PORT, () => {
  console.log(`OpenJules Async Server running on http://localhost:${PORT}`);
});