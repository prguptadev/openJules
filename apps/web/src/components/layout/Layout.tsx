import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-screen bg-[#0A0A0A] text-gray-100 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {/* Top glossy bar effect */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50" />
        <Outlet />
      </main>
    </div>
  );
}
