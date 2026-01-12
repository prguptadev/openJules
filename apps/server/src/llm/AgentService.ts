import { GeminiChat } from '@open-jules/agent-core';
import { Config, ModelConfigService } from '@open-jules/agent-core/dist/src/config/config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

export class AgentService {
  private chat: GeminiChat;
  private config: Config;

  constructor(apiKey: string) {
    let finalKey = apiKey;

    // Try to find existing credentials if not provided
    if (!finalKey || finalKey === 'PLACEHOLDER_KEY') {
      try {
        const home = os.homedir();
        const locations = [
          path.join(home, '.config', 'google-gemini-cli', 'credentials.json'),
          path.join(home, '.gemini', 'config.yaml'),
        ];

        for (const loc of locations) {
          if (fs.existsSync(loc)) {
            const content = fs.readFileSync(loc, 'utf8');
            if (loc.endsWith('.json')) {
              const json = JSON.parse(content);
              if (json.apiKey) {
                finalKey = json.apiKey;
                break;
              }
            } else if (loc.endsWith('.yaml')) {
              const parsed = yaml.load(content) as any;
              if (parsed?.apiKey) {
                finalKey = parsed.apiKey;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.warn("[AgentService] Failed to load local credentials:", e);
      }
    }

    if (!finalKey || finalKey === 'PLACEHOLDER_KEY') {
      throw new Error("GEMINI_API_KEY is missing. Please set it in .env or ~/.gemini/config.yaml");
    }

    // 1. Setup Mock Config
    this.config = {
      // Identity & Core
      getSessionId: () => 'session-' + Date.now(),
      modelConfigService: new ModelConfigService(),
      storage: { getProjectTempDir: () => '/tmp' },
      sanitizationConfig: {},

      // Paths
      getTargetDir: () => process.cwd(),
      getProjectRoot: () => process.cwd(), // Added missing method
      getWorkspaceContext: () => ({ 
        isPathWithinWorkspace: () => true, 
        getDirectories: () => [],
        getProjectRoot: () => process.cwd() 
      }),

      // File System
      getFileService: () => ({}),
      getFileSystemService: () => ({}), // Added missing getter
      getFileExclusions: () => ({ getGlobExcludes: () => [], getReadManyFilesExcludes: () => [] }),
      getFileFilteringOptions: () => ({ respectGitIgnore: true, respectGeminiIgnore: true }),
      getFileFilteringRespectGeminiIgnore: () => true,
      isTrustedFolder: () => true,

      // Tools
      getAllowedTools: () => [],
      getExcludeTools: () => new Set(),
      getToolCallCommand: () => '',
      getToolDiscoveryCommand: () => '',
      getSummarizeToolOutputConfig: () => ({}),
      getShellToolInactivityTimeout: () => 60000,
      getEnableInteractiveShell: () => false,
      getToolRegistry: () => ({ getAllTools: () => [] }),
      getSkillManager: () => ({ getSkills: () => [], getSkill: () => null }),

      // MCP
      getAllowedMcpServers: () => [],
      getBlockedMcpServers: () => [],
      getMcpServers: () => ({}),
      getMcpServerCommand: () => '',

      // LLM & Clients
      getGeminiClient: () => new GoogleGenerativeAI(finalKey),
      getBaseLlmClient: () => new GoogleGenerativeAI(finalKey),
      getActiveModel: () => 'gemini-2.0-flash',
      getRetryFetchErrors: () => true,
      getPreviewFeatures: () => false,
      getContentGeneratorConfig: () => ({}),
      getContentGenerator: () => ({
        generateContentStream: async (params: any) => {
           const genAI = new GoogleGenerativeAI(finalKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           // Correctly wrap contents and systemInstruction if present
           const request: any = {
             contents: params.contents,
           };
           if (params.config?.systemInstruction) {
             request.systemInstruction = params.config.systemInstruction;
           }
           if (params.config?.tools?.length > 0) {
             request.tools = params.config.tools;
           }
           if (params.config?.toolConfig) {
             request.toolConfig = params.config.toolConfig;
           }
           const result = await model.generateContentStream(request);
           return result.stream;
        }
      }),

      // UI & Debug
      getDebugMode: () => true,
      getEnableHooks: () => false,
      getMessageBus: () => null,
      getApprovalMode: () => 'always',
      setApprovalMode: () => {},
      getIdeMode: () => false,
      getPromptRegistry: () => ({}),
      getResourceRegistry: () => ({}),
    } as unknown as Config;

    // 2. Initialize Chat
    this.chat = new GeminiChat(this.config);
  }

  async sendMessage(message: string) {
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