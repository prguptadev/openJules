import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Clock, ArrowRight, Play, CheckCircle, AlertCircle, ShieldAlert, Loader2 } from 'lucide-react';

interface Task {
  id: string;
  status: string;
  payload: { command: string };
  createdAt: string;
  pendingApproval?: { id: string };
}

function TaskCard({ task }: { task: Task }) {
  const statusConfig: Record<string, { dot: string; icon: React.ReactNode }> = {
    completed: {
      dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
      icon: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
    },
    running: {
      dot: "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.4)]",
      icon: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
    },
    pending: {
      dot: "bg-gray-600",
      icon: <Clock className="h-3.5 w-3.5 text-gray-400" />,
    },
    failed: {
      dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]",
      icon: <AlertCircle className="h-3.5 w-3.5 text-rose-400" />,
    },
    waiting_approval: {
      dot: "bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.4)]",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-yellow-400" />,
    },
  };

  const config = statusConfig[task.status] || statusConfig.pending;

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="group block bg-[#111] hover:bg-[#161616] border border-[#222] hover:border-[#333] rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={cn("mt-1 w-2 h-2 rounded-full flex-shrink-0", config.dot)} />
          <div className="min-w-0">
            <div className="font-medium text-gray-200 group-hover:text-indigo-300 transition-colors line-clamp-1">
              {task.payload.command}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs font-mono text-gray-600 bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-[#222]">
                {task.id.slice(0, 6)}
              </span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.createdAt).toLocaleTimeString()}
              </span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                {config.icon}
                {task.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 flex-shrink-0">
          <ArrowRight className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}

export function TaskList() {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await axios.get('/api/tasks');
      return res.data as Task[];
    },
    refetchInterval: 2000
  });

  if (isLoading) return <div className="p-8 text-center text-gray-600">Loading tasks...</div>;

  const activeTasks = tasks?.filter(t =>
    t.status === 'pending' || t.status === 'running' || t.status === 'waiting_approval'
  ) || [];

  const historyTasks = tasks?.filter(t =>
    t.status === 'completed' || t.status === 'failed'
  ) || [];

  return (
    <div className="space-y-8">
      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <Play className="h-4 w-4" />
              Active Tasks
            </h2>
            <span className="text-xs text-gray-600">{activeTasks.length} running</span>
          </div>

          <div className="grid gap-3">
            {activeTasks.slice().reverse().map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">History</h2>
          <span className="text-xs text-gray-600">{historyTasks.length} completed</span>
        </div>

        {historyTasks.length === 0 ? (
          <div className="text-center text-gray-600 py-8 bg-[#111] rounded-xl border border-[#222]">
            No completed tasks yet
          </div>
        ) : (
          <div className="grid gap-3">
            {historyTasks.slice().reverse().map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
