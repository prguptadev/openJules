import express from 'express';
import { JobManager, Job } from './services/JobManager.js';
import { AgentService } from './llm/AgentService.js';
import { saveApiKey, loadApiKey } from './config/credentials.js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(express.json());

const PORT = 3000;

// Map of JobID -> Agent Instance
const agents = new Map<string, AgentService>();

const workerFn = async (job: Job) => {
  const { command, cwd } = job.payload;
  
  if (job.type === 'execute_command') {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error("Missing API Key. Please configure it in Settings.");
    }

    if (!agents.has(job.id)) {
      try {
        agents.set(job.id, new AgentService(apiKey));
      } catch (e: any) {
        throw new Error(`Failed to initialize Agent: ${e.message}`);
      }
    }

    const agent = agents.get(job.id)!;
    const stream = await agent.sendMessage(command);
    
    let fullResponse = "";
    
    for await (const event of stream) {
      if (event.type === 'chunk') {
        const text = event.value.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullResponse += text;
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

app.post('/auth', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key is required' });
  
  saveApiKey(apiKey);
  res.json({ success: true, message: 'API Key saved' });
});

app.get('/auth/status', (req, res) => {
  const key = loadApiKey();
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
  if (!job) return res.status(404).json({ error: 'Job not found' });
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