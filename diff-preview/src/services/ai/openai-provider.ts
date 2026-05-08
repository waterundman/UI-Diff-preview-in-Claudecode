import type { AIDesignGenerator, AIDesignSuggestion, GenerateOptions } from "./types";

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DESIGN_SYSTEM_PROMPT = `Design a frontend component based on this prompt.
Provide a JSON response with elements (position, size, type, content) and resources.
Positions and sizes should be in percentages (0-100).
Use 'parentId' to establish a hierarchy (e.g., a button inside a card).
Use Tailwind CSS classes in the 'style' property for styling.`;

const JSON_SCHEMA = {
  name: "design_suggestion",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      elements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["button", "card", "text", "image", "container"] },
            content: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            style: { type: "string" },
            parentId: { type: "string" }
          },
          required: ["id", "type", "content", "x", "y", "width", "height"],
          additionalProperties: false
        }
      },
      resources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            url: { type: "string" }
          },
          required: ["name", "type", "url"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "description", "elements", "resources"],
    additionalProperties: false
  }
};

type OpenAIModule = typeof import("openai");

export class OpenAIGenerator implements AIDesignGenerator {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.model = model || "gpt-4o";
  }

  async generateDesign(
    prompt: string,
    options?: GenerateOptions
  ): Promise<AIDesignSuggestion> {
    let lastError: Error | null = null;
    const retries = 3;

    const content = options?.style
      ? `Design a frontend component based on this prompt: "${prompt}". Style direction: ${options.style}. ${DESIGN_SYSTEM_PROMPT}`
      : `Design a frontend component based on this prompt: "${prompt}". ${DESIGN_SYSTEM_PROMPT}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const OpenAI: OpenAIModule = await import("openai");
        const client = new OpenAI.default({ apiKey: this.apiKey });

        const response = await client.chat.completions.create({
          model: options?.model || this.model,
          messages: [
            {
              role: "system",
              content: "You are a frontend design assistant. Output only valid JSON matching the provided schema."
            },
            { role: "user", content }
          ],
          response_format: {
            type: "json_schema",
            json_schema: JSON_SCHEMA as any
          },
          temperature: 0.7,
          max_tokens: 4096
        });

        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error("Empty response from OpenAI API");

        const parsed = JSON.parse(text);
        if (!parsed.elements || !Array.isArray(parsed.elements)) {
          throw new Error("Invalid response structure: missing elements array");
        }

        return parsed as AIDesignSuggestion;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`OpenAI API attempt ${attempt + 1}/${retries} failed:`, lastError.message);

        if (attempt < retries - 1) {
          await delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return {
      title: "Error generating design",
      description: lastError?.message ?? "Unknown error after retries",
      elements: [],
      resources: []
    };
  }
}
