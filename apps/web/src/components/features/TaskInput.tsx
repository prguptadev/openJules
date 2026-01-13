import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Send, Sparkles, GitBranch } from 'lucide-react';
import { useSession } from '../../lib/SessionContext';
import { sessionApi } from '../../lib/session';

export function TaskInput() {
  const [command, setCommand] = useState('');
  const queryClient = useQueryClient();
  const { session, sessionId } = useSession();

  const createTask = useMutation({
    mutationFn: async (newCommand: string) => {
      // Use session-scoped API if session is ready
      if (sessionId && session?.status === 'ready') {
        return sessionApi.submitTask(sessionId, newCommand);
      }
      // Fall back to regular API
      return axios.post('/api/tasks', { command: newCommand, cwd: '.' }).then(r => r.data);
    },
    onSuccess: () => {
      setCommand('');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) createTask.mutate(command);
  };

  const isSessionReady = session?.status === 'ready';
  const placeholderText = isSessionReady
    ? `Ask Jules to work on ${session?.selectedRepo?.name}...`
    : 'Describe a task for Jules...';

  return (
    <div className="bg-[#111] border border-[#222] rounded-2xl p-1 shadow-lg shadow-black/50">
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={placeholderText}
          className="w-full bg-transparent text-gray-200 p-4 min-h-[120px] outline-none resize-none placeholder:text-gray-600 text-base"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="flex items-center justify-between px-4 pb-3 border-t border-[#222] pt-3">
          <div className="flex gap-2 items-center">
            <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-[#222] transition-colors flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Enhance Prompt
            </button>
            {isSessionReady && (
              <span className="text-xs text-gray-500 flex items-center gap-1 px-2 py-1 bg-[#1a1a1a] rounded border border-[#333]">
                <GitBranch className="h-3 w-3" />
                {session?.selectedRepo?.fullName}:{session?.selectedBranch}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!command.trim() || createTask.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createTask.isPending ? 'Queuing...' : <>Run Task <Send className="h-3.5 w-3.5" /></>}
          </button>
        </div>
      </form>
    </div>
  );
}
