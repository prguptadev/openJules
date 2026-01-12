
export interface Content {
  role: string;
  parts: Part[];
}

export interface Part {
  text?: string;
  inlineData?: any;
  fileData?: any;
  functionCall?: FunctionCall;
  functionResponse?: any;
  thought?: boolean;
  thoughtSignature?: string;
}

export interface FunctionCall {
  name: string;
  args: object;
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: any;
}

export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
}

export interface CallableTool extends Tool {
  // Marker interface
}

export type PartListUnion = string | (string | Part)[];
export type PartUnion = Part; // Add alias

export interface GenerateContentConfig {
  systemInstruction?: string | Content;
  tools?: Tool[];
  toolConfig?: any;
  abortSignal?: AbortSignal;
}

export interface GenerateContentParameters {
  model: string;
  contents: Content[];
  config?: GenerateContentConfig;
}

export interface GenerateContentResponseUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GenerateContentResponse {
  candidates?: any[];
  usageMetadata?: GenerateContentResponseUsageMetadata;
  functionCalls?: FunctionCall[];
  responseId?: string;
}

export interface GroundingMetadata {
  // Stub
}

export const Type = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

export function createUserContent(parts: PartListUnion): Content {
  return {
    role: 'user',
    parts: typeof parts === 'string' ? [{ text: parts }] : (parts as any[]).map(p => typeof p === 'string' ? { text: p } : p)
  };
}

export function mcpToTool(mcpTool: any): Tool {
    return { functionDeclarations: [mcpTool] }; // Simple stub
}

export enum FinishReason {
  STOP = 'STOP',
  MAX_TOKENS = 'MAX_TOKENS',
  SAFETY = 'SAFETY',
  RECITATION = 'RECITATION',
  OTHER = 'OTHER',
  MALFORMED_FUNCTION_CALL = 'MALFORMED_FUNCTION_CALL'
}

export class ApiError extends Error {
  status?: number;
}
