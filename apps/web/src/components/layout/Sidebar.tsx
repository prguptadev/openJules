import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  GitBranch, 
  Settings, 
  Terminal, 
  History,
  Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';

export function Sidebar() {
  const navItems = [
    { icon: LayoutDashboard, label: 'Overview', to: '/' },
    { icon: Activity, label: 'Active Tasks', to: '/active' },
    { icon: History, label: 'History', to: '/history' },
    { icon: GitBranch, label: 'Integrations', to: '/integrations' },
    { icon: Settings, label: 'Settings', to: '/settings' },
  ];

  return (
    <div className="w-16 lg:w-64 border-r border-[#222] bg-[#0F0F0F] flex flex-col h-full transition-all duration-300">
      <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-[#222]">
        <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Terminal className="text-white h-5 w-5" />
        </div>
        <span className="ml-3 font-bold text-lg hidden lg:block tracking-tight text-white">KODE</span>
      </div>

      <nav className="flex-1 py-6 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              "flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
              isActive 
                ? "bg-indigo-500/10 text-indigo-400" 
                : "text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="ml-3 font-medium hidden lg:block text-sm">{item.label}</span>
            
            {/* Tooltip for collapsed state */}
            <div className="absolute left-14 bg-[#333] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 lg:hidden pointer-events-none whitespace-nowrap z-50">
              {item.label}
            </div>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-[#222]">
        <div className="flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-white">Dev User</p>
            <p className="text-xs text-gray-500">Pro Plan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
