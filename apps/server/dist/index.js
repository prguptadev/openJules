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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.warn("⚠️  WARNING: GEMINI_API_KEY is not set. Agent execution will fail.");
}
// Map of JobID -> Agent Instance (One agent per task for now)
const agents = new Map();
const workerFn = async (job) => {
    const { command, cwd } = job.payload;
    if (job.type === 'execute_command') {
        // Initialize Agent if not exists
        if (!agents.has(job.id)) {
            try {
                agents.set(job.id, new AgentService_js_1.AgentService(API_KEY || ''));
            }
            catch (e) {
                throw new Error("Failed to initialize Agent. Missing API Key?");
            }
        }
        const agent = agents.get(job.id);
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
const jobManager = new JobManager_js_1.JobManager(workerFn);
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
