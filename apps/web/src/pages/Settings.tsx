import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, CheckCircle, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

interface AppSettings {
  requireApproval: boolean;
  activeModel: string;
  enabledSkills: {
    git: boolean;
    terminal: boolean;
    filesystem: boolean;
  };
}

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const queryClient = useQueryClient();

  const { data: authStatus, isLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const res = await axios.get('/api/auth/status');
      return res.data;
    }
  });

  // Fetch current settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('/api/settings');
      return res.data as AppSettings;
    }
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<AppSettings>) => {
      return axios.post('/api/settings', newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });

  const saveKey = useMutation({
    mutationFn: async (key: string) => {
      return axios.post('/api/auth', { apiKey: key });
    },
    onSuccess: () => {
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) saveKey.mutate(apiKey);
  };

  return (
    <div className="max-w-3xl mx-auto p-10">
      <h1 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
        <Key className="h-6 w-6 text-indigo-500" />
        Settings
      </h1>

      <div className="bg-[#111] border border-[#222] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">API Configuration</h2>
        
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Status</span>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            ) : authStatus?.configured ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
                <CheckCircle className="h-4 w-4" /> Configured
              </span>
            ) : (
              <span className="text-rose-400 text-sm font-medium">Not Configured</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Gemini API Key</label>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full bg-black border border-[#333] rounded-lg px-4 py-2.5 text-gray-200 focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition-all placeholder:text-gray-700"
            />
            <p className="mt-2 text-xs text-gray-500">
              Your key is stored locally in <code className="bg-[#222] px-1 py-0.5 rounded text-gray-400">~/.openjules/credentials.json</code>
            </p>
          </div>
          
          <button
            type="submit"
            disabled={!apiKey.trim() || saveKey.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saveKey.isPending ? 'Saving...' : 'Save API Key'}
          </button>
        </form>
      </div>

      {/* Approval System Settings */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Agent Behavior</h2>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.requireApproval !== false ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            ) : (
              <ShieldOff className="h-5 w-5 text-yellow-400" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-200">Require Approval for Dangerous Operations</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {settings?.requireApproval !== false
                  ? 'Agent will ask before running shell commands, writing files, or editing code'
                  : 'Agent will execute all operations immediately without asking'}
              </p>
            </div>
          </div>

          <button
            onClick={() => updateSettings.mutate({ requireApproval: !settings?.requireApproval })}
            disabled={settingsLoading || updateSettings.isPending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#111] ${
              settings?.requireApproval !== false ? 'bg-emerald-600' : 'bg-gray-600'
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings?.requireApproval !== false ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings?.requireApproval === false && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs text-yellow-400">
              ⚠️ <strong>Warning:</strong> With approval disabled, the agent can modify files, run commands, and make changes without asking first. Use with caution.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
