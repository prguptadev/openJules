// @ts-nocheck
import { MessageBus } from '../confirmation-bus/message-bus.js';

export interface Config {
  // Identity & Core
  getSessionId(): string;
  modelConfigService: any;
  storage: any;
  sanitizationConfig: any;

  // Paths
  getTargetDir(): string;
  getProjectRoot(): string;
  getWorkspaceContext(): any;

  // File System
  getFileService(): any;
  getFileSystemService(): any;
  getFileExclusions(): any;
  getFileFilteringOptions(): any;
  getFileFilteringRespectGeminiIgnore(): boolean;
  isTrustedFolder(): boolean;

  // Tools
  getAllowedTools(): string[];
  getExcludeTools(): Set<string>;
  getToolCallCommand(): string;
  getToolDiscoveryCommand(): string;
  getSummarizeToolOutputConfig(): any;
  getShellToolInactivityTimeout(): number;
  getEnableInteractiveShell(): boolean;
  getToolRegistry(): any;
  getSkillManager(): any;

  // MCP
  getAllowedMcpServers(): string[];
  getBlockedMcpServers(): string[];
  getMcpServers(): any;
  getMcpServerCommand(): string;

  // LLM & Clients
  getGeminiClient(): any;
  getBaseLlmClient(): any;
  getActiveModel(): string;
  getRetryFetchErrors(): boolean;
  getPreviewFeatures(): boolean;
  getContentGeneratorConfig(): any;
  getContentGenerator(): any;

  // UI & Debug
  getDebugMode(): boolean;
  getEnableHooks(): boolean;
  getMessageBus(): MessageBus;
  getApprovalMode(): string;
  setApprovalMode(mode: string): void;
  getIdeMode(): boolean;
  getPromptRegistry(): any;
  getResourceRegistry(): any;
}

export class ModelConfigService {
  getResolvedConfig(key: any): any {
    return { model: key.model || 'gemini-2.0-flash', generateContentConfig: {} };
  }
}

export function loadConfig(): Config { return {} as any; }
export function setTargetDir(dir: string): void {}
export function loadEnvironment(): void {}