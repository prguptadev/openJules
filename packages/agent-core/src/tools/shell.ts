import { execa } from 'execa';

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

export class ShellTool {
  constructor(private guardrail: Guardrail) {}

  async execute(command: string, cwd: string = process.cwd()): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const isSafe = await this.guardrail.validate(command);

    if (!isSafe) {
      throw new Error(`Command execution denied by user: ${command}`);
    }

    try {
      const { stdout, stderr, exitCode } = await execa(command, { shell: true, cwd });
      return { stdout, stderr, exitCode };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.exitCode || 1
      };
    }
  }
}
