import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
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

interface ChatViewProps {
  jobId: string;
  messages: ChatMessage[];
  pendingApproval?: ApprovalRequest;
  isRunning?: boolean;
  className?: string;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-[#333] prose-code:text-pink-400 prose-code:before:content-none prose-code:after:content-none prose-p:my-2 prose-headings:my-3">
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const roleConfig = {
    user: {
      icon: <User className="h-4 w-4" />,
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      iconBg: 'bg-indigo-500',
      label: 'You',
    },
    assistant: {
      icon: <Bot className="h-4 w-4" />,
      bg: 'bg-[#1a1a1a] border-[#333]',
      iconBg: 'bg-emerald-500',
      label: 'KODE',
    },
    tool_call: {
      icon: <Wrench className="h-4 w-4" />,
      bg: 'bg-blue-500/5 border-blue-500/20',
      iconBg: 'bg-blue-500',
      label: message.metadata?.toolName || 'Tool',
    },
    tool_result: {
      icon: <CheckCircle className="h-4 w-4" />,
      bg: 'bg-green-500/5 border-green-500/20',
      iconBg: 'bg-green-600',
      label: message.metadata?.toolName || 'Result',
    },
    thinking: {
      icon: <Brain className="h-4 w-4" />,
      bg: 'bg-purple-500/5 border-purple-500/20',
      iconBg: 'bg-purple-500',
      label: 'Thinking',
    },
    system: {
      icon: <AlertCircle className="h-4 w-4" />,
      bg: 'bg-gray-500/5 border-gray-500/20',
      iconBg: 'bg-gray-500',
      label: 'System',
    },
    approval_request: {
      icon: <ShieldAlert className="h-4 w-4" />,
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      iconBg: 'bg-yellow-500',
      label: 'Approval Required',
    },
  };

  const config = roleConfig[message.role];
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn("flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white", config.iconBg)}>
        {config.icon}
      </div>
      <div className={cn("flex-1 max-w-[85%]", isUser && "flex flex-col items-end")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-400">{config.label}</span>
          <span className="text-xs text-gray-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className={cn("rounded-xl px-4 py-3 border", config.bg)}>
          {message.role === 'tool_call' && message.metadata?.toolArgs && (
            <div className="mb-2">
              <code className="text-xs text-gray-400 bg-black/20 px-2 py-1 rounded">
                {JSON.stringify(message.metadata.toolArgs).slice(0, 100)}...
              </code>
            </div>
          )}
          {message.role === 'tool_result' ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {message.content.slice(0, 500)}{message.content.length > 500 && '...'}
            </pre>
          ) : (
            <MarkdownContent content={message.content} />
          )}
          {message.metadata?.exitCode !== undefined && (
            <div className={cn("mt-2 text-xs", message.metadata.exitCode === 0 ? "text-green-400" : "text-red-400")}>
              Exit code: {message.metadata.exitCode}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalButtons({ jobId, approval }: { jobId: string; approval: ApprovalRequest }) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async ({ approved }: { approved: boolean }) => {
      await axios.post(`/api/tasks/${jobId}/approval`, {
        approvalId: approval.id,
        approved,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', jobId] });
    },
  });

  if (approval.status !== 'pending') {
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm",
        approval.status === 'approved' ? "text-green-400" : "text-red-400"
      )}>
        {approval.status === 'approved' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        {approval.status === 'approved' ? 'Approved' : 'Rejected'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-3">
      <button
        onClick={() => resolveMutation.mutate({ approved: true })}
        disabled={resolveMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve
      </button>
      <button
        onClick={() => resolveMutation.mutate({ approved: false })}
        disabled={resolveMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Reject
      </button>
    </div>
  );
}

export function ChatView({ jobId, messages, pendingApproval, isRunning, className }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={cn("flex flex-col h-full bg-[#0a0a0a] rounded-xl border border-[#222] overflow-hidden", className)}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600">
            <Bot className="h-12 w-12 mb-3 opacity-30" />
            <p>Waiting for response...</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id}>
                <MessageBubble message={msg} />
                {msg.role === 'approval_request' && pendingApproval && msg.metadata?.approvalId === pendingApproval.id && (
                  <div className="ml-11 mt-2">
                    <ApprovalButtons jobId={jobId} approval={pendingApproval} />
                  </div>
                )}
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 text-indigo-400 ml-11">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">KODE is working...</span>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
