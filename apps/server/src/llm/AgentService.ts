import { 
  GeminiClient,
  ToolRegistry, 
  ShellTool, 
  ReadFileTool, 
  WriteFileTool, 
  LSTool, 
  GrepTool, 
  GlobTool,
  MessageBus,
  getCoreSystemPrompt
} from '@open-jules/agent-core';
import { Config, ModelConfigService } from '@open-jules/agent-core/dist/src/config/config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { loadSettings } from '../config/settings.js';

export class AgentService {
  private client: GeminiClient;
  private config: Config;
  private toolRegistry: ToolRegistry;
  private messageBus: MessageBus;

  constructor(apiKey: string) {
    let finalKey = apiKey;
    const settings = loadSettings();

    // Try to find existing credentials
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
              if (json.apiKey) { finalKey = json.apiKey; break; }
            } else if (loc.endsWith('.yaml')) {
              const parsed = yaml.load(content) as any;
              if (parsed?.apiKey) { finalKey = parsed.apiKey; break; }
            }
          }
        }
      } catch (e) {}
    }

    if (!finalKey || finalKey === 'PLACEHOLDER_KEY') {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const workspaceRoot = settings.github?.workspacePath || process.cwd();
    if (!fs.existsSync(workspaceRoot)) fs.mkdirSync(workspaceRoot, { recursive: true });

    this.messageBus = new MessageBus();

    const configMock: any = {
      // Identity & Core
      getSessionId: () => 'session-' + Date.now(),
      modelConfigService: new ModelConfigService(),
      storage: { 
        getProjectTempDir: () => path.join(os.tmpdir(), 'open-jules'),
        getProjectRoot: () => workspaceRoot
      },
      sanitizationConfig: {
        env: {
          ...process.env,
          ...(settings.github?.mode === 'token' && settings.github.token 
              ? { GITHUB_TOKEN: settings.github.token, GH_TOKEN: settings.github.token } 
              : {})
        }
      },

      // Paths
      getTargetDir: () => workspaceRoot,
      getProjectRoot: () => workspaceRoot,
      getWorkingDir: () => workspaceRoot,
      getWorkspaceContext: () => ({ 
        isPathWithinWorkspace: (p: string) => !path.relative(workspaceRoot, p).startsWith('..'), 
        getDirectories: () => [],
        getProjectRoot: () => workspaceRoot 
      }),

      // File System
      getFileService: () => ({}),
      getFileSystemService: () => ({}),
      getFileExclusions: () => ({ getGlobExcludes: () => [], getReadManyFilesExcludes: () => [] }),
      getFileFilteringOptions: () => ({ respectGitIgnore: true, respectGeminiIgnore: true }),
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      isTrustedFolder: () => true,
      getFolderTrust: () => true,

      // Tools
      getAllowedTools: () => [],
      getExcludeTools: () => new Set(),
      getToolCallCommand: () => '',
      getToolDiscoveryCommand: () => '',
      getMcpServerCommand: () => '',
      getMcpEnabled: () => true,
      getExtensionsEnabled: () => false,
      getSummarizeToolOutputConfig: () => ({}),
      getShellToolInactivityTimeout: () => 60000,
      getEnableShellOutputEfficiency: () => true,
      getShellOutputEfficiencyThreshold: () => 1000,
      getSummarizeToolOutputThreshold: () => 1000,
      getEnableInteractiveShell: () => settings.enabledSkills.terminal,
      isInteractiveShellEnabled: () => settings.enabledSkills.terminal,
      getToolRegistry: () => this.toolRegistry,
      getSkillManager: () => ({ getSkills: () => [], getSkill: () => null }),
      getPromptRegistry: () => ({ getAllPrompts: () => [] }),
      getResourceRegistry: () => ({}),

      // MCP
      getAllowedMcpServers: () => [],
      getBlockedMcpServers: () => [],
      getMcpServers: () => settings.mcpServers,

      // LLM & Clients
      getGeminiClient: () => new GoogleGenerativeAI(finalKey),
      getBaseLlmClient: () => new GoogleGenerativeAI(finalKey),
      getModelRouterService: () => ({ 
        route: async (req: any) => ({ model: settings.activeModel, config: {} }) 
      }),
      getActiveModel: () => settings.activeModel,
      setActiveModel: (model: string) => { settings.activeModel = model; },
      getModel: () => settings.activeModel,
      getModelAvailabilityService: () => ({ 
        markHealthy: () => {}, 
        recordFailure: () => {},
        selectFirstAvailable: (models: string[]) => models[0]
      }),
      getModelPolicyService: () => ({}),
      getEnvironmentSanitizationConfig: () => ({}),
      getRetryFetchErrors: () => true,
      getPreviewFeatures: () => false,
      getEnableHooks: () => false,
      isJitContextEnabled: () => false,
      getInactivityTimeout: () => 60000,
      getExecutionTimeout: () => 300000,
      getMaxSessionTurns: () => 100,
      getCompressionThreshold: async () => 30000,
      getChatCompressionThreshold: () => 30000,
      getContentGeneratorConfig: () => ({}),
      getContentGenerator: () => ({
        generateContentStream: async (params: any) => {
           const genAI = new GoogleGenerativeAI(finalKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           const request: any = { contents: params.contents };
           if (params.config?.systemInstruction) request.systemInstruction = params.config.systemInstruction;
           if (params.config?.tools?.length > 0) request.tools = params.config.tools;
           if (params.config?.toolConfig) request.toolConfig = params.config.toolConfig;
           const result = await model.generateContentStream(request);
           return result.stream;
        }
      }),

      // UI & Debug
      getDebugMode: () => true,
      isInteractive: () => false,
      resetTurn: () => {},
      getTurnLimit: () => 100,
      getEnvironmentMemory: () => '',
      getSkillMemory: () => '',
      getUserMemory: () => '',
      getGlobalMemory: () => '',
      getMessageBus: () => this.messageBus,
      getHookSystem: () => null,
      getHooks: () => undefined,
      getProjectHooks: () => undefined,
      getDisabledHooks: () => [],
      getApprovalMode: () => 'always',
      setApprovalMode: () => {},
      getIdeMode: () => false,
      getTelemetryEnabled: () => false,
      getContinueOnFailedApiCall: () => true,
    };

    this.config = configMock as unknown as Config;
    this.toolRegistry = new ToolRegistry(this.config, this.messageBus);
    
    if (settings.enabledSkills.terminal) this.toolRegistry.registerTool(new ShellTool(this.config, this.messageBus));
    if (settings.enabledSkills.filesystem) {
      this.toolRegistry.registerTool(new ReadFileTool(this.config, this.messageBus));
      this.toolRegistry.registerTool(new WriteFileTool(this.config, this.messageBus));
      this.toolRegistry.registerTool(new LSTool(this.config, this.messageBus));
      this.toolRegistry.registerTool(new GrepTool(this.config, this.messageBus));
      this.toolRegistry.registerTool(new GlobTool(this.config, this.messageBus));
    }

    configMock.getToolRegistry = () => this.toolRegistry;
    configMock.getAgentRegistry = () => ({ getAgent: () => null, getDirectoryContext: () => null });

    this.client = new GeminiClient(this.config);
  }

  async sendMessage(message: string) {
    if (!(this.client as any).chat) {
      await this.client.initialize();
    }
    const signal = new AbortController().signal;
    const promptId = this.config.getSessionId();
    return this.client.sendMessageStream(message, signal, promptId);
  }
}