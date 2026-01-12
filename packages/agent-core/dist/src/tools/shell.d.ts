export type ApprovalCallback = (command: string, reason: string) => Promise<boolean>;
export declare class Guardrail {
    private approver;
    private allowedCommands;
    private blockedCommands;
    constructor(approver: ApprovalCallback);
    validate(command: string): Promise<boolean>;
}
export declare class ShellTool {
    private guardrail;
    constructor(guardrail: Guardrail);
    execute(command: string, cwd?: string): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
}
