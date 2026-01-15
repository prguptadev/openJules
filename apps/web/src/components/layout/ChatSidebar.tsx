import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Terminal,
  Plus,
  Settings,
  GitBranch,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ShieldAlert,
  History,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSession } from '../../lib/SessionContext';
import { useState } from 'react';

interface Task {
  id: string;
  status: string;
  payload: { command: string };
  createdAt: string;
}

function TaskItem({ task, isActive }: { task: Task; isActive: boolean }) {
  const statusIcons: Record<string, React.ReactNode> = {
    completed: <CheckCircle className="h-3 w-3 text-emerald-400" />,
    running: <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />,
    pending: <Clock className="h-3 w-3 text-gray-400" />,
    failed: <AlertCircle className="h-3 w-3 text-rose-400" />,
    waiting_approval: <ShieldAlert className="h-3 w-3 text-yellow-400" />,
  };

  return (
    <NavLink
      to={`/chat/${task.id}`}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all group",
        isActive
          ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
          : "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
      )}
    >
      {statusIcons[task.status] || statusIcons.pending}
      <span className="flex-1 truncate">{task.payload.command}</span>
      {task.status === 'waiting_approval' && (
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
      )}
    </NavLink>
  );
}

function TaskSection({
  title,
  tasks,
  icon: Icon,
  defaultOpen = true
}: {
  title: string;
  tasks: Task[];
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { taskId } = useParams();

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 w-full text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-400 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3 w-3" />
        {title}
        <span className="ml-auto text-gray-600">{tasks.length}</span>
      </button>
      {isOpen && (
        <div className="space-y-0.5 pl-2">
          {tasks.map(task => (
            <TaskItem key={task.id} task={task} isActive={taskId === task.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatSidebar() {
  const navigate = useNavigate();
  const { session } = useSession();

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await axios.get('/api/tasks');
      return res.data as Task[];
    },
    refetchInterval: 2000
  });

  const activeTasks = tasks?.filter(t =>
    t.status === 'pending' || t.status === 'running' || t.status === 'waiting_approval'
  ).slice().reverse() || [];

  const historyTasks = tasks?.filter(t =>
    t.status === 'completed' || t.status === 'failed'
  ).slice().reverse() || [];

  return (
    <div className="w-72 border-r border-[#222] bg-[#0F0F0F] flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Terminal className="text-white h-4 w-4" />
          </div>
          <span className="font-bold text-base text-white">OpenJules</span>
        </div>
        <button
          onClick={() => navigate('/chat/new')}
          className="h-8 w-8 rounded-lg bg-[#1a1a1a] border border-[#333] hover:border-indigo-500/50 hover:bg-indigo-500/10 flex items-center justify-center text-gray-400 hover:text-indigo-400 transition-all"
          title="New Chat"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Repo Info */}
      {session?.selectedRepo && (
        <div className="px-4 py-3 border-b border-[#222] bg-[#0a0a0a]">
          <NavLink
            to="/integrations"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <GitBranch className="h-4 w-4 text-indigo-400" />
            <span className="flex-1 truncate">{session.selectedRepo.fullName}</span>
            <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#333]">
              {session.selectedBranch}
            </span>
          </NavLink>
        </div>
      )}

      {/* Task Lists */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        <TaskSection
          title="Active"
          tasks={activeTasks}
          icon={MessageSquare}
          defaultOpen={true}
        />
        <TaskSection
          title="History"
          tasks={historyTasks}
          icon={History}
          defaultOpen={true}
        />
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-[#222] p-2 space-y-1">
        <NavLink
          to="/integrations"
          className={({ isActive }) => cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
            isActive
              ? "bg-indigo-500/10 text-indigo-400"
              : "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
          )}
        >
          <GitBranch className="h-4 w-4" />
          Integrations
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
            isActive
              ? "bg-indigo-500/10 text-indigo-400"
              : "text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-200"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
      </div>

      {/* User */}
      {session?.githubUser && (
        <div className="p-3 border-t border-[#222]">
          <div className="flex items-center gap-2">
            <img
              src={session.githubUser.avatarUrl}
              alt={session.githubUser.login}
              className="h-8 w-8 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {session.githubUser.name || session.githubUser.login}
              </p>
              <p className="text-xs text-gray-500 truncate">@{session.githubUser.login}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
