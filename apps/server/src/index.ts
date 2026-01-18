import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { JobManager, Job } from './services/JobManager.js';
import { AgentService, AgentServiceOptions } from './llm/AgentService.js';
import { saveApiKey, loadApiKey } from './config/credentials.js';
import { loadSettings, saveSettings } from './config/settings.js';
import { githubService } from './services/GitHubService.js';
import { sessionManager, Session } from './services/SessionManager.js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3000;

// Helper to sanitize error logs
function logError(context: string, error: any) {
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
  } else {
    console.error(`${context}:`, error);
  }
}

// Map of JobID -> Agent Instance
const agents = new Map<string, AgentService>();

// Store OAuth states temporarily (in production, use Redis)
const oauthStates = new Map<string, { timestamp: number; redirectUrl?: string }>();

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
function requiresApproval(toolCalls: any[]): { needs: boolean; dangerous: any[] } {
  const dangerous = toolCalls.filter(tc =>
    TOOLS_REQUIRING_APPROVAL.includes(tc.name.toLowerCase())
  );
  return { needs: dangerous.length > 0, dangerous };
}

// Format tool calls for display in approval message
function formatToolCallsForApproval(toolCalls: any[]): string {
  return toolCalls.map(tc => {
    if (tc.name.toLowerCase() === 'shell') {
      return `\`${tc.args?.command || 'unknown command'}\``;
    } else if (tc.name.toLowerCase() === 'write_file') {
      return `Write to \`${tc.args?.path || 'unknown file'}\``;
    } else if (tc.name.toLowerCase() === 'edit') {
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
        const agentOptions: AgentServiceOptions = { apiKey };

        if (sessionId) {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            // Use session workspace path
            agentOptions.workspacePath = cwd || sessionManager.getRepoPath(sessionId) || undefined;

            // Inject GitHub token from session
            const githubToken = sessionManager.getGitHubToken(sessionId);
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
      } catch (e: any) {
        throw new Error(`Failed to initialize Agent: ${e.message}`);
      }
    }

    const agent = agents.get(agentKey)!;

    let fullResponse = "";
    const maxTurns = 50;  // Safety limit
    let turnCount = job.turnCount || 0;  // Resume from stored turn count if available
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
      currentMessage = `Tool execution results:\n${toolResults.map(r =>
        `${r.name}: ${r.output || r.error || 'completed'}`
      ).join('\n')}`;
    }

    // Main agent loop - continues until no more tool calls
    while (turnCount < maxTurns) {
      turnCount++;
      const eventStream = await agent.sendMessage(currentMessage);

      const pendingToolCalls: any[] = [];
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
        const settings = loadSettings();
        const approvalEnabled = settings.requireApproval !== false; // Default to true if not set

        // Check if any tool calls require approval (only if approval is enabled)
        const approvalCheck = requiresApproval(pendingToolCalls);

        if (approvalEnabled && approvalCheck.needs) {
          const commandSummary = formatToolCallsForApproval(approvalCheck.dangerous);
          jobManager.addLog(job.id, `[Approval Required] Dangerous operation detected`);

          // Request approval and store pending tool calls
          jobManager.requestApproval(
            job.id,
            commandSummary,
            `The agent wants to execute the following operation(s):\n- ${commandSummary}`,
            pendingToolCalls,
            turnCount
          );

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
        currentMessage = `Tool execution results:\n${toolResults.map(r =>
          `${r.name}: ${r.output || r.error || 'completed'}`
        ).join('\n')}`;
      } else {
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

const jobManager = new JobManager(workerFn);

// --- API Endpoints ---

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = saveSettings(req.body);
  res.json(updated);
});

app.post('/api/auth', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key is required' });
  saveApiKey(apiKey);
  res.json({ success: true, message: 'API Key saved' });
});

app.get('/api/auth/status', (req, res) => {
  const key = loadApiKey();
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
  if (!job) return res.status(404).json({ error: 'Job not found' });
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
    configured: githubService.isConfigured(),
    message: githubService.isConfigured()
      ? 'GitHub OAuth is configured'
      : 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
  });
});

// Start GitHub OAuth flow
app.get('/api/github/auth', (req, res) => {
  if (!githubService.isConfigured()) {
    return res.status(503).json({
      error: 'GitHub OAuth not configured',
      message: 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables'
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUrl = req.query.redirect as string | undefined;

  oauthStates.set(state, {
    timestamp: Date.now(),
    redirectUrl
  });

  const authUrl = githubService.getAuthorizationUrl(state);
  res.json({ authUrl });
});

// GitHub OAuth callback
app.get('/api/github/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  const stateData = oauthStates.get(state as string);
  if (!stateData) {
    return res.status(400).json({ error: 'Invalid or expired state' });
  }

  oauthStates.delete(state as string);

  try {
    // Exchange code for token
    const accessToken = await githubService.exchangeCodeForToken(code as string);

    // Get user info
    const user = await githubService.getUser(accessToken);

    // Create or update session
    const session = sessionManager.getOrCreateSession(
      user.id.toString(),
      accessToken,
      {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      }
    );

    // Redirect to frontend with session ID
    const redirectUrl = stateData.redirectUrl || 'http://localhost:5173';
    res.redirect(`${redirectUrl}?sessionId=${session.id}`);
  } catch (error: any) {
    logError('GitHub OAuth error', error);
    res.status(500).json({ error: 'OAuth failed', message: error.message });
  }
});

// Get current session
app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
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
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const token = sessionManager.getGitHubToken(req.params.id);
  if (!token) {
    return res.status(401).json({ error: 'No GitHub token available' });
  }

  try {
    const repos = await githubService.listRepos(token);
    res.json(repos);
  } catch (error: any) {
    logError('Failed to list repos', error);
    res.status(500).json({ error: 'Failed to list repositories', message: error.message });
  }
});

// List branches for a repo
app.get('/api/sessions/:id/repos/:owner/:repo/branches', async (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const token = sessionManager.getGitHubToken(req.params.id);
  if (!token) {
    return res.status(401).json({ error: 'No GitHub token available' });
  }

  try {
    const branches = await githubService.listBranches(token, req.params.owner, req.params.repo);
    res.json(branches);
  } catch (error: any) {
    logError('Failed to list branches', error);
    res.status(500).json({ error: 'Failed to list branches', message: error.message });
  }
});

// Select a repo for the session
app.post('/api/sessions/:id/select-repo', async (req, res) => {
  const { repoId, branch } = req.body;

  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const token = sessionManager.getGitHubToken(req.params.id);
  if (!token) {
    return res.status(401).json({ error: 'No GitHub token available' });
  }

  try {
    // Get full repo details
    const repo = await githubService.getRepoById(token, repoId);

    // Select the repo (this triggers cloning in background)
    const updatedSession = await sessionManager.selectRepo(req.params.id, repo, branch);

    res.json({
      id: updatedSession.id,
      selectedRepo: updatedSession.selectedRepo,
      selectedBranch: updatedSession.selectedBranch,
      status: updatedSession.status,
      statusMessage: updatedSession.statusMessage,
    });
  } catch (error: any) {
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
    const updatedSession = await sessionManager.changeBranch(req.params.id, branch);
    res.json({
      id: updatedSession.id,
      selectedBranch: updatedSession.selectedBranch,
      status: updatedSession.status,
    });
  } catch (error: any) {
    logError('Failed to change branch', error);
    res.status(500).json({ error: 'Failed to change branch', message: error.message });
  }
});

// Submit task scoped to session's repo
app.post('/api/sessions/:id/tasks', (req, res) => {
  const { command } = req.body;

  const session = sessionManager.getSession(req.params.id);
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

  const repoPath = sessionManager.getRepoPath(req.params.id);
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
  sessionManager.touchSession(req.params.id);

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
  const deleted = sessionManager.deleteSession(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ success: true, message: 'Session deleted' });
});

app.listen(PORT, () => {
  console.log(`KODE Server running on http://localhost:${PORT}`);
});
