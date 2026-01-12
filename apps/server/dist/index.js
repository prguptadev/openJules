"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agent_core_1 = require("@open-jules/agent-core");
const JobManager_js_1 = require("./services/JobManager.js");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3000;
// --- The "Worker" Logic (Ralph Loop Placeholder) ---
const workerFn = async (job) => {
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
const autoApprover = async (cmd, reason) => {
    console.log(`[AUTO-APPROVER] Approved: ${cmd}`);
    return true;
};
const guardrail = new agent_core_1.Guardrail(autoApprover);
const shellTool = new agent_core_1.ShellTool(guardrail);
// --- Job Manager ---
const jobManager = new JobManager_js_1.JobManager(workerFn);
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
