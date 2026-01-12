import { execa } from 'execa';
export class Guardrail {
    approver;
    allowedCommands = ['ls', 'grep', 'cat', 'echo', 'git status', 'npm test', 'node', 'pwd'];
    blockedCommands = ['rm', 'mv', 'chmod', 'chown', 'sudo', 'git push', 'gh pr create'];
    constructor(approver) {
        this.approver = approver;
    }
    async validate(command) {
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
    guardrail;
    constructor(guardrail) {
        this.guardrail = guardrail;
    }
    async execute(command, cwd = process.cwd()) {
        const isSafe = await this.guardrail.validate(command);
        if (!isSafe) {
            throw new Error(`Command execution denied by user: ${command}`);
        }
        try {
            const { stdout, stderr, exitCode } = await execa(command, { shell: true, cwd });
            return { stdout, stderr, exitCode };
        }
        catch (error) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.exitCode || 1
            };
        }
    }
}
