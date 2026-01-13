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
import { BaseLlmClient } from '@open-jules/agent-core/dist/src/core/baseLlmClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { loadSettings } from '../config/settings.js';

// Model config aliases - maps internal aliases to actual Gemini models
const DEFAULT_MODEL_CONFIGS = {
  aliases: {
    'base': {
      modelConfig: {
        generateContentConfig: {
          temperature: 0,
          topP: 1,
        },
      },
    },
    'gemini-2.5-flash-base': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    'gemini-2.5-flash': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    'gemini-2.5-pro': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
    'gemini-2.5-flash-lite': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
      },
    },
    'edit-corrector': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      },
    },
    'summarizer-default': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          maxOutputTokens: 2000,
        },
      },
    },
    'llm-edit-fixer': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'next-speaker-checker': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'loop-detection': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'chat-compression-default': {
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
  },
};

export class AgentService {
  private client: GeminiClient;
  private config: Config;
  private toolRegistry: ToolRegistry;
  private messageBus: MessageBus;

  constructor(apiKey: string) {
    let finalKey = apiKey;
    const settings = loadSettings();

    // Inject GitHub token into process.env so shell commands can use it
    if (settings.github?.mode === 'token' && settings.github.token) {
      process.env.GITHUB_TOKEN = settings.github.token;
      process.env.GH_TOKEN = settings.github.token;
    }

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
      modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
      storage: { 
        getProjectTempDir: () => path.join(os.tmpdir(), 'open-jules'),
        getProjectRoot: () => workspaceRoot
      },
      sanitizationConfig: {
        allowedEnvironmentVariables: ['GITHUB_TOKEN', 'GH_TOKEN', 'HOME', 'PATH', 'USER', 'SHELL', 'LANG', 'TMPDIR', 'NODE_ENV'],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,  // Don't redact in local/server mode
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

      // File System - Mock implementations for server mode
      getFileService: () => ({
        // Returns filtered paths (no .git, node_modules, etc.)
        filterFilesWithReport: (paths: string[], options: any) => {
          const ignoredPatterns = ['.git', 'node_modules', '.DS_Store', '__pycache__', '.pyc', '.pyo'];
          const filteredPaths = paths.filter(p => {
            const parts = p.split(path.sep);
            return !parts.some(part => ignoredPatterns.some(pattern => part.includes(pattern)));
          });
          return { filteredPaths, ignoredCount: paths.length - filteredPaths.length };
        },
        getIgnoredPaths: () => [],
        isIgnored: () => false,
      }),
      getFileSystemService: () => ({
        readTextFile: async (filePath: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
          return fs.readFileSync(fullPath, 'utf-8');
        },
        writeTextFile: async (filePath: string, content: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, content, 'utf-8');
        },
        exists: async (filePath: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
          return fs.existsSync(fullPath);
        },
        stat: async (filePath: string) => {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
          return fs.statSync(fullPath);
        },
      }),
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
      getBaseLlmClient: () => new BaseLlmClient(configMock.getContentGenerator(), configMock),
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
      getQuotaErrorOccurred: () => false,
      getSkipNextSpeakerCheck: () => true,  // Skip next speaker check - uses internal model alias not available via API
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
        },
        generateContent: async (params: any) => {
           const genAI = new GoogleGenerativeAI(finalKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           const request: any = { contents: params.contents };
           if (params.config?.systemInstruction) request.systemInstruction = params.config.systemInstruction;
           if (params.config?.tools?.length > 0) request.tools = params.config.tools;
           if (params.config?.toolConfig) request.toolConfig = params.config.toolConfig;
           // Map generation config (filter out JS-specific fields not accepted by API)
           if (params.config) {
             const { systemInstruction, tools, toolConfig, abortSignal, ...genConfig } = params.config;
             if (Object.keys(genConfig).length > 0) {
               request.generationConfig = genConfig;
             }
           }
           const result = await model.generateContent(request);
           return result.response;
        },
        embedContent: async (params: any) => {
           const genAI = new GoogleGenerativeAI(finalKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           // Handle list of strings for BaseLlmClient compatibility
           if (Array.isArray(params.contents) && typeof params.contents[0] === 'string') {
             const result = await model.batchEmbedContents({
               requests: params.contents.map((t: string) => ({ content: { parts: [{ text: t }] }, taskType: 'RETRIEVAL_QUERY' }))
             });
             return result;
           }
           const result = await model.embedContent(params.contents);
           return result;
        },
        countTokens: async (params: any) => {
           const genAI = new GoogleGenerativeAI(finalKey);
           const model = genAI.getGenerativeModel({ model: params.model });
           const result = await model.countTokens(params.contents);
           return result;
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
      getUsageStatisticsEnabled: () => false,
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

  async executeToolCalls(toolCalls: Array<{ name: string; args: any; callId: string }>) {
    const results: Array<{ name: string; output: string; error?: string; exitCode?: number }> = [];
    const signal = new AbortController().signal;

    for (const toolCall of toolCalls) {
      try {
        const tool = this.toolRegistry.getTool(toolCall.name);
        if (!tool) {
          results.push({
            name: toolCall.name,
            output: '',
            error: `Tool "${toolCall.name}" not found`,
          });
          continue;
        }

        // Create invocation and execute - call the tool directly via invoke
        const invocation = (tool as any).createInvocation(
          toolCall.args,
          this.messageBus,
          toolCall.name,
          tool.displayName
        );

        const result = await invocation.execute(signal);

        results.push({
          name: toolCall.name,
          output: result.llmContent || result.returnDisplay || '',
          exitCode: (result as any).exitCode,
          error: result.error?.message,
        });
      } catch (e: any) {
        results.push({
          name: toolCall.name,
          output: '',
          error: e.message || 'Unknown error',
        });
      }
    }

    return results;
  }
}