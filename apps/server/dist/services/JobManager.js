"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobManager = void 0;
const uuid_1 = require("uuid");
class JobManager {
    worker;
    jobs = new Map();
    processing = false;
    // Simple in-memory FIFO queue
    queue = [];
    constructor(worker) {
        this.worker = worker;
        // Start the worker loop
        setInterval(() => this.processQueue(), 1000);
    }
    createJob(type, payload) {
        const id = (0, uuid_1.v4)();
        const job = {
            id,
            type,
            payload,
            status: 'pending',
            logs: [],
            createdAt: new Date()
        };
        this.jobs.set(id, job);
        this.queue.push(id);
        return job;
    }
    getJob(id) {
        return this.jobs.get(id);
    }
    addLog(id, message) {
        const job = this.getJob(id);
        if (job) {
            job.logs.push(`[${new Date().toISOString()}] ${message}`);
        }
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
            const result = await this.worker(job);
            job.status = 'completed';
            job.result = result;
            this.addLog(job.id, 'Job completed successfully');
        }
        catch (error) {
            job.status = 'failed';
            job.result = { error: error.message };
            this.addLog(job.id, `Job failed: ${error.message}`);
        }
        finally {
            this.processing = false;
        }
    }
}
exports.JobManager = JobManager;
