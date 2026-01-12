// Models Config Stub
export function resolveModel(model: string, previewFeatures?: boolean): string {
  return model; // Pass-through for now
}

export function isGemini2Model(model: string): boolean {
  return model.includes('gemini-2');
}

export function isPreviewModel(model: string): boolean {
  return model.includes('preview');
}
