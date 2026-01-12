import { GeminiChat } from '@open-jules/agent-core';
import { Config, ModelConfigService } from '@open-jules/agent-core/dist/src/config/config.js';
import { debugLogger } from '@open-jules/agent-core/dist/src/utils/debugLogger.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class AgentService {
  private chat: GeminiChat;
  private config: Config;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");

    // 1. Setup Mock Config (Since we don't have the full CLI config system)
    this.config = {
      getGeminiClient: () => new GoogleGenerativeAI(apiKey),
      getBaseLlmClient: () => new GoogleGenerativeAI(apiKey), // Alias
      getDebugMode: () => true,
      getEnableHooks: () => false,
      getMessageBus: () => null, // No message bus for now
      modelConfigService: new ModelConfigService(),
      // Stub required methods
      getTargetDir: () => process.cwd(),
      getWorkspaceContext: () => ({ isPathWithinWorkspace: () => true, getDirectories: () => [] }),
      getFileService: () => ({}),
      getFileExclusions: () => ({ getGlobExcludes: () => [], getReadManyFilesExcludes: () => [] }),
      getFileFilteringOptions: () => ({ respectGitIgnore: true, respectGeminiIgnore: true }),
      getFileFilteringRespectGeminiIgnore: () => true,
      getAllowedTools: () => [],
      getExcludeTools: () => new Set(),
      getToolCallCommand: () => '',
      getToolDiscoveryCommand: () => '',
      getSummarizeToolOutputConfig: () => ({}),
      getShellToolInactivityTimeout: () => 60000,
      getEnableInteractiveShell: () => false,
      getAllowedMcpServers: () => [],
      getBlockedMcpServers: () => [],
      getMcpServers: () => ({}),
      getMcpServerCommand: () => '',
      getApprovalMode: () => 'always',
      setApprovalMode: () => {},
      getIdeMode: () => false,
      getSkillManager: () => ({ getSkills: () => [], getSkill: () => null }),
      getPromptRegistry: () => ({}),
      getResourceRegistry: () => ({}),
      isTrustedFolder: () => true,
      getRetryFetchErrors: () => true,
      getPreviewFeatures: () => false,
      getActiveModel: () => 'gemini-2.0-flash',
      getContentGeneratorConfig: () => ({}),
      getContentGenerator: () => ({
        generateContentStream: async (params: any) => {
           // Direct shim to Google SDK if Config fails
           const genAI = new GoogleGenerativeAI(apiKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           return model.generateContentStream(params.contents);
        }
      }),
      getToolRegistry: () => ({ getAllTools: () => [] }),
      sanitizationConfig: {},
      storage: { getProjectTempDir: () => '/tmp' }
    } as unknown as Config;

    // 2. Initialize Chat
    this.chat = new GeminiChat(this.config);
  }

  async sendMessage(message: string) {
    // Convert string to Part[] format expected by GeminiChat
    const parts = [{ text: message }];
    
    const stream = await this.chat.sendMessageStream(
      { model: 'gemini-2.0-flash' },
      parts,
      'default-prompt-id',
      new AbortController().signal
    );

    return stream;
  }
}
