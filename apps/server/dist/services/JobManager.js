"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobManager = void 0;
const uuid_1 = require("uuid");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const JOBS_FILE = path_1.default.join(os_1.default.homedir(), '.openjules', 'jobs.json');
class JobManager {
    worker;
    jobs = new Map();
    processing = false;
    // Simple in-memory FIFO queue
    queue = [];
    constructor(worker) {
        this.worker = worker;
        this.loadJobs();
        // Start the worker loop
        setInterval(() => this.processQueue(), 1000);
    }
    loadJobs() {
        try {
            if (fs_1.default.existsSync(JOBS_FILE)) {
                const data = JSON.parse(fs_1.default.readFileSync(JOBS_FILE, 'utf-8'));
                for (const job of data) {
                    this.jobs.set(job.id, job);
                    // If job was running when server stopped, mark as failed
                    if (job.status === 'running') {
                        job.status = 'failed';
                        job.logs.push(`[${new Date().toISOString()}] Job terminated unexpectedly (server restart)`);
                    }
                }
            }
        }
        catch (error) {
            console.error('Failed to load jobs:', error);
        }
    }
    saveJobs() {
        try {
            const data = Array.from(this.jobs.values());
            const dir = path_1.default.dirname(JOBS_FILE);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            fs_1.default.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Failed to save jobs:', error);
        }
    }
    createJob(type, payload) {
        const id = (0, uuid_1.v4)();
        const job = {
            id,
            type,
            payload,
            status: 'pending',
            logs: [],
            messages: [],
            createdAt: new Date().toISOString()
        };
        // Add user message from the command
        this.addMessage(id, {
            role: 'user',
            content: payload.command,
        }, job);
        this.jobs.set(id, job);
        this.queue.push(id);
        this.saveJobs();
        return job;
    }
    getJob(id) {
        return this.jobs.get(id);
    }
    getActiveJobs() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'pending' || job.status === 'running' || job.status === 'waiting_approval');
    }
    getCompletedJobs() {
        return Array.from(this.jobs.values()).filter(job => job.status === 'completed' || job.status === 'failed');
    }
    addLog(id, message) {
        const job = this.getJob(id);
        if (job) {
            job.logs.push(`[${new Date().toISOString()}] ${message}`);
            this.saveJobs();
        }
    }
    addMessage(id, message, existingJob) {
        const job = existingJob || this.getJob(id);
        if (job) {
            const chatMessage = {
                id: (0, uuid_1.v4)(),
                timestamp: new Date().toISOString(),
                ...message,
            };
            job.messages.push(chatMessage);
            if (!existingJob) {
                this.saveJobs();
            }
        }
    }
    requestApproval(jobId, command, reason, toolCalls, turnCount) {
        const job = this.getJob(jobId);
        if (!job)
            throw new Error('Job not found');
        const approval = {
            id: (0, uuid_1.v4)(),
            jobId,
            command,
            reason,
            timestamp: new Date().toISOString(),
            status: 'pending',
        };
        job.pendingApproval = approval;
        job.status = 'waiting_approval';
        // Store pending tool calls and turn count for resumption
        if (toolCalls) {
            job.pendingToolCalls = toolCalls;
        }
        if (turnCount !== undefined) {
            job.turnCount = turnCount;
        }
        // Add approval request message
        this.addMessage(jobId, {
            role: 'approval_request',
            content: `**Approval Required**\n\nCommand: \`${command}\`\n\nReason: ${reason}`,
            metadata: { approvalId: approval.id },
        });
        this.saveJobs();
        return approval;
    }
    getPendingToolCalls(jobId) {
        const job = this.getJob(jobId);
        return job?.pendingToolCalls;
    }
    getTurnCount(jobId) {
        const job = this.getJob(jobId);
        return job?.turnCount;
    }
    clearPendingToolCalls(jobId) {
        const job = this.getJob(jobId);
        if (job) {
            job.pendingToolCalls = undefined;
            this.saveJobs();
        }
    }
    resolveApproval(jobId, approvalId, approved) {
        const job = this.getJob(jobId);
        if (!job || !job.pendingApproval || job.pendingApproval.id !== approvalId) {
            return false;
        }
        job.pendingApproval.status = approved ? 'approved' : 'rejected';
        // Add resolution message
        this.addMessage(jobId, {
            role: 'system',
            content: approved ? '✅ Command approved' : '❌ Command rejected',
            metadata: { approvalId, isApproved: approved },
        });
        if (approved) {
            job.status = 'running';
            // Re-queue the job to continue processing
            this.queue.unshift(jobId);
        }
        else {
            job.status = 'failed';
            job.result = { error: 'Command rejected by user' };
            job.completedAt = new Date().toISOString();
        }
        job.pendingApproval = undefined;
        this.saveJobs();
        return true;
    }
    async processQueue() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        const jobId = this.queue.shift();
        if (!jobId) {
            this.processing = false;
            return;
        }
        const job = this.jobs.get(jobId);
        if (!job) {
            this.processing = false;
            return;
        }
        try {
            job.status = 'running';
            this.addLog(job.id, 'Job started');
            this.saveJobs();
            const result = await this.worker(job);
            job.status = 'completed';
            job.result = result;
            job.completedAt = new Date().toISOString();
            this.addLog(job.id, 'Job completed successfully');
        }
        catch (error) {
            // Check if this is an approval pause - don't mark as failed
            if (error.name === 'ApprovalRequiredError' || job.status === 'waiting_approval') {
                this.addLog(job.id, 'Job paused - waiting for approval');
                // Status is already set to waiting_approval by requestApproval()
            }
            else {
                job.status = 'failed';
                job.result = { error: error.message };
                job.completedAt = new Date().toISOString();
                this.addLog(job.id, `Job failed: ${error.message}`);
            }
        }
        finally {
            this.saveJobs();
            this.processing = false;
        }
    }
}
exports.JobManager = JobManager;
