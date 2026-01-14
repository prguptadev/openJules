import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, ChevronDown, Loader2, Github, Lock, Globe, RefreshCw, LogOut, Check } from 'lucide-react';
import { useSession } from '../../lib/SessionContext';
import { sessionApi } from '../../lib/session';
import { useToast } from '../../lib/ToastContext';

export function RepoSelector() {
  const { session, sessionId, isLoading: sessionLoading, refreshSession, clearSession } = useSession();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowRepoDropdown(false);
        setShowBranchDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch GitHub OAuth status
  const { data: githubStatus } = useQuery({
    queryKey: ['githubStatus'],
    queryFn: sessionApi.getGitHubStatus,
  });

  // Fetch repos when session exists
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: ['repos', sessionId],
    queryFn: () => sessionApi.listRepos(sessionId!),
    enabled: !!sessionId && !!session,
  });

  // Fetch branches when repo is selected
  const { data: branches, isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', sessionId, session?.selectedRepo?.owner, session?.selectedRepo?.name],
    queryFn: () => sessionApi.listBranches(
      sessionId!,
      session!.selectedRepo!.owner,
      session!.selectedRepo!.name
    ),
    enabled: !!sessionId && !!session?.selectedRepo,
  });

  // Select repo mutation
  const selectRepo = useMutation({
    mutationFn: ({ repoId, branch }: { repoId: number; branch?: string }) =>
      sessionApi.selectRepo(sessionId!, repoId, branch),
    onSuccess: () => {
      setShowRepoDropdown(false);
      refreshSession();
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      addToast('Repository cloning started...', 'info');
    },
    onError: (error: any) => {
      addToast(`Failed to select repository: ${error.message}`, 'error');
    },
  });

  // Change branch mutation
  const changeBranch = useMutation({
    mutationFn: (branch: string) => sessionApi.changeBranch(sessionId!, branch),
    onMutate: () => {
      addToast('Switching branch...', 'info');
    },
    onSuccess: (_, branch) => {
      setShowBranchDropdown(false);
      refreshSession();
      addToast(`Switched to branch ${branch}`, 'success');
    },
    onError: (error: any) => {
      addToast(`Failed to switch branch: ${error.message}`, 'error');
    },
  });

  // Start GitHub OAuth flow
  const handleConnectGitHub = async () => {
    try {
      const { authUrl } = await sessionApi.startOAuthFlow(window.location.origin);
      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to start OAuth:', err);
    }
  };

  // Filter repos by search
  const filteredRepos = repos?.filter(repo =>
    repo.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  );

  // Not connected to GitHub
  if (!session) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1a1a1a] rounded-lg">
              <Github className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">Connect to GitHub</p>
              <p className="text-xs text-gray-500">Authorize access to your repositories</p>
            </div>
          </div>
          <button
            onClick={handleConnectGitHub}
            disabled={!githubStatus?.configured || sessionLoading}
            className="bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all border border-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sessionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Github className="h-4 w-4" />
            )}
            Connect GitHub
          </button>
        </div>
        {githubStatus && !githubStatus.configured && (
          <p className="text-xs text-yellow-500 mt-3">
            GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in server.
          </p>
        )}
      </div>
    );
  }

  // Connected - show repo selector
  return (
    <div ref={containerRef} className="bg-[#111] border border-[#222] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <img
            src={session.githubUser?.avatarUrl}
            alt={session.githubUser?.login}
            className="h-8 w-8 rounded-full border border-[#333]"
          />
          <div>
            <p className="text-sm font-medium text-gray-200">{session.githubUser?.name || session.githubUser?.login}</p>
            <p className="text-xs text-gray-500">@{session.githubUser?.login}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshSession()}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#222] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={clearSession}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-[#222] rounded-lg transition-colors"
            title="Disconnect"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Repository selector */}
        <div className="relative flex-1">
          <button
            onClick={() => {
              setShowRepoDropdown(!showRepoDropdown);
              setShowBranchDropdown(false);
            }}
            disabled={session.status === 'cloning'}
            className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-lg px-3 py-2 flex items-center justify-between text-sm transition-colors disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2 truncate">
              {session.selectedRepo ? (
                <>
                  {session.selectedRepo.private ? (
                    <Lock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-gray-200 truncate">{session.selectedRepo.fullName}</span>
                  {session.status === 'cloning' && (
                    <div className="flex items-center gap-1.5 ml-2 px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] font-medium text-indigo-400 uppercase tracking-wider">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Cloning
                    </div>
                  )}
                </>
              ) : (
                <span className="text-gray-500">Select a repository...</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          </button>

          {showRepoDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 max-h-80 overflow-hidden">
              <div className="p-2 border-b border-[#333]">
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto max-h-60">
                {reposLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : filteredRepos?.length === 0 ? (
                  <p className="text-sm text-gray-500 p-4 text-center">No repositories found</p>
                ) : (
                  filteredRepos?.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => {
                        setShowRepoDropdown(false);
                        selectRepo.mutate({ repoId: repo.id });
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#222] text-left transition-colors"
                    >
                      {repo.private ? (
                        <Lock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                      ) : (
                        <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 truncate">{repo.fullName}</p>
                        {repo.description && (
                          <p className="text-xs text-gray-500 truncate">{repo.description}</p>
                        )}
                      </div>
                      {repo.language && (
                        <span className="text-xs text-gray-500 px-2 py-0.5 bg-[#111] rounded">
                          {repo.language}
                        </span>
                      )}
                      {session.selectedRepo?.id === repo.id && (
                        <Check className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Branch selector */}
        {session.selectedRepo && (
          <div className="relative">
            <button
              onClick={() => {
                setShowBranchDropdown(!showBranchDropdown);
                setShowRepoDropdown(false);
              }}
              disabled={session.status === 'cloning'}
              className="bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-lg px-3 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
            >
              <GitBranch className="h-4 w-4 text-gray-400" />
              <span className="text-gray-200">{session.selectedBranch || 'main'}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showBranchDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 min-w-[200px] max-h-60 overflow-y-auto">
                {branchesLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  branches?.map((branch) => (
                    <button
                      key={branch.name}
                      onClick={() => {
                        setShowBranchDropdown(false);
                        changeBranch.mutate(branch.name);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#222] text-left transition-colors"
                    >
                      <GitBranch className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-200 flex-1">{branch.name}</span>
                      {branch.protected && (
                        <Lock className="h-3 w-3 text-yellow-500" />
                      )}
                      {session.selectedBranch === branch.name && (
                        <Check className="h-4 w-4 text-indigo-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status indicator */}
      {session.status !== 'idle' && (
        <div className="mt-3 flex items-center gap-2">
          {session.status === 'cloning' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              <span className="text-sm text-indigo-400">Repository cloning started...</span>
            </>
          )}
          {session.status === 'ready' && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-400">Ready</span>
            </>
          )}
          {session.status === 'error' && (
            <>
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm text-red-400">{session.statusMessage || 'Error'}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
