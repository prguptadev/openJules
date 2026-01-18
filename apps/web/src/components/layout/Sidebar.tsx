import { useState } from 'react';
import { NavLink, Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  GitBranch, 
  Settings, 
  ChevronDown,
  Loader2,
  CheckCircle,
  Clock,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSession } from '../../lib/SessionContext';

interface SessionData {
  id: string;
  selectedRepo: { name: string; fullName: string } | null;
  selectedBranch: string | null;
  status: string;
  lastActiveAt: string;
}

export function Sidebar() {
  const { taskId } = useParams();
  const { session, setSessionId } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ codebases: true, history: true });

  // Fetch all tasks for history
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await axios.get('/api/tasks');
      return res.data as any[];
    },
    refetchInterval: 5000
  });

  // Fetch all sessions (codebases)
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await axios.get('/api/sessions');
      return res.data as SessionData[];
    },
    refetchInterval: 5000
  });

  // Filter tasks by CURRENT session to show relevant history
  // If no session is active, show nothing or maybe all? Let's show only current session history for context.
  const currentSessionTasks = tasks?.filter(t => t.sessionId === session?.id) || [];
  
  const recentTasks = currentSessionTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [];

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className={cn(
      "border-r border-[#222] bg-[#0F0F0F] flex flex-col h-full flex-shrink-0 z-20 transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header with Logo & Toggle */}
      <div className={cn("h-14 flex items-center border-b border-[#222] px-3", isCollapsed ? "justify-center" : "justify-between")}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <Terminal className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white">OpenJules</span>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-500 hover:text-white transition-colors"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-thin scrollbar-thumb-[#222]">
        
        {/* Codebases (Sessions) */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div 
              className="flex items-center justify-between px-2 mb-2 group cursor-pointer"
              onClick={() => toggleSection('codebases')}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Codebases</span>
              <ChevronDown className={cn("h-3 w-3 text-gray-600 transition-transform", !expandedSections.codebases && "-rotate-90")} />
            </div>
          )}
          
          {(isCollapsed || expandedSections.codebases) && (
            <div className="space-y-1">
              {sessionsLoading ? (
                !isCollapsed && <div className="px-4 text-xs text-gray-600">Loading...</div>
              ) : sessions?.length === 0 ? (
                !isCollapsed && <div className="px-4 text-xs text-gray-600 italic">No codebases yet</div>
              ) : sessions?.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSessionId(s.id)}
                  title={s.selectedRepo?.fullName || 'Empty Session'}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group relative text-left",
                    session?.id === s.id ? "bg-[#1A1A1A] text-white" : "text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-300",
                    isCollapsed && "justify-center"
                  )}
                >
                  <GitBranch className={cn("h-4 w-4 flex-shrink-0", session?.id === s.id ? "text-indigo-400" : "text-gray-500")} />
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{s.selectedRepo?.name || 'Untitled'}</div>
                      <div className="truncate text-[10px] text-gray-500">{s.selectedBranch || 'default'}</div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* History (Tasks for current session) */}
        <div className="space-y-1">
          {!isCollapsed && (
            <div 
              className="flex items-center justify-between px-2 mb-2 group cursor-pointer"
              onClick={() => toggleSection('history')}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">History</span>
              <ChevronDown className={cn("h-3 w-3 text-gray-600 transition-transform", !expandedSections.history && "-rotate-90")} />
            </div>
          )}
          
          {(isCollapsed || expandedSections.history) && (
            <div className="space-y-1">
              {!session ? (
                 !isCollapsed && <div className="px-4 text-xs text-gray-600 italic">Select a codebase</div>
              ) : recentTasks.length === 0 ? (
                !isCollapsed && <div className="px-4 text-xs text-gray-600 italic">No history</div>
              ) : recentTasks.map(task => (
                <Link
                  key={task.id}
                  to={`/chat/${task.id}`}
                  title={task.payload.command}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group relative",
                    taskId === task.id ? "bg-[#1A1A1A] text-white" : "text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-300",
                    isCollapsed && "justify-center"
                  )}
                >
                  {task.status === 'completed' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  ) : task.status === 'failed' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0 mx-0.5" />
                  )}
                  {!isCollapsed && <span className="truncate">{task.payload.command}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#222]">
         <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
              isActive ? "text-white bg-[#1A1A1A]" : "text-gray-400 hover:text-white hover:bg-[#1A1A1A]",
              isCollapsed && "justify-center"
            )}
          >
            <Settings className="h-4 w-4" />
            {!isCollapsed && <span>Settings</span>}
          </NavLink>
      </div>
    </div>
  );
}
