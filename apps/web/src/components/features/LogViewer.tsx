import { useEffect, useRef, useMemo } from 'react';
import { Terminal as TerminalIcon, Download, Wrench, Brain, CheckCircle, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';

interface LogViewerProps {
  logs: string[];
  isLoading?: boolean;
  className?: string;
}

interface ParsedLog {
  type: 'content' | 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'finished' | 'system';
  content: string;
  timestamp?: string;
  toolName?: string;
}

function parseLog(log: string): ParsedLog {
  // Extract timestamp if present
  const timestampMatch = log.match(/^\[([\d\-T:.Z]+)\]\s*/);
  const timestamp = timestampMatch?.[1];
  const content = timestampMatch ? log.slice(timestampMatch[0].length) : log;

  // Detect log type
  if (content.startsWith('[Thinking]')) {
    return { type: 'thinking', content: content.replace('[Thinking] ', ''), timestamp };
  }
  if (content.startsWith('[Tool Call]')) {
    const match = content.match(/\[Tool Call\] (\w+)\((.*)\)/);
    return { type: 'tool_call', content: match?.[2] || content, toolName: match?.[1], timestamp };
  }
  if (content.startsWith('[Tool Result]') || content.startsWith('[Tool ')) {
    const match = content.match(/\[Tool (?:Result\s+)?(\w+)\]/);
    return { type: 'tool_result', content: content.replace(/\[Tool.*?\]\s*/, ''), toolName: match?.[1], timestamp };
  }
  if (content.startsWith('[Error]')) {
    return { type: 'error', content: content.replace('[Error] ', ''), timestamp };
  }
  if (content.startsWith('[Finished]')) {
    return { type: 'finished', content: content.replace('[Finished] ', ''), timestamp };
  }
  if (content.startsWith('[Executing') || content.startsWith('[Warning]')) {
    return { type: 'system', content, timestamp };
  }

  return { type: 'content', content, timestamp };
}

function LogEntry({ parsed }: { parsed: ParsedLog }) {
  const iconMap = {
    thinking: <Brain className="h-3.5 w-3.5 text-purple-400" />,
    tool_call: <Wrench className="h-3.5 w-3.5 text-blue-400" />,
    tool_result: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
    finished: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
    system: <TerminalIcon className="h-3.5 w-3.5 text-gray-500" />,
    content: null,
  };

  const bgMap = {
    thinking: 'bg-purple-500/5 border-l-2 border-purple-500/30',
    tool_call: 'bg-blue-500/5 border-l-2 border-blue-500/30',
    tool_result: 'bg-green-500/5 border-l-2 border-green-500/30',
    error: 'bg-red-500/10 border-l-2 border-red-500/50',
    finished: 'bg-emerald-500/5 border-l-2 border-emerald-500/30',
    system: 'bg-gray-500/5 border-l-2 border-gray-500/30',
    content: '',
  };

  const textMap = {
    thinking: 'text-purple-300',
    tool_call: 'text-blue-300',
    tool_result: 'text-green-300',
    error: 'text-red-400',
    finished: 'text-emerald-400',
    system: 'text-gray-500',
    content: 'text-gray-200',
  };

  // For content type, render markdown
  if (parsed.type === 'content') {
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#1a1a1a] prose-pre:border prose-pre:border-[#333] prose-code:text-pink-400 prose-code:before:content-none prose-code:after:content-none">
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
          {parsed.content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2 px-3 py-2 rounded-lg", bgMap[parsed.type])}>
      <span className="flex-shrink-0 mt-0.5">{iconMap[parsed.type]}</span>
      <div className="flex-1 min-w-0">
        {parsed.toolName && (
          <span className="text-xs font-medium text-gray-400 mr-2">{parsed.toolName}</span>
        )}
        <span className={cn("text-sm", textMap[parsed.type])}>{parsed.content}</span>
      </div>
    </div>
  );
}

export function LogViewer({ logs, isLoading, className }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const parsedLogs = useMemo(() => logs.map(parseLog), [logs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className={cn("flex flex-col h-full bg-[#0D0D0D] border border-[#222] rounded-xl overflow-hidden shadow-2xl", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#151515] border-b border-[#222]">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
          </div>
          <span className="text-xs font-medium text-gray-400 font-mono ml-2 flex items-center gap-1.5">
            <TerminalIcon className="h-3 w-3" />
            agent-terminal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-gray-600 hover:text-gray-300 transition-colors"><Download className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto text-[13px] leading-relaxed scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-700">
            <TerminalIcon className="h-8 w-8 mb-2 opacity-50" />
            <p>Waiting for output...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {parsedLogs.map((parsed, i) => (
              <LogEntry key={i} parsed={parsed} />
            ))}
            {isLoading && (
              <div className="flex gap-2 items-center mt-2 text-indigo-400">
                <span className="animate-pulse">▋</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
