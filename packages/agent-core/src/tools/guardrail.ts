export type ApprovalCallback = (command: string, reason: string) => Promise<boolean>;

export class Guardrail {
  private allowedCommands = ['ls', 'grep', 'cat', 'echo', 'git status', 'npm test', 'node', 'pwd'];
  private blockedCommands = ['rm', 'mv', 'chmod', 'chown', 'sudo', 'git push', 'gh pr create'];

  constructor(private approver: ApprovalCallback) {}

  async validate(command: string): Promise<boolean> {
    const baseCommand = command.trim().split(' ')[0];

    // Explicitly allowed?
    if (this.allowedCommands.includes(baseCommand)) {
      return true;
    }

    // Explicitly blocked OR unknown?
    const reason = this.blockedCommands.includes(baseCommand) 
      ? 'Destructive command detected' 
      : 'Unknown/Unverified command detected';

    return await this.approver(command, reason);
  }
}
