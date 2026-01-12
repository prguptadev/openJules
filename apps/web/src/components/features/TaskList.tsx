import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Clock, ArrowRight } from 'lucide-react';

export function TaskList() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await axios.get('/api/tasks');
      return res.data;
    },
    refetchInterval: 2000
  });

  if (isLoading) return <div className="p-8 text-center text-gray-600">Loading tasks...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Tasks</h2>
        <span className="text-xs text-gray-600">{tasks?.length || 0} Total</span>
      </div>
      
      <div className="grid gap-3">
        {tasks?.slice().reverse().map((task: any) => (
          <Link 
            key={task.id} 
            to={`/tasks/${task.id}`}
            className="group block bg-[#111] hover:bg-[#161616] border border-[#222] hover:border-[#333] rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-1 w-2 h-2 rounded-full",
                  task.status === 'completed' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
                  task.status === 'running' ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.4)]" :
                  task.status === 'failed' ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" :
                  "bg-gray-600"
                )} />
                <div>
                  <div className="font-medium text-gray-200 group-hover:text-indigo-300 transition-colors line-clamp-1">{task.payload.command}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs font-mono text-gray-600 bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#222]">
                      {task.id.slice(0, 6)}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(task.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500">
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
