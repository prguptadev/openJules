import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
import { useSession } from '../../lib/SessionContext';
import { sessionApi } from '../../lib/session';
import {
  User,
  Bot,
  Wrench,
  Brain,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Check,
  X,
  Loader2,
  Send,
  ChevronDown,
  ChevronRight,
  Terminal,
  Sparkles,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thinking' | 'system' | 'approval_request';
  content: string;
  timestamp: string;
  metadata?: {
    toolName?: string;
    toolArgs?: any;
    exitCode?: number;
    approvalId?: string;
    isApproved?: boolean;
  };
}

interface ApprovalRequest {
  id: string;
  command: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface Task {
  id: string;
  status: string;
  payload: { command: string };
  messages: ChatMessage[];
  pendingApproval?: ApprovalRequest;
  createdAt: string;
}

// Markdown renderer component
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-[#333] prose-code:text-pink-400 prose-code:before:content-none prose-code:after:content-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            return isInline ? (
              <code className={className} {...props}>{children}</code>
            ) : (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '12px' }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Collapsible section for tool calls and thinking
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  variant = 'default'
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'tool' | 'thinking' | 'result' | 'error';
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const variantStyles = {
    default: 'border-[#333] bg-[#111]',
    tool: 'border-blue-500/30 bg-blue-500/5',
    thinking: 'border-purple-500/30 bg-purple-500/5',
    result: 'border-emerald-500/30 bg-emerald-500/5',
    error: 'border-rose-500/30 bg-rose-500/5',
  };

  const iconColors = {
    default: 'text-gray-400',
    tool: 'text-blue-400',
    thinking: 'text-purple-400',
    result: 'text-emerald-400',
    error: 'text-rose-400',
  };

  return (
    <div className={cn("rounded-lg border", variantStyles[variant])}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className={cn("h-4 w-4", iconColors[variant])} />
        <span className="flex-1 text-left truncate">{title}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-[#222]">
          {children}
        </div>
      )}
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  pendingApproval,
  jobId,
}: {
  message: ChatMessage;
  pendingApproval?: ApprovalRequest;
  jobId: string;
}) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async ({ approved }: { approved: boolean }) => {
      await axios.post(`/api/tasks/${jobId}/approval`, {
        approvalId: pendingApproval?.id,
        approved,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', jobId] });
    },
  });

  // User message
  if (message.role === 'user') {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%]">
          <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-3">
            <p className="text-sm">{message.content}</p>
          </div>
          <p className="text-xs text-gray-600 mt-1 text-right">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
          <User className="h-4 w-4 text-white" />
        </div>
      </div>
    );
  }

  // Assistant message
  if (message.role === 'assistant') {
    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 max-w-[85%]">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl rounded-tl-md px-4 py-3">
            <MarkdownContent content={message.content} />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // Tool call
  if (message.role === 'tool_call') {
    const toolArgs = message.metadata?.toolArgs;
    let preview = '';
    if (message.metadata?.toolName === 'shell') {
      preview = toolArgs?.command || '';
    } else if (message.metadata?.toolName === 'read_file') {
      preview = toolArgs?.path || '';
    } else if (toolArgs) {
      preview = JSON.stringify(toolArgs).slice(0, 100);
    }

    return (
      <div className="flex gap-3">
        <div className="w-8" />
        <div className="flex-1">
          <CollapsibleSection
            title={`${message.metadata?.toolName || 'Tool'}: ${preview.slice(0, 50)}${preview.length > 50 ? '...' : ''}`}
            icon={Wrench}
            variant="tool"
          >
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
              {JSON.stringify(toolArgs, null, 2)}
            </pre>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  // Tool result
  if (message.role === 'tool_result') {
    const isError = message.metadata?.exitCode !== undefined && message.metadata.exitCode !== 0;
    return (
      <div className="flex gap-3">
        <div className="w-8" />
        <div className="flex-1">
          <CollapsibleSection
            title={`Result: ${message.metadata?.toolName || 'completed'} ${isError ? `(exit: ${message.metadata?.exitCode})` : ''}`}
            icon={isError ? AlertCircle : CheckCircle}
            variant={isError ? 'error' : 'result'}
          >
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
              {message.content.slice(0, 2000)}{message.content.length > 2000 && '...'}
            </pre>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  // Thinking
  if (message.role === 'thinking') {
    return (
      <div className="flex gap-3">
        <div className="w-8" />
        <div className="flex-1">
          <CollapsibleSection
            title="Thinking..."
            icon={Brain}
            variant="thinking"
          >
            <p className="text-sm text-gray-400 italic">{message.content}</p>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  // Approval request
  if (message.role === 'approval_request') {
    const showButtons = pendingApproval && message.metadata?.approvalId === pendingApproval.id && pendingApproval.status === 'pending';

    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
          <ShieldAlert className="h-4 w-4 text-black" />
        </div>
        <div className="flex-1">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <MarkdownContent content={message.content} />
            {showButtons && (
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-yellow-500/20">
                <button
                  onClick={() => resolveMutation.mutate({ approved: true })}
                  disabled={resolveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  onClick={() => resolveMutation.mutate({ approved: false })}
                  disabled={resolveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Reject
                </button>
              </div>
            )}
            {pendingApproval && message.metadata?.approvalId === pendingApproval.id && pendingApproval.status !== 'pending' && (
              <div className={cn(
                "flex items-center gap-2 mt-3 text-sm",
                pendingApproval.status === 'approved' ? "text-emerald-400" : "text-rose-400"
              )}>
                {pendingApproval.status === 'approved' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {pendingApproval.status === 'approved' ? 'Approved' : 'Rejected'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // System message
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-gray-500 bg-[#111] px-3 py-1.5 rounded-full border border-[#222]">
          {message.content}
        </div>
      </div>
    );
  }

  return null;
}

// Welcome screen when no chat is selected
function WelcomeScreen({ onNewChat }: { onNewChat: (command: string) => void }) {
  const [command, setCommand] = useState('');
  const { session } = useSession();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      onNewChat(command);
    }
  };

  const suggestions = [
    "Fix the TypeScript errors in this project",
    "Add a new REST API endpoint for user authentication",
    "Write unit tests for the main components",
    "Refactor the database queries for better performance",
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="space-y-3">
          <div className="h-16 w-16 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">How can I help you today?</h1>
          <p className="text-gray-400">
            {session?.selectedRepo
              ? `Working on ${session.selectedRepo.fullName}`
              : 'Start a conversation with KODE'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Describe what you want to build or fix..."
              className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 min-h-[100px] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!command.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-xl px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Send className="h-4 w-4" />
            Start Chat
          </button>
        </form>

        <div className="space-y-3">
          <p className="text-xs text-gray-600 uppercase tracking-wider">Suggestions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setCommand(suggestion)}
                className="text-left text-sm text-gray-400 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#333] rounded-lg px-3 py-2 transition-all"
              >
                <Sparkles className="h-3 w-3 inline mr-2 text-indigo-400" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main ChatBot component
export function ChatBot() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const { session, sessionId } = useSession();

  // Fetch task data
  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await axios.get(`/api/tasks/${taskId}`);
      return res.data as Task;
    },
    enabled: !!taskId && taskId !== 'new',
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'completed' || status === 'failed') ? false : 1000;
    }
  });

  // Create new task mutation
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.messages]);

  const handleNewChat = (command: string) => {
    createTask.mutate(command);
  };

  // Show welcome screen for new chat
  if (!taskId || taskId === 'new') {
    return <WelcomeScreen onNewChat={handleNewChat} />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // Task not found
  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Task not found
      </div>
    );
  }

  const isRunning = task.status === 'running' || task.status === 'pending';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-[#222] bg-[#0F0F0F] flex items-center px-4 gap-3 flex-shrink-0">
        <div className={cn(
          "h-2 w-2 rounded-full",
          task.status === 'completed' && "bg-emerald-500",
          task.status === 'running' && "bg-blue-500 animate-pulse",
          task.status === 'pending' && "bg-gray-500",
          task.status === 'failed' && "bg-rose-500",
          task.status === 'waiting_approval' && "bg-yellow-500 animate-pulse"
        )} />
        <h1 className="flex-1 text-sm font-medium text-gray-300 truncate">
          {task.payload.command}
        </h1>
        <span className="text-xs text-gray-600 font-mono">
          {task.id.slice(0, 8)}
        </span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {task.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            pendingApproval={task.pendingApproval}
            jobId={task.id}
          />
        ))}

        {isRunning && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">KODE is thinking...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input (disabled for existing tasks - they're one-shot) */}
      <div className="border-t border-[#222] p-4 bg-[#0F0F0F]">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          <Terminal className="h-3 w-3" />
          <span>Task {task.status}</span>
          {task.status === 'completed' && <CheckCircle className="h-3 w-3 text-emerald-400" />}
          {task.status === 'failed' && <AlertCircle className="h-3 w-3 text-rose-400" />}
        </div>
        <button
          onClick={() => navigate('/chat/new')}
          className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-gray-200 rounded-lg px-4 py-3 text-sm transition-colors"
        >
          Start a new conversation
        </button>
      </div>
    </div>
  );
}
