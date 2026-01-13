export type ApprovalCallback = (command: string, reason: string) => Promise<boolean>;

export class Guardrail {
  // Safe read-only commands
  private allowedCommands = [
    'ls', 'grep', 'cat', 'echo', 'pwd', 'head', 'tail', 'find', 'which', 'env',
    'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',
    'python', 'python3', 'pip', 'pip3',
    'git', 'gh',  // Allow git and GitHub CLI (specific dangerous ops blocked below)
  ];

  // Git commands that are safe (read-only or local-only)
  private allowedGitCommands = [
    'git status', 'git log', 'git diff', 'git branch', 'git show',
    'git clone', 'git fetch', 'git pull', 'git checkout', 'git switch',
    'git add', 'git commit', 'git stash', 'git merge', 'git rebase',
    'git remote', 'git config', 'git init', 'git rev-parse',
  ];

  // GitHub CLI commands that are allowed
  private allowedGhCommands = [
    'gh repo clone', 'gh repo view', 'gh pr list', 'gh pr view',
    'gh pr create', 'gh pr checkout', 'gh issue list', 'gh issue view',
    'gh auth status', 'gh api',
  ];

  // Truly dangerous commands that should never run without approval
  private blockedCommands = [
    'rm -rf /', 'rm -rf ~', 'rm -rf *',  // Destructive removes
    'chmod 777', 'chown',                  // Permission changes
    'sudo', 'su',                          // Privilege escalation
    'git push --force', 'git push -f',     // Force push (can lose history)
    'git reset --hard HEAD~',              // Can lose commits
    '> /dev/', 'dd if=',                   // System-level dangerous
    'mkfs', 'fdisk', 'parted',             // Disk operations
    ':(){:|:&};:',                          // Fork bomb
  ];

  constructor(private approver: ApprovalCallback) {}

  async validate(command: string): Promise<boolean> {
    const trimmedCommand = command.trim();
    const baseCommand = trimmedCommand.split(' ')[0];

    // Check for explicitly blocked dangerous patterns
    for (const blocked of this.blockedCommands) {
      if (trimmedCommand.includes(blocked)) {
        return await this.approver(command, `Dangerous command pattern detected: ${blocked}`);
      }
    }

    // Check git subcommands specifically
    if (baseCommand === 'git') {
      for (const allowed of this.allowedGitCommands) {
        if (trimmedCommand.startsWith(allowed)) {
          return true;
        }
      }
      // git push (non-force) needs approval but is allowed
      if (trimmedCommand.startsWith('git push')) {
        return await this.approver(command, 'Git push requires confirmation');
      }
    }

    // Check gh (GitHub CLI) subcommands
    if (baseCommand === 'gh') {
      for (const allowed of this.allowedGhCommands) {
        if (trimmedCommand.startsWith(allowed)) {
          return true;
        }
      }
    }

    // Check base command allowlist
    if (this.allowedCommands.includes(baseCommand)) {
      return true;
    }

    // Unknown command - ask for approval
    return await this.approver(command, 'Unknown/Unverified command detected');
  }
}
