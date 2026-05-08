import { GoogleGenAI, Type } from "@google/genai";
import type { AIDesignGenerator, AIDesignSuggestion, GenerateOptions } from "./types";

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DESIGN_SYSTEM_PROMPT = `Design a frontend component based on this prompt. 
Provide a JSON response with elements (position, size, type, content) and resources.
Positions and sizes should be in percentages (0-100).
Use 'parentId' to establish a hierarchy (e.g., a button inside a card). If an element has a parent, its x and y are relative to the parent's top-left corner.
Use Tailwind CSS classes in the 'style' property for styling.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    elements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['button', 'card', 'text', 'image', 'container'] },
          content: { type: Type.STRING },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          style: { type: Type.STRING },
          parentId: { type: Type.STRING }
        },
        required: ['id', 'type', 'content', 'x', 'y', 'width', 'height']
      }
    },
    resources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          url: { type: Type.STRING }
        }
      }
    }
  },
  required: ['title', 'description', 'elements', 'resources']
};

export class GeminiGenerator implements AIDesignGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async generateDesign(
    prompt: string,
    options?: GenerateOptions
  ): Promise<AIDesignSuggestion> {
    let lastError: Error | null = null;
    const retries = 3;
    const model = options?.model || "gemini-3-flash-preview";

    const content = options?.style
      ? `Design a frontend component based on this prompt: "${prompt}". 
Style direction: ${options.style}
${DESIGN_SYSTEM_PROMPT}`
      : `Design a frontend component based on this prompt: "${prompt}". 
${DESIGN_SYSTEM_PROMPT}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: content,
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Empty response from Gemini API');
        }

        const parsed = JSON.parse(text);

        if (!parsed.elements || !Array.isArray(parsed.elements)) {
          throw new Error('Invalid response structure: missing elements array');
        }

        return parsed as AIDesignSuggestion;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Gemini API attempt ${attempt + 1}/${retries} failed:`, lastError.message);

        if (attempt < retries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await delay(backoffMs);
        }
      }
    }

    return {
      title: 'Error generating design',
      description: lastError?.message ?? 'Unknown error after retries',
      elements: [],
      resources: []
    };
  }
}
