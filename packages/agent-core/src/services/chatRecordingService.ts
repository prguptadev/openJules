// Stub for ChatRecordingService
export class ChatRecordingService {
  constructor(private config: any) {}

  initialize(resumedSessionData?: any) {
    // No-op
  }

  recordMessage(message: any) {
    console.log('[ChatRecord] Message:', message.type);
  }

  recordMessageTokens(usage: any) {
    console.log('[ChatRecord] Tokens:', usage);
  }

  recordToolCalls(model: string, toolCalls: any[]) {
    console.log('[ChatRecord] Tool Calls:', toolCalls.length);
  }

  recordThought(thought: any) {
    console.log('[ChatRecord] Thought:', thought);
  }
}

export interface ResumedSessionData {}
