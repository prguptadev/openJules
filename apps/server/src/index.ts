import express from 'express';
import { ShellTool, Guardrail, FileTool } from '@open-jules/agent-core';
import { JobManager, Job } from './services/JobManager.js';

const app = express();
app.use(express.json());

const PORT = 3000;

// --- The "Worker" Logic (Ralph Loop Placeholder) ---
const workerFn = async (job: Job) => {
  // In a real app, this would be the Supervisor class running the loop
  const { command, cwd } = job.payload;
  
  if (job.type === 'execute_command') {
    // Re-instantiate tools per job if needed, or reuse singleton
    // For now, reuse singleton for simplicity
    return await shellTool.execute(command, cwd);
  }
  
  throw new Error(`Unknown job type: ${job.type}`);
};

// --- Singleton Tools ---
const autoApprover = async (cmd: string, reason: string) => {
  console.log(`[AUTO-APPROVER] Approved: ${cmd}`);
  return true;
};
const guardrail = new Guardrail(autoApprover);
const shellTool = new ShellTool(guardrail);

// --- Job Manager ---
const jobManager = new JobManager(workerFn);

// --- API Endpoints ---

// 1. Submit a Task (Async)
app.post('/tasks', (req, res) => {
  const { command, cwd } = req.body;
  const job = jobManager.createJob('execute_command', { command, cwd });
  res.status(202).json({ 
    jobId: job.id, 
    status: job.status,
    message: 'Task accepted. Poll /tasks/:id for updates.' 
  });
});

// 2. Poll Task Status
app.get('/tasks/:id', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// 3. List all tasks (for UI)
app.get('/tasks', (req, res) => {
  // @ts-ignore - Accessing private map for demo (should add public getter)
  const jobs = Array.from(jobManager['jobs'].values()); 
  res.json(jobs);
});

app.listen(PORT, () => {
  console.log(`OpenJules Async Server running on http://localhost:${PORT}`);
});