import type { AIDesignGenerator } from "./types";
import { GeminiGenerator } from "./gemini-provider";
import { OpenAIGenerator } from "./openai-provider";
import { ClaudeGenerator } from "./claude-provider";

export type AIProvider = 'gemini' | 'openai' | 'claude';

export function getAIGenerator(
  provider: AIProvider = 'gemini',
  apiKey?: string
): AIDesignGenerator {
  switch (provider) {
    case 'gemini':
      return new GeminiGenerator(apiKey);
    case 'openai':
      return new OpenAIGenerator(apiKey);
    case 'claude':
      return new ClaudeGenerator(apiKey);
    default:
      return new GeminiGenerator(apiKey);
  }
}

export { GeminiGenerator } from "./gemini-provider";
export { OpenAIGenerator } from "./openai-provider";
export { ClaudeGenerator } from "./claude-provider";
export type { AIDesignGenerator, AIDesignSuggestion, GenerateOptions } from "./types";
