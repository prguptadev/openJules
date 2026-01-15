import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_approval';

export type MessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thinking' | 'system' | 'approval_request';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: {
    toolName?: string;
    toolArgs?: any;
    exitCode?: number;
    approvalId?: string;
    isApproved?: boolean;
  };
}

export interface ApprovalRequest {
  id: string;
  jobId: string;
  command: string;
  reason: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Job {
  id: string;
  type: string;
  payload: any;
  status: JobStatus;
  result?: any;
  logs: string[];
  messages: ChatMessage[];
  pendingApproval?: ApprovalRequest;
  pendingToolCalls?: any[]; // Store tool calls waiting for approval
  turnCount?: number; // Store current turn for resumption
  createdAt: string;
  completedAt?: string;
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

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getActiveJobs(): Job[] {
    return Array.from(this.jobs.values()).filter(
      job => job.status === 'pending' || job.status === 'running' || job.status === 'waiting_approval'
    );
  }

  getCompletedJobs(): Job[] {
    return Array.from(this.jobs.values()).filter(
      job => job.status === 'completed' || job.status === 'failed'
    );
  }

  addLog(id: string, message: string) {
    const job = this.getJob(id);
    if (job) {
      job.logs.push(`[${new Date().toISOString()}] ${message}`);
      this.saveJobs();
    }
  }

  addMessage(id: string, message: Omit<ChatMessage, 'id' | 'timestamp'>, existingJob?: Job) {
    const job = existingJob || this.getJob(id);
    if (job) {
      const chatMessage: ChatMessage = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        ...message,
      };
      job.messages.push(chatMessage);
      if (!existingJob) {
        this.saveJobs();
      }
    }
  }

  requestApproval(jobId: string, command: string, reason: string, toolCalls?: any[], turnCount?: number): ApprovalRequest {
    const job = this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const approval: ApprovalRequest = {
      id: uuidv4(),
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

  getPendingToolCalls(jobId: string): any[] | undefined {
    const job = this.getJob(jobId);
    return job?.pendingToolCalls;
  }

  getTurnCount(jobId: string): number | undefined {
    const job = this.getJob(jobId);
    return job?.turnCount;
  }

  clearPendingToolCalls(jobId: string): void {
    const job = this.getJob(jobId);
    if (job) {
      job.pendingToolCalls = undefined;
      this.saveJobs();
    }
  }

  resolveApproval(jobId: string, approvalId: string, approved: boolean): boolean {
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
    } else {
      job.status = 'failed';
      job.result = { error: 'Command rejected by user' };
      job.completedAt = new Date().toISOString();
    }

    job.pendingApproval = undefined;
    this.saveJobs();
    return true;
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
      job.completedAt = new Date().toISOString();
      this.addLog(job.id, 'Job completed successfully');
    } catch (error: any) {
      // Check if this is an approval pause - don't mark as failed
      if (error.name === 'ApprovalRequiredError' || job.status === 'waiting_approval') {
        this.addLog(job.id, 'Job paused - waiting for approval');
        // Status is already set to waiting_approval by requestApproval()
      } else {
        job.status = 'failed';
        job.result = { error: error.message };
        job.completedAt = new Date().toISOString();
        this.addLog(job.id, `Job failed: ${error.message}`);
      }
    } finally {
      this.saveJobs();
      this.processing = false;
    }
  }
}
