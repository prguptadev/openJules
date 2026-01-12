import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Activity, Plus, Terminal, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [command, setCommand] = useState('');

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await axios.get('/api/tasks'); // Vite proxy will handle /api
      return res.data;
    },
    refetchInterval: 2000
  });

  const createTask = useMutation({
    mutationFn: async (newCommand: string) => {
      return axios.post('/api/tasks', { command: newCommand, cwd: '.' });
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

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="text-white h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">OpenJules</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* New Task Column */}
        <div className="lg:col-span-1">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sticky top-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-blue-500" />
              New Task
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Instruction</label>
                <textarea 
                  className="w-full h-32 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all resize-none"
                  placeholder="e.g. Analyze the repository structure..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <button 
                disabled={createTask.isPending}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createTask.isPending ? 'Queuing...' : <><Plus className="h-4 w-4" /> Start Task</>}
              </button>
            </form>
          </div>
        </div>

        {/* Task List Column */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-neutral-400" />
            Recent Activity
          </h2>
          
          {isLoading ? (
            <div className="text-neutral-500 animate-pulse">Loading tasks...</div>
          ) : (
            <div className="space-y-3">
              {tasks?.map((task: any) => (
                <Link 
                  key={task.id} 
                  to={`/tasks/${task.id}`}
                  className="block bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide",
                      task.status === 'completed' ? "bg-green-900/30 text-green-400 border border-green-900" :
                      task.status === 'running' ? "bg-blue-900/30 text-blue-400 border border-blue-900 animate-pulse" :
                      task.status === 'failed' ? "bg-red-900/30 text-red-400 border border-red-900" :
                      "bg-neutral-800 text-neutral-400 border border-neutral-700"
                    )}>
                      {task.status}
                    </span>
                    <span className="text-xs text-neutral-500 font-mono">ID: {task.id.slice(0, 8)}</span>
                  </div>
                  <p className="text-neutral-200 font-medium truncate">{task.payload.command}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
                    <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                    {task.logs.length > 0 && <span>{task.logs.length} logs</span>}
                  </div>
                </Link>
              )).reverse()}
              
              {tasks?.length === 0 && (
                <div className="text-center py-12 text-neutral-500 bg-neutral-900/50 rounded-xl border border-dashed border-neutral-800">
                  No tasks found. Start one!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
