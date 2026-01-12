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
const JobManager_js_1 = require("./services/JobManager.js");
const AgentService_js_1 = require("./llm/AgentService.js");
const credentials_js_1 = require("./config/credentials.js");
const settings_js_1 = require("./config/settings.js");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
// Map of JobID -> Agent Instance
const agents = new Map();
const workerFn = async (job) => {
    const { command, cwd } = job.payload;
    if (job.type === 'execute_command') {
        const apiKey = (0, credentials_js_1.loadApiKey)();
        if (!apiKey) {
            throw new Error("Missing API Key. Please configure it in Settings.");
        }
        if (!agents.has(job.id)) {
            try {
                agents.set(job.id, new AgentService_js_1.AgentService(apiKey));
            }
            catch (e) {
                throw new Error(`Failed to initialize Agent: ${e.message}`);
            }
        }
        const agent = agents.get(job.id);
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
app.listen(PORT, () => {
    console.log(`OpenJules Async Server running on http://localhost:${PORT}`);
});
