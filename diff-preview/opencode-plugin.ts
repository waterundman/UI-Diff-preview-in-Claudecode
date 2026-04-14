/**
 * OpenCode Plugin Entry Point
 * This file defines how the AI-Diff Preview integrates with the OpenCode agent.
 */

export default function initPlugin(context: any) {
  console.log("OpenCode AI-Diff Preview Plugin Initialized");

  // Register a custom tool for the OpenCode agent
  context.registerTool({
    name: "ai_diff_preview",
    description: "Generates an interactive AI design diff preview for the current frontend context.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The design requirement or change request." },
        context_code: { type: "string", description: "The current source code to diff against." }
      },
      required: ["prompt"]
    },
    handler: async (args: { prompt: string, context_code?: string }) => {
      // In a real OpenCode environment, this would send a message to the UI layer
      // to trigger the <App /> component's AI generation logic.
      console.log(`Triggering AI Diff for: ${args.prompt}`);
      
      // Return a status to the agent
      return {
        status: "success",
        message: "AI Diff Preview window opened. User is now interacting with the design.",
        preview_url: process.env.APP_URL
      };
    }
  });

  // Hook into file save events to suggest design improvements
  context.on("file:save", async (file: any) => {
    if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx")) {
      console.log(`Analyzing design for ${file.path}...`);
      // Logic to show a small "AI Suggestion" toast in the IDE
    }
  });
}
