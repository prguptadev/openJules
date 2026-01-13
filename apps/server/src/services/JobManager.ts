import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';

export interface Job {
  id: string;
  type: string;
  payload: any;
  status: JobStatus;
  result?: any;
  logs: string[];
  createdAt: string; // Changed to string for JSON serialization
}

const JOBS_FILE = path.join(os.homedir(), '.openjules', 'jobs.json');

export class JobManager {
  private jobs: Map<string, Job> = new Map();
  private processing: boolean = false;

  // Simple in-memory FIFO queue
  private queue: string[] = [];

  constructor(private worker: (job: Job) => Promise<any>) {
    this.loadJobs();
    // Start the worker loop
    setInterval(() => this.processQueue(), 1000);
  }

  private loadJobs() {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
        for (const job of data) {
          this.jobs.set(job.id, job);
          // If job was running when server stopped, mark as failed
          if (job.status === 'running') {
            job.status = 'failed';
            job.logs.push(`[${new Date().toISOString()}] Job terminated unexpectedly (server restart)`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  }

  private saveJobs() {
    try {
      const data = Array.from(this.jobs.values());
      const dir = path.dirname(JOBS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save jobs:', error);
    }
  }

  createJob(type: string, payload: any): Job {
    const id = uuidv4();
    const job: Job = {
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

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  addLog(id: string, message: string) {
    const job = this.getJob(id);
    if (job) {
      job.logs.push(`[${new Date().toISOString()}] ${message}`);
      this.saveJobs();
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

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
    } catch (error: any) {
      job.status = 'failed';
      job.result = { error: error.message };
      this.addLog(job.id, `Job failed: ${error.message}`);
    } finally {
      this.saveJobs();
      this.processing = false;
    }
  }
}
