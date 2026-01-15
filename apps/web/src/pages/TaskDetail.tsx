import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Terminal as TerminalIcon,
  MessageSquare,
  CheckCircle,
  Clock,
  Play,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { LogViewer } from '../components/features/LogViewer';
import { ChatView } from '../components/features/ChatView';
import { cn } from '../lib/utils';

export default function TaskDetail() {
  const { taskId } = useParams();
  const [activeTab, setActiveTab] = useState<'chat' | 'logs'>('chat');

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
  const isWaitingApproval = task.status === 'waiting_approval';

  const statusConfig = {
    completed: { bg: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50', icon: <CheckCircle className="h-4 w-4" /> },
    running: { bg: 'bg-indigo-950/30 text-indigo-400 border-indigo-900/50 animate-pulse', icon: <Play className="h-4 w-4" /> },
    pending: { bg: 'bg-gray-800 text-gray-400 border-gray-700', icon: <Clock className="h-4 w-4" /> },
    failed: { bg: 'bg-rose-950/30 text-rose-400 border-rose-900/50', icon: <AlertCircle className="h-4 w-4" /> },
    waiting_approval: { bg: 'bg-yellow-950/30 text-yellow-400 border-yellow-900/50 animate-pulse', icon: <ShieldAlert className="h-4 w-4" /> },
  };

  const currentStatus = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-16 border-b border-[#222] bg-[#0F0F0F] flex items-center px-6 justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center border border-[#333]">
            {currentStatus.icon}
          </div>
          <div>
            <h1 className="font-semibold text-gray-200 line-clamp-1 max-w-md">{task.payload.command}</h1>
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

        <div className={cn("px-3 py-1 rounded-full text-xs font-medium border uppercase tracking-wider flex items-center gap-1.5", currentStatus.bg)}>
          {task.status.replace('_', ' ')}
        </div>
      </header>

      {/* Tab Bar */}
      <div className="h-12 border-b border-[#222] bg-[#0F0F0F] flex items-center px-6 gap-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            activeTab === 'chat'
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
          {isWaitingApproval && (
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            activeTab === 'logs'
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <TerminalIcon className="h-4 w-4" />
          Terminal
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden bg-[#0A0A0A] p-6">
        {activeTab === 'chat' ? (
          <ChatView
            jobId={task.id}
            messages={task.messages || []}
            pendingApproval={task.pendingApproval}
            isRunning={isRunning}
            className="h-full"
          />
        ) : (
          <LogViewer logs={task.logs || []} isLoading={isRunning} className="h-full" />
        )}
      </div>
    </div>
  );
}