import axios from 'axios';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

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
  githubUser: GitHubUser | null;
  selectedRepo: SelectedRepo | null;
  selectedBranch: string | null;
  status: 'idle' | 'cloning' | 'ready' | 'error';
  statusMessage?: string;
  agentsConfig?: string;
  createdAt: string;
  lastActiveAt: string;
}

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

// API Functions
export const sessionApi = {
  getGitHubStatus: async () => {
    const res = await axios.get('/api/github/status');
    return res.data as { configured: boolean; message: string };
  },

  startOAuthFlow: async (redirectUrl?: string) => {
    const params = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
    const res = await axios.get(`/api/github/auth${params}`);
    return res.data as { authUrl: string };
  },

  getSession: async (sessionId: string) => {
    const res = await axios.get(`/api/sessions/${sessionId}`);
    return res.data as Session;
  },

  listRepos: async (sessionId: string) => {
    const res = await axios.get(`/api/sessions/${sessionId}/repos`);
    return res.data as GitHubRepo[];
  },

  listBranches: async (sessionId: string, owner: string, repo: string) => {
    const res = await axios.get(`/api/sessions/${sessionId}/repos/${owner}/${repo}/branches`);
    return res.data as GitHubBranch[];
  },

  selectRepo: async (sessionId: string, repoId: number, branch?: string) => {
    const res = await axios.post(`/api/sessions/${sessionId}/select-repo`, { repoId, branch });
    return res.data as Session;
  },

  changeBranch: async (sessionId: string, branch: string) => {
    const res = await axios.post(`/api/sessions/${sessionId}/change-branch`, { branch });
    return res.data as Session;
  },

  submitTask: async (sessionId: string, command: string) => {
    const res = await axios.post(`/api/sessions/${sessionId}/tasks`, { command });
    return res.data as { jobId: string; status: string; message: string; repo: string; branch: string };
  },

  deleteSession: async (sessionId: string) => {
    const res = await axios.delete(`/api/sessions/${sessionId}`);
    return res.data;
  },
};
