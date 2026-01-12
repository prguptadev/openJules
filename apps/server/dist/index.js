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
// --- Singleton Tools ---
const autoApprover = async (cmd, reason) => {
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
const guardrail = new agent_core_1.Guardrail(autoApprover);
const shellTool = new agent_core_1.ShellTool(mockConfig, mockMessageBus);
// Wrapper to restore Guardrail
const safeExecute = async (command, cwd) => {
    const isSafe = await guardrail.validate(command);
    if (!isSafe)
        throw new Error("Command denied by guardrail");
    // Use the extracted tool - bypassing type checks for the prototype
    return await shellTool.execute({ command, dir_path: cwd || process.cwd() });
};
// --- The "Worker" Logic (Ralph Loop Placeholder) ---
const workerFn = async (job) => {
    const { command, cwd } = job.payload;
    if (job.type === 'execute_command') {
        return await safeExecute(command, cwd);
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
