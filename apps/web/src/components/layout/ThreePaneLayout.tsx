import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useSession } from '../../lib/SessionContext';

export function ThreePaneLayout() {
  const { session } = useSession();

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-gray-100 overflow-hidden font-sans">
      {/* Left Pane: Navigation & History */}
      <Sidebar />

      {/* Middle Pane: Main Workspace (Chat/Plan) */}
      <main className="flex-1 overflow-hidden relative flex flex-col min-w-0 border-r border-[#222]">
        {/* Top glossy bar effect */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50 z-10" />
        <Outlet />
      </main>
    </div>
  );
}
