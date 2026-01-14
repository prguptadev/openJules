/**
 * GitHubService - Handles GitHub OAuth and API interactions
 */

import axios from 'axios';
import crypto from 'crypto';

// GitHub OAuth URLs
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  language: string | null;
  updatedAt: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  email: string | null;
}

// Simple encryption for tokens (in production, use proper key management)
function getEncryptionKey() {
  return process.env.ENCRYPTION_KEY || 'openjules-default-key-change-me!';
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedToken: string): string {
  const [ivHex, encrypted] = encryptedToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class GitHubService {
  private get clientId() {
    return process.env.GITHUB_CLIENT_ID || '';
  }

  private get clientSecret() {
    return process.env.GITHUB_CLIENT_SECRET || '';
  }

  private get redirectUri() {
    return process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/github/callback';
  }

  constructor() {
    // Environment variables are accessed dynamically
  }

  /**
   * Helper to execute requests with retry logic for transient errors
   */
  private async requestWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isTransient = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || (error.response && error.response.status >= 500);
      if (retries > 0 && isTransient) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  /**
   * Check if GitHub OAuth is configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate the OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'repo read:user',  // repo access + user info
      state: state,
    });
    return `${GITHUB_OAUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await axios.post(GITHUB_TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      redirect_uri: this.redirectUri,
    }, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.data.error) {
      throw new Error(response.data.error_description || response.data.error);
    }

    return response.data.access_token;
  }

  /**
   * Get authenticated user info
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await axios.get(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    return {
      id: response.data.id,
      login: response.data.login,
      name: response.data.name,
      avatarUrl: response.data.avatar_url,
      email: response.data.email,
    };
  }

  /**
   * List repositories the user has access to
   */
  async listRepos(accessToken: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;
    const MAX_PAGES = 10; // Safety limit: fetch max 1000 repos to avoid timeouts

    // Fetch all pages
    while (page <= MAX_PAGES) {
      try {
        const response = await axios.get(`${GITHUB_API_URL}/user/repos`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
          params: {
            per_page: perPage,
            page: page,
            sort: 'updated',
            direction: 'desc',
          },
        });

        for (const repo of response.data) {
          repos.push({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            owner: repo.owner.login,
            description: repo.description,
            private: repo.private,
            defaultBranch: repo.default_branch,
            cloneUrl: repo.clone_url,
            htmlUrl: repo.html_url,
            language: repo.language,
            updatedAt: repo.updated_at,
          });
        }

        // Check if there are more pages
        if (response.data.length < perPage) {
          break;
        }
        page++;
      } catch (error) {
        console.error(`Failed to fetch repos page ${page}:`, error);
        break; // Stop on error but return what we have
      }
    }

    return repos;
  }

  /**
   * Get repository details by ID
   */
  async getRepoById(accessToken: string, repoId: number): Promise<GitHubRepo> {
    const response = await axios.get(`${GITHUB_API_URL}/repositories/${repoId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      owner: response.data.owner.login,
      description: response.data.description,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      cloneUrl: response.data.clone_url,
      htmlUrl: response.data.html_url,
      language: response.data.language,
      updatedAt: response.data.updated_at,
    };
  }

  /**
   * List branches for a repository
   */
  async listBranches(accessToken: string, owner: string, repo: string): Promise<GitHubBranch[]> {
    return this.requestWithRetry(async () => {
      const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/branches`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: {
          per_page: 100,
        },
      });

      return response.data.map((branch: any) => ({
        name: branch.name,
        protected: branch.protected,
      }));
    });
  }

  /**
   * Get repository details
   */
  async getRepo(accessToken: string, owner: string, repo: string): Promise<GitHubRepo> {
    const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      owner: response.data.owner.login,
      description: response.data.description,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      cloneUrl: response.data.clone_url,
      htmlUrl: response.data.html_url,
      language: response.data.language,
      updatedAt: response.data.updated_at,
    };
  }

  /**
   * Get file contents (e.g., AGENTS.md)
   */
  async getFileContent(accessToken: string, owner: string, repo: string, path: string, branch?: string): Promise<string | null> {
    try {
      const response = await axios.get(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: branch ? { ref: branch } : {},
      });

      if (response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Clone URL with token for private repos
   */
  getAuthenticatedCloneUrl(cloneUrl: string, accessToken: string): string {
    // Convert https://github.com/owner/repo.git to https://oauth2:TOKEN@github.com/owner/repo.git
    return cloneUrl.replace('https://github.com', `https://oauth2:${accessToken}@github.com`);
  }
}

// Export singleton instance
export const githubService = new GitHubService();
