import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { GitBranch, Terminal, FolderOpen, Server, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Integrations() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await axios.get('/api/settings');
      return res.data;
    }
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: any) => {
      return axios.post('/api/settings', newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });

  const toggleSkill = (skill: string) => {
    if (!settings) return;
    updateSettings.mutate({
      enabledSkills: {
        ...settings.enabledSkills,
        [skill]: !settings.enabledSkills[skill]
      }
    });
  };

  const SkillCard = ({ id, label, icon: Icon, description }: any) => (
    <div className="flex items-center justify-between p-4 bg-[#111] border border-[#222] rounded-xl hover:border-[#333] transition-colors">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 bg-[#1A1A1A] rounded-lg flex items-center justify-center text-gray-400">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-medium text-gray-200">{label}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button 
        onClick={() => toggleSkill(id)}
        className={cn("transition-colors", settings?.enabledSkills[id] ? "text-indigo-500" : "text-gray-600")}
      >
        {settings?.enabledSkills[id] ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
      </button>
    </div>
  );

  if (isLoading) return <div className="p-8 text-gray-500">Loading settings...</div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-none p-6 lg:p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
        <GitBranch className="h-6 w-6 text-indigo-500" />
        Integrations & Skills
      </h1>
      <p className="text-gray-400 mb-8">Manage the tools and external services OpenJules can access.</p>

      <div className="space-y-8">
        {/* Built-in Skills */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 px-1">Core Skills</h2>
          <div className="grid gap-4">
            <SkillCard 
              id="git" 
              label="Git Integration" 
              icon={GitBranch} 
              description="Clone repositories, create branches, and commit changes." 
            />
            <SkillCard 
              id="terminal" 
              label="Terminal Access" 
              icon={Terminal} 
              description="Execute shell commands and run scripts." 
            />
            <SkillCard 
              id="filesystem" 
              label="File System" 
              icon={FolderOpen} 
              description="Read, write, and modify files in the workspace." 
            />
          </div>
        </section>

        {/* MCP Servers */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">MCP Servers</h2>
            <button className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
              <Plus className="h-3 w-3" /> Add Server
            </button>
          </div>
          
          <div className="bg-[#111] border border-dashed border-[#222] rounded-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1A1A1A] text-gray-500 mb-3">
              <Server className="h-6 w-6" />
            </div>
            <h3 className="text-gray-300 font-medium mb-1">No MCP Servers Connected</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
              Connect external tools like GitHub, Jira, or PostgreSQL using the Model Context Protocol.
            </p>
            <button className="bg-[#222] hover:bg-[#2A2A2A] text-gray-300 px-4 py-2 rounded-lg text-sm transition-colors border border-[#333]">
              Configure GitHub MCP
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}