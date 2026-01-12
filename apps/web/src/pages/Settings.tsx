import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, CheckCircle, Loader2 } from 'lucide-react';

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
    </div>
  );
}
