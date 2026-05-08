import { getAIGenerator } from "./ai";
import type { AIDesignSuggestion } from "./ai/types";

export type { AIDesignSuggestion, AIDesignElement, Resource } from "./ai/types";

export async function generateDesignSuggestion(
  prompt: string,
  retries?: number
): Promise<AIDesignSuggestion> {
  const generator = getAIGenerator('gemini');
  return generator.generateDesign(prompt);
}
