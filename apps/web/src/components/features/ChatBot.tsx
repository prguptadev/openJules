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
  Play,
  ListTodo,
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
    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-[#333] prose-code:text-indigo-400 prose-code:before:content-none prose-code:after:content-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0.5">
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
                customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '12px', background: '#0a0a0a' }}
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
    default: 'border-[#222] bg-[#111]',
    tool: 'border-blue-500/20 bg-blue-500/5',
    thinking: 'border-purple-500/20 bg-purple-500/5',
    result: 'border-emerald-500/20 bg-emerald-500/5',
    error: 'border-rose-500/20 bg-rose-500/5',
  };

  const iconColors = {
    default: 'text-gray-400',
    tool: 'text-blue-400',
    thinking: 'text-purple-400',
    result: 'text-emerald-400',
    error: 'text-rose-400',
  };

  return (
    <div className={cn("rounded-lg border mb-2 overflow-hidden transition-all", variantStyles[variant])}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className={cn("h-3.5 w-3.5", iconColors[variant])} />
        <span className="flex-1 text-left truncate">{title}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-[#222] animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// Execution Plan View
function PlanView({ command, messages }: { command: string, messages: ChatMessage[] }) {
  const [isOpen, setIsOpen] = useState(true);
  
  // Extract plan steps from thinking/assistant messages if they look like a list
  // For now, we'll use a placeholder or look for a specific message
  const planMessage = messages.find(m => m.content.toLowerCase().includes('plan:'))?.content;
  
  // Simple heuristic to find a list in the message
  const steps = planMessage 
    ? planMessage.split('\n').filter(line => /^\d+\./.test(line.trim()))
    : [
        `Analyze task: "${command}"`,
        "Build execution strategy",
        "Complete implementation steps",
        "Verify changes"
      ];

  return (
    <div className="mb-6 bg-[#111] border border-[#222] rounded-xl overflow-hidden shadow-lg">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#161616] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/10 rounded-md">
            <ListTodo className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="font-semibold text-sm text-gray-200">Execution Plan</span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-[#1A1A1A] border border-[#333] flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-gray-400">{step.replace(/^\d+\.\s*/, '')}</p>
            </div>
          ))}
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
      <div className="flex gap-3 justify-end mb-6">
        <div className="max-w-[80%]">
          <div className="bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-md">
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
        </div>
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#333] flex items-center justify-center">
          <User className="h-4 w-4 text-indigo-400" />
        </div>
      </div>
    );
  }

  // Assistant message
  if (message.role === 'assistant') {
    return (
      <div className="flex gap-3 mb-6">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-transparent px-1 py-0.5">
            <MarkdownContent content={message.content} />
          </div>
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
      <div className="flex gap-3 ml-11">
        <div className="flex-1">
          <CollapsibleSection
            title={`${message.metadata?.toolName || 'Tool'}: ${preview.slice(0, 50)}${preview.length > 50 ? '...' : ''}`}
            icon={Wrench}
            variant="tool"
          >
            <pre className="text-[11px] text-gray-400 whitespace-pre-wrap font-mono overflow-x-auto bg-black/30 p-2 rounded">
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
      <div className="flex gap-3 ml-11">
        <div className="flex-1">
          <CollapsibleSection
            title={`Result: ${message.metadata?.toolName || 'completed'}`}
            icon={isError ? AlertCircle : CheckCircle}
            variant={isError ? 'error' : 'result'}
          >
            <pre className="text-[11px] text-gray-400 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto bg-black/30 p-2 rounded">
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
      <div className="flex gap-3 ml-11">
        <div className="flex-1">
          <CollapsibleSection
            title="Reasoning"
            icon={Brain}
            variant="thinking"
          >
            <p className="text-xs text-gray-500 leading-relaxed italic">{message.content}</p>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  // Approval request
  if (message.role === 'approval_request') {
    const showButtons = pendingApproval && message.metadata?.approvalId === pendingApproval.id && pendingApproval.status === 'pending';

    return (
      <div className="flex gap-3 mb-6">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
          <ShieldAlert className="h-4 w-4 text-black" />
        </div>
        <div className="flex-1">
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 shadow-sm">
            <MarkdownContent content={message.content} />
            {showButtons && (
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-yellow-500/10">
                <button
                  onClick={() => resolveMutation.mutate({ approved: true })}
                  disabled={resolveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  onClick={() => resolveMutation.mutate({ approved: false })}
                  disabled={resolveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] text-gray-300 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Reject
                </button>
              </div>
            )}
            {pendingApproval && message.metadata?.approvalId === pendingApproval.id && pendingApproval.status !== 'pending' && (
              <div className={cn(
                "flex items-center gap-2 mt-3 text-xs font-medium",
                pendingApproval.status === 'approved' ? "text-emerald-400" : "text-rose-400"
              )}>
                {pendingApproval.status === 'approved' ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {pendingApproval.status === 'approved' ? 'Action Approved' : 'Action Rejected'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Main ChatBot component
export function ChatBot() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
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
      return (status === 'completed' || status === 'failed') ? false : 1500;
    }
  });

  // Create new task mutation (for follow-up or new)
  const createTask = useMutation({
    mutationFn: async (command: string) => {
      if (sessionId && session?.status === 'ready') {
        return sessionApi.submitTask(sessionId, command);
      }
      return axios.post('/api/tasks', { command, cwd: '.' }).then(r => r.data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if (taskId !== data.jobId) {
        navigate(`/chat/${data.jobId}`);
      }
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !createTask.isPending) {
      createTask.mutate(input);
      setInput('');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Task not found
  if (!task) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#0A0A0A] gap-4">
        <div className="p-4 bg-[#111] border border-[#222] rounded-2xl">
          <Bot className="h-8 w-8 opacity-20" />
        </div>
        <p className="text-sm">Conversation not found</p>
        <button onClick={() => navigate('/')} className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4">
          Return to dashboard
        </button>
      </div>
    );
  }

  const isRunning = task.status === 'running' || task.status === 'pending' || task.status === 'waiting_approval';

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]">
      {/* Header */}
      <header className="h-14 border-b border-[#222] bg-[#0F0F0F] flex items-center px-6 gap-4 flex-shrink-0 z-10 shadow-sm">
        <div className={cn(
          "h-2.5 w-2.5 rounded-full shadow-[0_0_8px]",
          task.status === 'completed' && "bg-emerald-500 shadow-emerald-500/40",
          task.status === 'running' && "bg-blue-500 animate-pulse shadow-blue-500/40",
          task.status === 'pending' && "bg-gray-500 shadow-gray-500/40",
          task.status === 'failed' && "bg-rose-500 shadow-rose-500/40",
          task.status === 'waiting_approval' && "bg-yellow-500 animate-pulse shadow-yellow-500/40"
        )} />
        <h1 className="flex-1 text-sm font-semibold text-gray-200 truncate tracking-tight">
          {task.payload.command}
        </h1>
        <div className="flex items-center gap-3">
          <div className="px-2 py-0.5 rounded bg-[#1A1A1A] border border-[#333] text-[10px] font-mono text-gray-500">
            {task.id.slice(0, 8)}
          </div>
        </div>
      </header>

      {/* Messages & Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Plan View */}
          <PlanView command={task.payload.command} messages={task.messages} />

          {/* Message Stream */}
          <div className="space-y-2">
            {task.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                pendingApproval={task.pendingApproval}
                jobId={task.id}
              />
            ))}

            {isRunning && (
              <div className="flex gap-3 mb-6 items-center">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#111] border border-[#222] flex items-center justify-center">
                  <Bot className="h-4 w-4 text-indigo-400 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-xs font-medium tracking-wide uppercase">Jules is working</span>
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Chat Footer / Input */}
      <div className="p-6 border-t border-[#222] bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-0 group-focus-within:opacity-20 transition duration-500"></div>
            <div className="relative flex items-center bg-[#111] border border-[#222] rounded-xl overflow-hidden focus-within:border-indigo-500/50 transition-all">
              <div className="pl-4 pr-2 py-3 border-r border-[#222] bg-[#161616]">
                <Bot className="h-4 w-4 text-indigo-400" />
              </div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Talk to Jules..."
                className="flex-1 bg-transparent px-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
                disabled={createTask.isPending}
              />
              <button
                type="submit"
                disabled={!input.trim() || createTask.isPending}
                className="p-3 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
              >
                {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
          <div className="flex items-center justify-between mt-3 px-1">
            <p className="text-[10px] text-gray-600 flex items-center gap-1.5 uppercase tracking-widest font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  task.status === 'completed' ? "bg-emerald-400" : "bg-indigo-400"
                )}></span>
                <span className={cn(
                  "relative inline-flex rounded-full h-1.5 w-1.5",
                  task.status === 'completed' ? "bg-emerald-500" : "bg-indigo-500"
                )}></span>
              </span>
              Task {task.status.replace('_', ' ')}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="text-[10px] text-gray-500 hover:text-indigo-400 transition-colors uppercase tracking-widest font-medium flex items-center gap-1"
            >
              New Session <Play className="h-2 w-2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
