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
            createdAt: new Date().toISOString()
        };
        this.jobs.set(id, job);
        this.queue.push(id);
        this.saveJobs();
        return job;
    }
    getJob(id) {
        return this.jobs.get(id);
    }
    addLog(id, message) {
        const job = this.getJob(id);
        if (job) {
            job.logs.push(`[${new Date().toISOString()}] ${message}`);
            this.saveJobs();
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
            this.saveJobs();
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
            this.saveJobs();
            this.processing = false;
        }
    }
}
exports.JobManager = JobManager;
