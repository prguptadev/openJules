import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Terminal as TerminalIcon, 
  BrainCircuit,
  CheckCircle,
  Clock,
  Play
} from 'lucide-react';
import { LogViewer } from '../components/features/LogViewer';
import { cn } from '../lib/utils';

export default function TaskDetail() {
  const { taskId } = useParams();

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await axios.get(`/api/tasks/${taskId}`);
      return res.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'completed' || status === 'failed') ? false : 1000;
    }
  });

  if (isLoading) return <div className="h-full flex items-center justify-center text-gray-500">Loading Task...</div>;
  if (!task) return <div className="h-full flex items-center justify-center text-gray-500">Task Not Found</div>;

  const isRunning = task.status === 'running' || task.status === 'pending';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-16 border-b border-[#222] bg-[#0F0F0F] flex items-center px-6 justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center border border-[#333]">
            {isRunning ? <Play className="h-4 w-4 text-indigo-400" /> : <CheckCircle className="h-4 w-4 text-emerald-400" />}
          </div>
          <div>
            <h1 className="font-semibold text-gray-200 line-clamp-1">{task.payload.command}</h1>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 font-mono">
              <span>ID: {task.id.slice(0, 8)}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(task.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
        
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-medium border uppercase tracking-wider",
          task.status === 'completed' ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/50" :
          task.status === 'running' ? "bg-indigo-950/30 text-indigo-400 border-indigo-900/50 animate-pulse" :
          task.status === 'failed' ? "bg-rose-950/30 text-rose-400 border-rose-900/50" :
          "bg-gray-800 text-gray-400 border-gray-700"
        )}>
          {task.status}
        </div>
      </header>

      {/* Main Content (Split View) */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
        {/* Left Pane: Mind Map / Plan (Placeholder for now) */}
        <div className="bg-[#0A0A0A] p-6 border-r border-[#222] flex flex-col">
          <div className="flex items-center gap-2 mb-6 text-gray-400 text-sm font-medium uppercase tracking-wider">
            <BrainCircuit className="h-4 w-4 text-indigo-500" />
            Execution Plan
          </div>
          
          <div className="flex-1 border-2 border-dashed border-[#222] rounded-xl flex items-center justify-center text-gray-600 bg-[#0F0F0F]">
            <div className="text-center">
              <BrainCircuit className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Mind Map Visualization</p>
              <p className="text-xs mt-1 opacity-50">Coming in Phase 3</p>
            </div>
          </div>
        </div>

        {/* Right Pane: Logs & Output */}
        <div className="bg-[#0A0A0A] p-6 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-4 text-gray-400 text-sm font-medium uppercase tracking-wider">
            <TerminalIcon className="h-4 w-4 text-emerald-500" />
            Live Logs
          </div>
          <div className="flex-1 min-h-0">
            <LogViewer logs={task.logs} isLoading={isRunning} />
          </div>
        </div>
      </div>
    </div>
  );
}