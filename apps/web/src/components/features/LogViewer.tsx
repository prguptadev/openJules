import { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LogViewerProps {
  logs: string[];
  isLoading?: boolean;
  className?: string;
}

export function LogViewer({ logs, isLoading, className }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

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
      
      <div className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-relaxed scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-700">
            <TerminalIcon className="h-8 w-8 mb-2 opacity-50" />
            <p>Waiting for output...</p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, i) => {
              const isError = log.toLowerCase().includes('error') || log.toLowerCase().includes('failed');
              const isSuccess = log.toLowerCase().includes('success') || log.toLowerCase().includes('completed');
              const timestamp = log.match(/^\[(.*?)\]/)?.[1];
              const content = log.replace(/^\[.*?\] /, '');

              return (
                <div key={i} className={cn("flex gap-3", isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-gray-300")}>
                  <span className="text-gray-700 flex-shrink-0 select-none w-20 text-right">{timestamp && new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                  <span className="break-all">{content}</span>
                </div>
              );
            })}
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
