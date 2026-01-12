import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Terminal, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
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

  if (isLoading) return <div className="p-8 text-white">Loading...</div>;
  if (!task) return <div className="p-8 text-white">Task not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-8 h-screen flex flex-col">
      <header className="mb-6 flex items-center gap-4 flex-shrink-0">
        <Link to="/" className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono text-white">{task.id}</h1>
            <span className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase",
              task.status === 'completed' ? "bg-green-500/20 text-green-400" :
              task.status === 'running' ? "bg-blue-500/20 text-blue-400" :
              task.status === 'failed' ? "bg-red-500/20 text-red-400" :
              "bg-neutral-800 text-neutral-400"
            )}>
              {task.status}
            </span>
          </div>
          <p className="text-neutral-400 text-sm mt-1">{task.payload.command}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow min-h-0">
        {/* Logs Panel */}
        <div className="lg:col-span-2 bg-black border border-neutral-800 rounded-xl overflow-hidden flex flex-col shadow-2xl">
          <div className="bg-neutral-900/50 px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-neutral-500" />
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Terminal Output</span>
            </div>
            {task.status === 'running' && <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />}
          </div>
          <div className="flex-grow p-4 overflow-y-auto font-mono text-sm text-neutral-300 space-y-1 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
            {task.logs.length === 0 ? (
              <span className="text-neutral-600 italic">Waiting for logs...</span>
            ) : (
              task.logs.map((log: string, i: number) => (
                <div key={i} className="break-all whitespace-pre-wrap border-l-2 border-transparent hover:border-neutral-700 pl-2 -ml-2 py-0.5">
                  <span className="text-neutral-600 mr-3 select-none">{log.match(/^\[(.*?)\]/)?.[1] || ''}</span>
                  <span>{log.replace(/^\[.*?\] /, '')}</span>
                </div>
              ))
            )}
            {task.status === 'running' && (
              <div className="h-4 w-2 bg-blue-500 animate-pulse mt-2" />
            )}
          </div>
        </div>

        {/* Info / Result Panel */}
        <div className="flex flex-col gap-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">Execution Result</h3>
            
            {task.result ? (
              <div className={cn(
                "rounded-lg p-4 font-mono text-sm border",
                task.status === 'failed' ? "bg-red-950/30 border-red-900/50 text-red-200" : "bg-green-950/30 border-green-900/50 text-green-200"
              )}>
                {task.status === 'failed' ? (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-red-400 mb-1">Execution Failed</div>
                      {JSON.stringify(task.result, null, 2)}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-green-400 mb-1">Success</div>
                      <div className="opacity-80">
                        Exit Code: {task.result.exitCode}<br/>
                        Output: {task.result.stdout || '(No output)'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-neutral-500 text-sm italic border border-dashed border-neutral-800 rounded-lg p-4 text-center">
                Execution in progress... result will appear here.
              </div>
            )}
          </div>

          {/* Placeholder for Mind Map */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex-grow flex flex-col">
             <h3 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">Plan (Mind Map)</h3>
             <div className="flex-grow bg-neutral-950 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-600 text-sm">
               Visualization Coming Soon
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
