import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { TaskInput } from '../components/features/TaskInput';
import { TaskList } from '../components/features/TaskList';

export default function Dashboard() {
  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const res = await axios.get('/api/auth/status');
      return res.data;
    }
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-none pb-20">
      <div className="max-w-5xl mx-auto p-6 lg:p-10 space-y-10">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back, Developer</h1>
            <p className="text-gray-400">What would you like to build today?</p>
          </div>
          {authStatus && !authStatus.configured && (
            <Link to="/settings" className="flex items-center gap-2 bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors animate-pulse">
              <AlertTriangle className="h-4 w-4" />
              <span>Setup API Key</span>
            </Link>
          )}
        </header>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">New Command</h2>
          <TaskInput />
        </section>

        <section>
          <TaskList />
        </section>
      </div>
    </div>
  );
}