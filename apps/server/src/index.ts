import express from 'express';
import { JobManager, Job } from './services/JobManager.js';
import { AgentService } from './llm/AgentService.js';
import { saveApiKey, loadApiKey } from './config/credentials.js';
import { loadSettings, saveSettings } from './config/settings.js';
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
    const eventStream = await agent.sendMessage(command);
    
    let fullResponse = "";
    
    // Process the higher-level events from GeminiClient
    for await (const event of eventStream) {
      switch (event.type) {
        case 'content':
          fullResponse += event.value;
          jobManager.addLog(job.id, event.value);
          break;
        case 'thought':
          // @ts-ignore - thought summary properties might vary
          jobManager.addLog(job.id, `[Thinking] ${event.value.summary || '...'}`);
          break;
        case 'tool_call_request':
          jobManager.addLog(job.id, `[Tool Call] Executing ${event.value.name}...`);
          break;
        case 'tool_call_response':
          // @ts-ignore
          const toolName = event.value.request?.name || 'tool';
          jobManager.addLog(job.id, `[Tool Response] ${toolName} finished.`);
          break;
        case 'error':
          // @ts-ignore
          jobManager.addLog(job.id, `[Error] ${event.value.error?.message || 'Unknown error'}`);
          break;
        case 'finished':
          // @ts-ignore
          jobManager.addLog(job.id, `[Finished] Reason: ${event.value.reason}`);
          break;
      }
    }
    
    return { stdout: fullResponse, exitCode: 0 };
  }
  
  throw new Error(`Unknown job type: ${job.type}`);
};

const jobManager = new JobManager(workerFn);

// --- API Endpoints ---

app.get('/settings', (req, res) => {
  res.json(loadSettings());
});

app.post('/settings', (req, res) => {
  const updated = saveSettings(req.body);
  res.json(updated);
});

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
