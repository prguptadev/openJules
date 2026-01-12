// Stub for Telemetry Types
export class ContentRetryEvent {
  constructor(
    public attempt: number,
    public retryType: string,
    public delayMs: number,
    public model: string
  ) {}
}

export class ContentRetryFailureEvent {
  constructor(
    public maxAttempts: number,
    public retryType: string,
    public model: string
  ) {}
}
