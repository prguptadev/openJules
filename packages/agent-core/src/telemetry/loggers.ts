// Stub for Telemetry Loggers
export function logContentRetry(config: any, event: any) {
  console.log('[Telemetry] Content Retry:', event);
}

export function logContentRetryFailure(config: any, event: any) {
  console.error('[Telemetry] Content Retry Failure:', event);
}
