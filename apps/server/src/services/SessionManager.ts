/**
 * SessionManager - Manages user sessions with repo context
 * Supports: GitHub OAuth, HTTPS+PAT, SSH key cloning
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitHubRepo, encryptToken, decryptToken, githubService } from './GitHubService.js';
import prisma from './PrismaService.js';

const execAsync = promisify(exec);

// Storage paths
const WORKSPACES_DIR = path.join(os.homedir(), '.openjules', 'workspaces');
const SSH_KEYS_DIR = path.join(os.homedir(), '.openjules', 'ssh');

// Ensure directories exist
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}
if (!fs.existsSync(SSH_KEYS_DIR)) {
  fs.mkdirSync(SSH_KEYS_DIR, { recursive: true });
}

// Clone method types
export type CloneMethod = 'oauth' | 'https' | 'ssh';
export type CredentialType = 'pat' | 'ssh_key' | null;

// Interface for URL-based cloning
export interface CloneByUrlParams {
  url: string;
  authType: 'none' | 'pat' | 'ssh';
  credential?: string; // PAT or SSH key content
}

/**
 * Parse Git URL to extract owner and repo name
 * Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git
 */
function parseGitUrl(url: string): { owner: string; name: string; fullName: string; isSSH: boolean } | null {
  // HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/\.]+)(\.git)?/);
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const name = httpsMatch[2];
    return { owner, name, fullName: `${owner}/${name}`, isSSH: false };
  }

  // SSH format: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = url.match(/git@[^:]+:([^\/]+)\/([^\/\.]+)(\.git)?/);
  if (sshMatch) {
    const owner = sshMatch[1];
    const name = sshMatch[2];
    return { owner, name, fullName: `${owner}/${name}`, isSSH: true };
  }

  // Try generic format: owner/repo
  const simpleMatch = url.match(/^([^\/]+)\/([^\/]+)$/);
  if (simpleMatch) {
    const owner = simpleMatch[1];
    const name = simpleMatch[2];
    return { owner, name, fullName: `${owner}/${name}`, isSSH: false };
  }

  return null;
}

export class SessionManager {
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true }
    });
    
    if (!session) return null;

    // Map Prisma model to expected format if needed
    return {
      ...session,
      githubUser: null, // We might need to store this in DB if we want it persistent
      selectedRepo: {
        id: 0, // Placeholder, or store real ID in DB
        name: session.repoName,
        fullName: session.repoFullName,
        owner: session.repoOwner,
        defaultBranch: 'main', // TODO: Store in DB
        cloneUrl: '', // TODO: Store in DB or reconstruct
        private: session.isPrivate,
      },
      selectedBranch: session.branch,
    };
  }

  /**
   * Create or Get Session for User/Repo
   * This implements the "One session per repo per user" rule
   */
  async getOrCreateSession(userId: string, repo: GitHubRepo, githubToken: string) {
    // Check if session exists
    let session = await prisma.session.findFirst({
      where: {
        userId,
        repoFullName: repo.fullName,
      }
    });

    if (session) {
      // Update token if needed
      return session;
    }

    // Create new session
    const sessionId = uuidv4();
    const workspacePath = path.join(WORKSPACES_DIR, userId, repo.name); // Readable path

    // Create workspace directory
    fs.mkdirSync(workspacePath, { recursive: true });

    session = await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoFullName: repo.fullName,
        branch: repo.defaultBranch,
        isPrivate: repo.private,
        githubToken: encryptToken(githubToken),
        workspacePath,
        status: 'idle',
      }
    });

    // Trigger clone immediately? Or wait for select?
    // User flow: Login -> Dashboard -> Select Repo -> (Clone/Resume)
    
    return session;
  }

  /**
   * List sessions for a user
   */
  async listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' }
    });
  }

  /**
   * Select/Switch to a repository (Session)
   * If it doesn't exist, create it.
   */
  async selectRepo(userId: string, repo: GitHubRepo, githubToken: string): Promise<any> {
    let session = await this.getOrCreateSession(userId, repo, githubToken);

    // Update status to cloning if folder empty?
    const gitDir = path.join(session.workspacePath, '.git');
    if (!fs.existsSync(gitDir)) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'cloning', statusMessage: 'Repository cloning started...' }
      });
      
      // Trigger clone in background
      this.cloneRepo(session.id, repo.cloneUrl, githubToken).catch(console.error);
    } else {
        await prisma.session.update({
            where: { id: session.id },
            data: { status: 'ready', statusMessage: 'Ready', lastActiveAt: new Date() }
        });
    }

    return this.getSession(session.id);
  }

  /**
   * Clone repository
   */
  private async cloneRepo(sessionId: string, cloneUrl: string, token: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    let authCloneUrl = cloneUrl;
    if (session.isPrivate) {
      authCloneUrl = githubService.getAuthenticatedCloneUrl(cloneUrl, token);
    }

    try {
      // Clear dir just in case
      if (fs.existsSync(session.workspacePath)) {
         // Don't delete if it exists? We check .git before calling this.
         // But if we are forcing a clone, we should maybe clean.
         // For now, assume empty or partial.
      }

      await execAsync(`git clone --single-branch ${authCloneUrl} .`, {
        cwd: session.workspacePath,
        env: { ...process.env, GITHUB_TOKEN: token },
        maxBuffer: 1024 * 1024 * 10,
      });

      // Detect branch
      const { stdout } = await execAsync(`git rev-parse --abbrev-ref HEAD`, { cwd: session.workspacePath });
      const branch = stdout.trim();

      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'ready', statusMessage: 'Ready', branch }
      });

    } catch (error: any) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'error', statusMessage: error.message }
      });
    }
  }

  /**
   * Change branch
   */
  async changeBranch(sessionId: string, branch: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');

    // ... git checkout logic ...
    // Simplified for brevity, reusing the execAsync pattern
    try {
        await execAsync(`git fetch origin ${branch}`, { cwd: session.workspacePath });
        await execAsync(`git checkout ${branch}`, { cwd: session.workspacePath });
        
        return prisma.session.update({
            where: { id: sessionId },
            data: { branch, lastActiveAt: new Date() }
        });
    } catch (e: any) {
        throw new Error(`Failed to checkout ${branch}: ${e.message}`);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      if (fs.existsSync(session.workspacePath)) {
        fs.rmSync(session.workspacePath, { recursive: true, force: true });
      }
      await prisma.session.delete({ where: { id: sessionId } });
      return true;
    }
    return false;
  }
  
  async getRepoPath(sessionId: string) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      return session?.workspacePath || null;
  }

  /**
   * Get decrypted GitHub token for a session
   */
  async getGitHubToken(sessionId: string): Promise<string | null> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || !session.githubToken) {
      return null;
    }
    try {
      return decryptToken(session.githubToken);
    } catch {
      return null;
    }
  }

  /**
   * Update session activity timestamp
   */
  async touchSession(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() }
      });
    }
  }

  /**
   * Clone repository by URL (without GitHub OAuth)
   * Supports: public repos, HTTPS+PAT, SSH key
   */
  async cloneByUrl(userId: string, params: CloneByUrlParams): Promise<any> {
    const { url, authType, credential } = params;

    // Parse URL to extract repo info
    const parsed = parseGitUrl(url);
    if (!parsed) {
      throw new Error('Invalid Git URL. Supported formats: https://github.com/owner/repo or git@github.com:owner/repo');
    }

    const { owner, name, fullName, isSSH } = parsed;

    // Validate auth type matches URL format
    if (isSSH && authType !== 'ssh') {
      throw new Error('SSH URL requires SSH key authentication');
    }
    if (authType === 'ssh' && !isSSH) {
      throw new Error('SSH key authentication requires SSH URL format (git@...)');
    }

    // Check for existing session
    let existingSession = await prisma.session.findFirst({
      where: { userId, repoFullName: fullName }
    });

    if (existingSession) {
      // Return existing session
      return this.getSession(existingSession.id);
    }

    // Prepare clone method and credentials
    const cloneMethod: CloneMethod = authType === 'ssh' ? 'ssh' : 'https';
    const credentialType: CredentialType = authType === 'pat' ? 'pat' : authType === 'ssh' ? 'ssh_key' : null;
    let encryptedCredential: string | null = null;
    let sshKeyPath: string | null = null;

    // Handle credentials
    if (authType === 'pat' && credential) {
      encryptedCredential = encryptToken(credential);
    } else if (authType === 'ssh' && credential) {
      // Store SSH key to file
      const keyId = uuidv4();
      const userSshDir = path.join(SSH_KEYS_DIR, userId);
      if (!fs.existsSync(userSshDir)) {
        fs.mkdirSync(userSshDir, { recursive: true });
      }
      sshKeyPath = path.join(userSshDir, `${keyId}.pem`);
      fs.writeFileSync(sshKeyPath, credential, { mode: 0o600 });
      encryptedCredential = sshKeyPath; // Store path reference
    }

    // Create session
    const sessionId = uuidv4();
    const workspacePath = path.join(WORKSPACES_DIR, userId, name);
    fs.mkdirSync(workspacePath, { recursive: true });

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        repoOwner: owner,
        repoName: name,
        repoFullName: fullName,
        repoUrl: url,
        branch: 'main', // Will be detected after clone
        isPrivate: authType !== 'none',
        cloneMethod,
        credentialType,
        encryptedCredential,
        workspacePath,
        status: 'cloning',
        statusMessage: 'Repository cloning started...',
      }
    });

    // Trigger clone in background
    this.cloneRepoByUrl(sessionId, url, authType, credential).catch(console.error);

    return this.getSession(sessionId);
  }

  /**
   * Clone repository using URL-based authentication
   */
  private async cloneRepoByUrl(
    sessionId: string,
    url: string,
    authType: 'none' | 'pat' | 'ssh',
    credential?: string
  ): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    try {
      let cloneCommand: string;
      let cloneEnv = { ...process.env };

      if (authType === 'pat' && credential) {
        // HTTPS with PAT: inject token into URL
        const urlObj = new URL(url.endsWith('.git') ? url : `${url}.git`);
        urlObj.username = 'oauth2';
        urlObj.password = credential;
        cloneCommand = `git clone --single-branch "${urlObj.toString()}" .`;
      } else if (authType === 'ssh' && session.encryptedCredential) {
        // SSH with key: use GIT_SSH_COMMAND
        const sshKeyPath = session.encryptedCredential;
        cloneEnv.GIT_SSH_COMMAND = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no`;
        cloneCommand = `git clone --single-branch "${url}" .`;
      } else {
        // Public repo: direct clone
        cloneCommand = `git clone --single-branch "${url}" .`;
      }

      await execAsync(cloneCommand, {
        cwd: session.workspacePath,
        env: cloneEnv,
        maxBuffer: 1024 * 1024 * 10,
      });

      // Detect branch
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: session.workspacePath });
      const branch = stdout.trim();

      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'ready', statusMessage: 'Ready', branch }
      });

    } catch (error: any) {
      console.error(`Clone failed for session ${sessionId}:`, error.message);
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'error', statusMessage: error.message }
      });
    }
  }

  /**
   * Get credential for a session (for re-cloning or fetching)
   */
  async getCredential(sessionId: string): Promise<{ type: CredentialType; value: string | null }> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return { type: null, value: null };
    }

    if (session.cloneMethod === 'oauth' && session.githubToken) {
      return { type: 'pat', value: decryptToken(session.githubToken) };
    }

    if (session.credentialType === 'pat' && session.encryptedCredential) {
      return { type: 'pat', value: decryptToken(session.encryptedCredential) };
    }

    if (session.credentialType === 'ssh_key' && session.encryptedCredential) {
      return { type: 'ssh_key', value: session.encryptedCredential }; // Path to key
    }

    return { type: null, value: null };
  }
}

export const sessionManager = new SessionManager();
