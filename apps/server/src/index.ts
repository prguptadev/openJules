import express from 'express';
import { ShellTool, Guardrail, FileTool } from '@open-jules/agent-core';
import { JobManager, Job } from './services/JobManager.js';

const app = express();
app.use(express.json());

const PORT = 3000;

// --- Singleton Tools ---
const autoApprover = async (cmd: string, reason: string) => {
  console.log(`[AUTO-APPROVER] Approved: ${cmd}`);
  return true;
};

// Mock Config & MessageBus for the extracted ShellTool
const mockConfig = {
  getTargetDir: () => process.cwd(),
  getShellToolInactivityTimeout: () => 60000,
  getEnableInteractiveShell: () => false,
  getDebugMode: () => true,
  getSummarizeToolOutputConfig: () => ({}),
  getGeminiClient: () => ({}),
  getWorkspaceContext: () => ({ isPathWithinWorkspace: () => true }),
  sanitizationConfig: {}
};
const mockMessageBus = {};

const guardrail = new Guardrail(autoApprover);
const shellTool = new ShellTool(mockConfig as any, mockMessageBus as any);

// Wrapper to restore Guardrail
const safeExecute = async (command: string, cwd?: string) => {
  const isSafe = await guardrail.validate(command);
  if (!isSafe) throw new Error("Command denied by guardrail");
  
  // Use the extracted tool - bypassing type checks for the prototype
  return await (shellTool as any).execute({ command, dir_path: cwd || process.cwd() });
};


// --- The "Worker" Logic (Ralph Loop Placeholder) ---
const workerFn = async (job: Job) => {
  const { command, cwd } = job.payload;
  
  if (job.type === 'execute_command') {
    return await safeExecute(command, cwd);
  }
  
  throw new Error(`Unknown job type: ${job.type}`);
};

const jobManager = new JobManager(workerFn);

// --- API Endpoints ---

app.post('/tasks', (req, res) => {
  const { command, cwd } = req.body;
  const job = jobManager.createJob('execute_command', { command, cwd });
  res.status(202).json({ 
    jobId: job.id, 
    status: job.status,
    message: 'Task accepted. Poll /tasks/:id for updates.' 
  });
});

app.get('/tasks/:id', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.get('/tasks', (req, res) => {
  // @ts-ignore
  const jobs = Array.from(jobManager['jobs'].values()); 
  res.json(jobs);
});

app.listen(PORT, () => {
  console.log(`OpenJules Async Server running on http://localhost:${PORT}`);
});