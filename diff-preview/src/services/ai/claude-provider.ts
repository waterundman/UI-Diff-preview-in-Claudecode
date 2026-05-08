import type { AIDesignGenerator, AIDesignSuggestion, GenerateOptions } from "./types";

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DESIGN_SYSTEM_PROMPT = `You are a frontend design assistant. Generate a design based on the user's prompt.
Return the design as a JSON object with: title, description, elements[], and resources[].`;

const TOOL_SCHEMA = {
  name: "output_design_suggestion",
  description: "Output the generated design suggestion as structured JSON",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Design title" },
      description: { type: "string", description: "Design description" },
      elements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["button", "card", "text", "image", "container"] },
            content: { type: "string" },
            x: { type: "number", description: "Percentage (0-100)" },
            y: { type: "number", description: "Percentage (0-100)" },
            width: { type: "number", description: "Percentage (0-100)" },
            height: { type: "number", description: "Percentage (0-100)" },
            style: { type: "string", description: "Tailwind CSS classes" },
            parentId: { type: "string" }
          },
          required: ["id", "type", "content", "x", "y", "width", "height"]
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
          required: ["name", "type", "url"]
        }
      }
    },
    required: ["title", "description", "elements", "resources"]
  }
};

type AnthropicModule = typeof import("@anthropic-ai/sdk");

export class ClaudeGenerator implements AIDesignGenerator {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = model || "claude-sonnet-4-6";
  }

  async generateDesign(
    prompt: string,
    options?: GenerateOptions
  ): Promise<AIDesignSuggestion> {
    let lastError: Error | null = null;
    const retries = 3;

    const styleInstruction = options?.style
      ? `Style direction: ${options.style}. `
      : "";

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const Anthropic: AnthropicModule = await import("@anthropic-ai/sdk");
        const client = new Anthropic.default({ apiKey: this.apiKey });

        const response = await client.messages.create({
          model: options?.model || this.model,
          max_tokens: 4096,
          system: DESIGN_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `${styleInstruction}Design request: ${prompt}`
            }
          ],
          tools: [
            {
              name: TOOL_SCHEMA.name,
              description: TOOL_SCHEMA.description,
              input_schema: TOOL_SCHEMA.input_schema as any
            }
          ],
          tool_choice: { type: "tool", name: TOOL_SCHEMA.name }
        });

        const toolUse = response.content.find(
          (block: any) => block.type === "tool_use" && block.name === TOOL_SCHEMA.name
        );

        if (!toolUse || !("input" in toolUse)) {
          throw new Error("Claude did not use the expected tool");
        }

        const input = (toolUse as any).input;
        if (!input.elements || !Array.isArray(input.elements)) {
          throw new Error("Invalid response structure: missing elements array");
        }

        return input as AIDesignSuggestion;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Claude API attempt ${attempt + 1}/${retries} failed:`, lastError.message);

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
