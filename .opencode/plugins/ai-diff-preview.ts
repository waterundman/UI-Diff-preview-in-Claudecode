/**
 * OpenCode Plugin: ai-diff-preview
 *
 * This plugin hooks into OpenCode events to provide a seamless
 * AI design preview experience. It listens for file changes on
 * TSX/JSX files and suggests design improvements via TUI toast.
 *
 * Place this file in: .opencode/plugins/ai-diff-preview.ts
 */

import type { Plugin } from "@opencode-ai/plugin"

const COMPONENT_EXTENSIONS = [".tsx", ".jsx", ".vue", ".svelte"]

const isComponentFile = (filePath: string): boolean =>
  COMPONENT_EXTENSIONS.some((ext) => filePath.endsWith(ext))

const isExcludedPath = (filePath: string): boolean =>
  filePath.includes("node_modules") || filePath.includes("dist/") || filePath.includes("build/")

export const AiDiffPreviewPlugin: Plugin = async ({ client }) => {
  console.log("[ai-diff-preview] Plugin initialized")

  return {
    /**
     * Hook: event
     * Listens for file.edited events and triggers design preview
     * suggestions for component file changes.
     */
    event: async ({ event }) => {
      if (event.type !== "file.edited") return

      const filePath = event.properties.file
      if (!isComponentFile(filePath) || isExcludedPath(filePath)) return

      console.log(`[ai-diff-preview] Detected component change: ${filePath}`)

      try {
        await client.tui.showToast({
          body: {
            message: `Component ${filePath} changed. Use "ai-diff-preview" tool to generate a design preview.`,
            variant: "info",
          },
        })
      } catch {
        // TUI may not be available in web/IDE mode
      }
    },

    /**
     * Hook: tool.execute.after
     * Triggered after any tool execution. We use this to detect when
     * the ai-diff-preview tool is called and log the interaction.
     */
    "tool.execute.after": async (input, output) => {
      if (input.tool === "ai-diff-preview") {
        console.log("[ai-diff-preview] Tool executed successfully")
      }
    },

    /**
     * Hook: experimental.session.compacting
     * Preserve design-related context across session compaction.
     */
    "experimental.session.compacting": async (input, output) => {
      output.context.push(`## AI Diff Preview Context
When working on frontend components, you can use the "ai-diff-preview" tool to:
1. Generate visual design previews based on natural language prompts
2. Compare the current implementation with AI-suggested layouts
3. Interactively adjust positioning, sizing, and styling before committing changes
4. Output code in React, Vue, Svelte, or plain HTML/CSS

Usage example:
"Use ai-diff-preview to redesign the landing page hero section with a glassmorphism card."
`)
    },
  }
}
