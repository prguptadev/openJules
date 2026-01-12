import { Content } from '@google/genai';

export function isFunctionResponse(content: Content): boolean {
  return content.parts?.some(p => p.functionResponse) ?? false;
}
