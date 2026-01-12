// Availability Stub
export function applyModelSelection(config: any, modelConfigKey: any) {
  return {
    model: modelConfigKey.model,
    config: {}, // empty config
    maxAttempts: 3
  };
}

export function createAvailabilityContextProvider() {
  return () => ({
    service: {
      markHealthy: () => {},
      recordFailure: () => {}
    },
    policy: {
      model: 'stub-model'
    }
  });
}