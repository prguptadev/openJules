import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';

export interface Job {
  id: string;
  type: string;
  payload: any;
  status: JobStatus;
  result?: any;
  logs: string[];
  createdAt: Date;
}

export class JobManager {
  private jobs: Map<string, Job> = new Map();
  private processing: boolean = false;

  // Simple in-memory FIFO queue
  private queue: string[] = [];

  constructor(private worker: (job: Job) => Promise<any>) {
    // Start the worker loop
    setInterval(() => this.processQueue(), 1000);
  }

  createJob(type: string, payload: any): Job {
    const id = uuidv4();
    const job: Job = {
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

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  addLog(id: string, message: string) {
    const job = this.getJob(id);
    if (job) {
      job.logs.push(`[${new Date().toISOString()}] ${message}`);
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
      
      const result = await this.worker(job);
      
      job.status = 'completed';
      job.result = result;
      this.addLog(job.id, 'Job completed successfully');
    } catch (error: any) {
      job.status = 'failed';
      job.result = { error: error.message };
      this.addLog(job.id, `Job failed: ${error.message}`);
    } finally {
      this.processing = false;
    }
  }
}
