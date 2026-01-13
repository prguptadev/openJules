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
  getQuotaErrorOccurred(): boolean;
  getSkipNextSpeakerCheck(): boolean;
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

export interface ModelConfigAlias {
  extends?: string;
  modelConfig: {
    model?: string;
    generateContentConfig?: Record<string, any>;
  };
}

export interface ModelConfigServiceConfig {
  aliases?: Record<string, ModelConfigAlias>;
}

export class ModelConfigService {
  private aliases: Record<string, ModelConfigAlias>;

  constructor(config?: ModelConfigServiceConfig) {
    this.aliases = config?.aliases || {};
  }

  getResolvedConfig(key: any): any {
    const requestedModel = key.model || 'gemini-2.5-flash';

    // Try to resolve through aliases
    let resolvedModel = requestedModel;
    let resolvedConfig: Record<string, any> = {};

    const resolveAlias = (aliasName: string, visited = new Set<string>()): void => {
      if (visited.has(aliasName)) return;
      visited.add(aliasName);

      const alias = this.aliases[aliasName];
      if (!alias) return;

      // First resolve parent
      if (alias.extends) {
        resolveAlias(alias.extends, visited);
      }

      // Then apply this alias's config
      if (alias.modelConfig.model) {
        resolvedModel = alias.modelConfig.model;
      }
      if (alias.modelConfig.generateContentConfig) {
        resolvedConfig = { ...resolvedConfig, ...alias.modelConfig.generateContentConfig };
      }
    };

    resolveAlias(requestedModel);

    return {
      model: resolvedModel,
      generateContentConfig: resolvedConfig,
      config: resolvedConfig  // Some code expects 'config' instead of 'generateContentConfig'
    };
  }
}

export function loadConfig(): Config { return {} as any; }
export function setTargetDir(dir: string): void {}
export function loadEnvironment(): void {}