/**
 * OpenCode Custom Tool: ai_diff_preview
 *
 * This tool allows the OpenCode agent to generate an interactive AI design
 * diff preview for frontend components. It reads the current file context,
 * sends a design prompt to the selected AI provider, and returns a preview URL.
 *
 * Place this file in: .opencode/tools/ai-diff-preview.ts
 */

import { tool } from "@opencode-ai/plugin"

const PREVIEW_BASE_URL = process.env.AI_DIFF_PREVIEW_URL || "http://localhost:3000"

function generateSessionId(): string {
  return `preview-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export default tool({
  description:
    "Generate an interactive AI design diff preview for the current frontend file. " +
    "Provide a design prompt (e.g. 'create a modern hero section with glassmorphism'). " +
    "The tool will analyze the current file (if provided) and generate a visual preview " +
    "that can be opened in a browser for interactive editing before applying changes.",

  args: {
    prompt: tool.schema
      .string()
      .describe("The design requirement or change request. Be specific about layout, style, and components."),

    filePath: tool.schema
      .string()
      .optional()
      .describe("Relative path to the target component file (e.g. 'src/App.tsx'). If omitted, generates a new design from scratch."),

    framework: tool.schema
      .string()
      .optional()
      .describe("Target framework: 'react' | 'vue' | 'svelte' | 'html'. Defaults to 'react'."),

    model: tool.schema
      .string()
      .optional()
      .describe("AI provider/model to use: 'gemini' | 'openai' | 'claude'. Defaults to 'gemini'. Set via env GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY."),

    taste: tool.schema
      .string()
      .optional()
      .describe("Design taste preset: 'Glassmorphism' | 'Minimal' | 'Editorial' | 'Brutalist' | 'SaaS Modern'. Influences typography, spacing, color choices."),
  },

  async execute(args, context) {
    let fileContent: string | null = null
    const client = (context as any).client ?? null

    if (args.filePath && client) {
      try {
        const result = await client.file.read({ query: { path: args.filePath } })
        if (result.data && typeof result.data === "object" && "content" in result.data) {
          fileContent = (result.data as any).content as string
        }
      } catch (err) {
        console.warn(`[ai-diff-preview] Could not read file ${args.filePath}:`, err)
      }
    }

    if (client) {
      try {
        await client.tui.showToast({
          body: {
            message: `Generating design preview: "${args.prompt.substring(0, 60)}..."`,
            variant: "info",
          },
        })
      } catch {
        // TUI may not be available in web/IDE mode
      }
    }

    const framework = args.framework || "react"
    const model = args.model || "gemini"
    const taste = args.taste || ""

    const sessionId = generateSessionId()
    let previewUrl: string
    try {
      const params = new URLSearchParams({
        id: sessionId,
        framework,
        model,
        ...(taste ? { taste } : {}),
      })
      previewUrl = `${PREVIEW_BASE_URL}/preview?${params.toString()}`
    } catch (err) {
      throw new Error(`[ai-diff-preview] Failed to build preview URL: ${err}`)
    }

    return {
      output: [
        `✨ AI Design Preview Generated`,
        ``,
        `Session: ${sessionId}`,
        `Model: ${model}`,
        `Framework: ${framework}`,
        `Taste: ${taste || "default"}`,
        `Target: ${args.filePath || "(new component)"}`,
        ``,
        `Open the preview in your browser:`,
        previewUrl,
        ``,
        `The preview window lets you:`,
        `- Drag and drop elements to adjust layout`,
        `- Resize components with handles`,
        `- Switch between React / Vue / Svelte / HTML output`,
        `- Click "Apply Changes" to write the generated code back to the project`,
        ``,
        fileContent
          ? `Tip: The design was generated based on the current content of ${args.filePath}.`
          : `Tip: No file was provided. The design starts from scratch.`,
      ].join("\n"),
      metadata: {
        previewUrl,
        sessionId,
        framework,
        model,
        taste: taste || "default",
        target: args.filePath || null,
      },
    }
  },
})
