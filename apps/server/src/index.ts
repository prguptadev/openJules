import express from 'express';
import { JobManager, Job } from './services/JobManager.js';
import { AgentService } from './llm/AgentService.js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(express.json());

const PORT = 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("⚠️  WARNING: GEMINI_API_KEY is not set. Agent execution will fail.");
}

// Map of JobID -> Agent Instance (One agent per task for now)
const agents = new Map<string, AgentService>();

const workerFn = async (job: Job) => {
  const { command, cwd } = job.payload;
  
  if (job.type === 'execute_command') {
    // Initialize Agent if not exists
    if (!agents.has(job.id)) {
      try {
        agents.set(job.id, new AgentService(API_KEY || ''));
      } catch (e) {
        throw new Error("Failed to initialize Agent. Missing API Key?");
      }
    }

    const agent = agents.get(job.id)!;
    const stream = await agent.sendMessage(command);
    
    let fullResponse = "";
    
    // Process the stream
    for await (const event of stream) {
      if (event.type === 'chunk') {
        const text = event.value.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullResponse += text;
          // In a real app, we'd stream this via WebSocket. 
          // For now, we just log chunks to the job log so the UI can poll them.
          jobManager.addLog(job.id, text); 
        }
      }
    }
    
    return { stdout: fullResponse, exitCode: 0 };
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
