import { useParams, useNavigate } from 'react-router-dom';
import { RepoSelector } from '../components/features/RepoSelector';
import { ChatBot } from '../components/features/ChatBot';
import { useSession } from '../lib/SessionContext';
import { Bot, Send, Sparkles, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionApi } from '../lib/session';
import axios from 'axios';

function WelcomeScreen() {
  const [command, setCommand] = useState('');
  const { session, sessionId } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRepoConfig, setShowRepoConfig] = useState(false);

  const createTask = useMutation({
    mutationFn: async (command: string) => {
      if (sessionId && session?.status === 'ready') {
        return sessionApi.submitTask(sessionId, command);
      }
      return axios.post('/api/tasks', { command, cwd: '.' }).then(r => r.data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      navigate(`/chat/${data.jobId}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      createTask.mutate(command);
    }
  };

  const suggestions = [
    "Fix the TypeScript errors in this project",
    "Add a new REST API endpoint for user authentication",
    "Write unit tests for the main components",
    "Refactor the database queries for better performance",
  ];

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      {/* Minimal Header */}
      <div className="absolute top-4 right-6 z-20">
        <div className="flex items-center gap-2">
           <div className={showRepoConfig ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none" + " transition-all duration-200 origin-top-right absolute top-full right-0 mt-2 w-[300px] bg-[#111] border border-[#222] rounded-xl shadow-2xl p-1"}>
             <RepoSelector />
           </div>
           <button 
             onClick={() => setShowRepoConfig(!showRepoConfig)}
             className="flex items-center gap-2 px-3 py-2 bg-[#111] hover:bg-[#1A1A1A] border border-[#222] rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-all"
           >
             <Settings2 className="h-3.5 w-3.5" />
             {session?.selectedRepo ? session.selectedRepo.name : 'Configure Repository'}
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full space-y-8 text-center relative">
          
          <div className="space-y-6">
            <div className="h-20 w-20 mx-auto bg-gradient-to-tr from-[#1A1A1A] to-[#111] border border-[#222] rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/10">
              <Bot className="h-10 w-10 text-indigo-500" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-white tracking-tight">How can I help you?</h1>
              <p className="text-gray-500 text-lg">
                {session?.selectedRepo
                  ? <span>Working on <span className="text-indigo-400 font-medium">{session.selectedRepo.fullName}</span></span>
                  : 'Select a repository to get started'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative bg-[#0A0A0A] rounded-2xl">
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Ask anything or describe a task..."
                  className="w-full bg-[#111] border border-[#222] rounded-2xl px-6 py-5 min-h-[140px] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none text-lg leading-relaxed scrollbar-thin scrollbar-thumb-[#222] scrollbar-track-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  autoFocus
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!command.trim() || createTask.isPending}
                    className="bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl p-3 transition-colors shadow-lg"
                  >
                    {createTask.isPending ? <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-8">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setCommand(suggestion)}
                className="text-left text-sm text-gray-500 bg-[#111]/50 hover:bg-[#1A1A1A] border border-[#222]/50 hover:border-[#333] rounded-xl px-5 py-4 transition-all hover:scale-[1.01] hover:text-gray-300 hover:shadow-lg hover:shadow-indigo-500/5"
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="h-4 w-4 text-indigo-500/50 mt-0.5" />
                  <span>{suggestion}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { taskId } = useParams();

  if (!taskId || taskId === 'new') {
    return <WelcomeScreen />;
  }

  return <ChatBot />;
}