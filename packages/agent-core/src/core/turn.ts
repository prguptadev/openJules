// @ts-nocheck
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
  FinishReason,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type {
  ToolCallConfirmationDetails,
  ToolResult,
} from '../tools/tools.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../utils/errors.js';
import type { GeminiChat } from './geminiChat.js';
import { InvalidStreamError } from './geminiChat.js';
import { parseThought, type ThoughtSummary } from '../utils/thoughtUtils.js';
import { createUserContent } from '@google/genai';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { getCitations, getFunctionCalls } from '../utils/generateContentResponseUtilities.js';

import {
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
} from '../scheduler/types.js';

export interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  shouldConfirmExecute(
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
}

export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  Thought = 'thought',
  MaxSessionTurns = 'max_session_turns',
  Finished = 'finished',
  LoopDetected = 'loop_detected',
  Citation = 'citation',
  Retry = 'retry',
  ContextWindowWillOverflow = 'context_window_will_overflow',
  InvalidStream = 'invalid_stream',
  ModelInfo = 'model_info',
  AgentExecutionStopped = 'agent_execution_stopped',
  AgentExecutionBlocked = 'agent_execution_blocked',
}

export type ServerGeminiStreamEvent = any;

export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[] = [];
  private debugResponses: GenerateContentResponse[] = [];
  private pendingCitations = new Set<string>();
  finishReason: FinishReason | undefined = undefined;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
  ) {}

  async *run(
    modelConfigKey: ModelConfigKey,
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const responseStream = await this.chat.sendMessageStream(
        modelConfigKey,
        req,
        this.prompt_id,
        signal,
      );

      for await (const streamEvent of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        if (streamEvent.type === 'retry') {
          yield { type: GeminiEventType.Retry };
          continue;
        }

        const resp = streamEvent.value;
        if (!resp) continue;

        this.debugResponses.push(resp);
        const traceId = resp.responseId;

        const thoughtPart = resp.candidates?.[0]?.content?.parts?.[0];
        if (thoughtPart?.thought) {
          const thought = parseThought(thoughtPart.text ?? '');
          yield { type: GeminiEventType.Thought, value: thought, traceId };
          continue;
        }

        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text, traceId };
        }

        const functionCalls = getFunctionCalls(resp) || [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall, traceId);
          if (event) yield event;
        }

        for (const citation of getCitations(resp)) {
          this.pendingCitations.add(citation);
        }

        const finishReason = resp.candidates?.[0]?.finishReason;
        if (finishReason) {
          this.finishReason = finishReason;
          yield {
            type: GeminiEventType.Finished,
            value: { reason: finishReason, usageMetadata: resp.usageMetadata },
          };
        }
      }
    } catch (e) {
      const structuredError = { message: getErrorMessage(e) };
      yield { type: GeminiEventType.Error, value: { error: structuredError } };
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
    traceId?: string,
  ): ServerGeminiStreamEvent | null {
    const callId = fnCall.id ?? `${fnCall.name}-${Date.now()}`;
    return {
      type: GeminiEventType.ToolCallRequest,
      value: { callId, name: fnCall.name, args: fnCall.args || {}, traceId },
    };
  }
}