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
  const { command } = job.payload;

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

    let fullResponse = "";
    const maxTurns = 50;  // Safety limit
    let turnCount = 0;
    let currentMessage = command;

    // Main agent loop - continues until no more tool calls
    while (turnCount < maxTurns) {
      turnCount++;
      const eventStream = await agent.sendMessage(currentMessage);

      const pendingToolCalls: any[] = [];
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
