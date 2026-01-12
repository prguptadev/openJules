
import { MessageBus } from '../confirmation-bus/message-bus.js';

export interface Config {
  modelConfigService: any;
  getRetryFetchErrors(): boolean;
  getPreviewFeatures(): boolean;
  getActiveModel(): string;
  getContentGeneratorConfig(): any;
  getEnableHooks(): boolean;
  getMessageBus(): any;
  getContentGenerator(): any;
  getToolRegistry(): any;
  getTargetDir(): string;
  getWorkspaceContext(): any;
  getFileService(): any;
  getFileExclusions(): any;
  getFileFilteringOptions(): any;
  getDebugMode(): boolean;
  getApprovalMode(): any;
  setApprovalMode(mode: any): void;
  getIdeMode(): boolean;
  getSkillManager(): any;
  getPromptRegistry(): any;
  getResourceRegistry(): any;
  isTrustedFolder(): boolean;
  getMcpServers(): any;
  getMcpServerCommand(): any;
  getToolCallCommand(): any;
  getToolDiscoveryCommand(): any;
  getExcludeTools(): any;
  getSummarizeToolOutputConfig(): any;
  getShellToolInactivityTimeout(): number;
  getEnableInteractiveShell(): boolean;
  sanitizationConfig: any;
  getGeminiClient(): any;
  getBaseLlmClient(): any;
  storage: any;
  getFileFilteringRespectGeminiIgnore(): boolean;
}

export class ModelConfigService {
  getResolvedConfig(key: any): any {
    return { model: key.model || 'gemini-2.0-flash', generateContentConfig: {} };
  }
}

export function loadConfig(settings: any, loader: any, id: string): Config {
  return {} as any;
}

export function setTargetDir(dir: any): string {
  return dir || process.cwd();
}

export function loadEnvironment() {}
