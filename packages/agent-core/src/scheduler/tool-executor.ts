// @ts-nocheck
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import {
  type ExecutingToolCall,
  type CompletedToolCall,
  type OutputUpdateHandler,
} from './types.js';
import {
  type ToolCallResponseInfo,
  createToolResponse,
} from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';

interface ExecuteOptions {
  call: ExecutingToolCall;
  signal: AbortSignal;
  outputUpdateHandler: OutputUpdateHandler;
  onUpdateToolCall: (call: ExecutingToolCall) => void;
}

export class ToolExecutor {
  constructor(private config: Config) {}

  async execute({
    call,
    signal,
    outputUpdateHandler,
    onUpdateToolCall,
  }: ExecuteOptions): Promise<CompletedToolCall> {
    const startTime = Date.now();
    let response: ToolCallResponseInfo;
    let status: 'success' | 'error' | 'cancelled' = 'success';

    try {
      // Execute the tool invocation
      const result = await call.invocation.execute(
        signal,
        (output) => outputUpdateHandler(call.request.callId, output)
      );

      // Create standard response
      response = createToolResponse(call.request, result);
    } catch (error: any) {
      if (signal.aborted) {
        status = 'cancelled';
        response = {
          callId: call.request.callId,
          responseParts: [
            {
              functionResponse: {
                id: call.request.callId,
                name: call.request.name,
                response: { error: 'Operation cancelled by user' },
              },
            },
          ],
          resultDisplay: 'Operation cancelled by user',
          contentLength: 0,
        };
      } else {
        status = 'error';
        const errorMessage = error instanceof Error ? error.message : String(error);
        response = {
          callId: call.request.callId,
          responseParts: [
            {
              functionResponse: {
                id: call.request.callId,
                name: call.request.name,
                response: { error: errorMessage },
              },
            },
          ],
          resultDisplay: errorMessage,
          error: error instanceof Error ? error : new Error(errorMessage),
          errorType: ToolErrorType.UNHANDLED_EXCEPTION,
          contentLength: errorMessage.length,
        };
      }
    }

    const durationMs = Date.now() - startTime;

    if (status === 'success') {
      return {
        ...call,
        status: 'success',
        response,
        durationMs,
      };
    } else if (status === 'cancelled') {
        return {
            ...call,
            status: 'cancelled',
            response,
            durationMs,
        };
    } else {
      return {
        ...call,
        status: 'error',
        response,
        durationMs,
      };
    }
  }
}
