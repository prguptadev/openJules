/**
 * SessionManager - Manages user sessions with repo context
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitHubRepo, encryptToken, decryptToken, githubService } from './GitHubService.js';

const execAsync = promisify(exec);

export interface SelectedRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  cloneUrl: string;
  private: boolean;
}

export interface Session {
  id: string;
  userId: string;
  githubToken: string;           // Encrypted
  githubUser: {
    login: string;
    name: string | null;
    avatarUrl: string;
  } | null;
  selectedRepo: SelectedRepo | null;
  selectedBranch: string | null;
  workspacePath: string;
  status: 'idle' | 'cloning' | 'ready' | 'error';
  statusMessage?: string;
  agentsConfig?: string;         // Contents of AGENTS.md if exists
  createdAt: string;
  lastActiveAt: string;
}

// Sessions storage path
const SESSIONS_DIR = path.join(os.homedir(), '.openjules', 'sessions');
const SESSIONS_FILE = path.join(os.homedir(), '.openjules', 'sessions.json');
const WORKSPACES_DIR = path.join(os.homedir(), '.openjules', 'workspaces');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    ensureDirectories();
    this.loadSessions();
  }

  /**
   * Load sessions from disk
   */
  private loadSessions() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
        for (const session of data) {
          this.sessions.set(session.id, session);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  /**
   * Save sessions to disk
   */
  private saveSessions() {
    try {
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  /**
   * Create a new session
   */
  createSession(userId: string, githubToken: string, githubUser: { login: string; name: string | null; avatarUrl: string }): Session {
    const sessionId = uuidv4();
    const workspacePath = path.join(WORKSPACES_DIR, sessionId);

    const session: Session = {
      id: sessionId,
      userId,
      githubToken: encryptToken(githubToken),
      githubUser,
      selectedRepo: null,
      selectedBranch: null,
      workspacePath,
      status: 'idle',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    // Create workspace directory
    fs.mkdirSync(workspacePath, { recursive: true });

    this.sessions.set(sessionId, session);
    this.saveSessions();

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get session by user ID (for single-session per user model)
   */
  getSessionByUserId(userId: string): Session | null {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Get or create session for user
   */
  getOrCreateSession(userId: string, githubToken: string, githubUser: { login: string; name: string | null; avatarUrl: string }): Session {
    const existing = this.getSessionByUserId(userId);
    if (existing) {
      // Update token if changed
      existing.githubToken = encryptToken(githubToken);
      existing.githubUser = githubUser;
      existing.lastActiveAt = new Date().toISOString();
      this.saveSessions();
      return existing;
    }
    return this.createSession(userId, githubToken, githubUser);
  }

  /**
   * Select a repository for the session
   */
  async selectRepo(sessionId: string, repo: GitHubRepo, branch?: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update session
    session.selectedRepo = {
      id: repo.id,
      name: repo.name,
      fullName: repo.fullName,
      owner: repo.owner,
      defaultBranch: repo.defaultBranch,
      cloneUrl: repo.cloneUrl,
      private: repo.private,
    };
    session.selectedBranch = branch || null; // Use null to signify "use remote default"
    session.status = 'cloning';
    session.statusMessage = 'Repository cloning started...';
    session.lastActiveAt = new Date().toISOString();
    this.saveSessions();

    // Clone the repository in background
    this.cloneRepo(sessionId).catch(error => {
      console.error('Clone error:', error);
      session.status = 'error';
      session.statusMessage = error.message;
      this.saveSessions();
    });

    return session;
  }

  /**
   * Clone repository to session workspace
   */
  private async cloneRepo(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.selectedRepo) {
      throw new Error('Session or repo not found');
    }

    const token = decryptToken(session.githubToken);
    const repoPath = path.join(session.workspacePath, session.selectedRepo.name);

    // Clean up existing repo if present
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    // Get authenticated clone URL for private repos
    let cloneUrl = session.selectedRepo.cloneUrl;
    if (session.selectedRepo.private) {
      cloneUrl = githubService.getAuthenticatedCloneUrl(cloneUrl, token);
    }

    // Clone the repository
    try {
      // If a specific branch was requested, use --branch. Otherwise let git pick default.
      const branchArg = session.selectedBranch ? `--branch ${session.selectedBranch} ` : '';
      
      await execAsync(`git clone ${branchArg}--single-branch ${cloneUrl} ${repoPath}`, {
        cwd: session.workspacePath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GITHUB_TOKEN: token,
          GH_TOKEN: token,
        },
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      // Detect the branch we actually got if we didn't specify one
      if (!session.selectedBranch) {
        const { stdout } = await execAsync(`git rev-parse --abbrev-ref HEAD`, {
          cwd: repoPath,
        });
        session.selectedBranch = stdout.trim();
      }

      // Check for AGENTS.md
      const agentsMdPath = path.join(repoPath, 'AGENTS.md');
      if (fs.existsSync(agentsMdPath)) {
        session.agentsConfig = fs.readFileSync(agentsMdPath, 'utf-8');
      }

      session.status = 'ready';
      session.statusMessage = 'Repository ready';
      this.saveSessions();
    } catch (error: any) {
      session.status = 'error';
      session.statusMessage = `Clone failed: ${error.message}`;
      this.saveSessions();
      throw error;
    }
  }

  /**
   * Change branch for current session
   */
  async changeBranch(sessionId: string, branch: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.selectedRepo) {
      throw new Error('Session or repo not found');
    }

    const repoPath = path.join(session.workspacePath, session.selectedRepo.name);
    if (!fs.existsSync(repoPath)) {
      throw new Error('Repository not cloned');
    }

    const token = decryptToken(session.githubToken);

    // Checkout the branch
    try {
      // First try to fetch the specific branch to ensure we have the latest refs
      // We explicitly fetch into refs/remotes/origin/<branch> because single-branch clones
      // do not update other remote refs by default.
      await execAsync(`git fetch origin ${branch}:refs/remotes/origin/${branch}`, {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GITHUB_TOKEN: token,
          GH_TOKEN: token,
        },
        maxBuffer: 1024 * 1024 * 10,
      });

      // Try checking out. 
      // If local branch exists: git checkout <branch>
      // If only remote exists: git checkout -t origin/<branch> or just git checkout <branch> usually works if unambiguous
      // We'll use a safer approach: checkout -B ensures we reset/create local pointer to match origin
      await execAsync(`git checkout -B ${branch} origin/${branch}`, {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: 1024 * 1024 * 10,
      });

      session.selectedBranch = branch;
      session.lastActiveAt = new Date().toISOString();
      this.saveSessions();

      return session;
    } catch (error: any) {
      // Capture stderr from the error object if available
      const stderr = error.stderr ? error.stderr.toString() : error.message;
      console.error(`Change branch failed: ${stderr}`);
      throw new Error(`Failed to checkout branch '${branch}': ${stderr}`);
    }
  }

  /**
   * Get the repository path for a session
   */
  getRepoPath(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.selectedRepo) {
      return null;
    }
    return path.join(session.workspacePath, session.selectedRepo.name);
  }

  /**
   * Get decrypted GitHub token for a session
   */
  getGitHubToken(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    try {
      return decryptToken(session.githubToken);
    } catch {
      return null;
    }
  }

  /**
   * Delete a session and cleanup workspace
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Cleanup workspace
    if (fs.existsSync(session.workspacePath)) {
      fs.rmSync(session.workspacePath, { recursive: true, force: true });
    }

    this.sessions.delete(sessionId);
    this.saveSessions();
    return true;
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Update session activity timestamp
   */
  touchSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date().toISOString();
      this.saveSessions();
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
