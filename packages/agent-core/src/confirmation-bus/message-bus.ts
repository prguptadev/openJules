import { EventEmitter } from 'node:events';

export class MessageBus extends EventEmitter {
  constructor(private policyEngine: any = null) {
    super();
  }

  async publish(message: any): Promise<void> {
    console.log('[MessageBus] Publish:', message.type);
    this.emit(message.type, message);
  }

  subscribe(type: string, listener: (message: any) => void): void {
    this.on(type, listener);
  }

  unsubscribe(type: string, listener: (message: any) => void): void {
    this.off(type, listener);
  }

  async request(request: any, responseType: string, timeoutMs: number = 60000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(responseType, handler);
        reject(new Error(`Timeout waiting for ${responseType}`));
      }, timeoutMs);

      const handler = (response: any) => {
        if (response.correlationId === request.correlationId) {
          clearTimeout(timeoutId);
          this.off(responseType, handler);
          resolve(response);
        }
      };

      this.on(responseType, handler);
      this.publish(request);
    });
  }
}