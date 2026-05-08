/**
 * Claude Code MCP Server (Model Context Protocol)
 * This file defines the MCP server that allows Claude Code to interact with the preview.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "opencode-ai-diff",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "show_design_suggestion",
        description: "Opens the AI Diff Preview window with a specific design suggestion.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            elements: { 
              type: "array", 
              items: { type: "object" },
              description: "Optional pre-calculated layout elements."
            }
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "show_design_suggestion") {
    const prompt = request.params.arguments?.prompt;
    // Implementation would involve communicating with the React app via WebSocket or shared state
    return {
      content: [
        {
          type: "text",
          text: `Preview window updated with design for: "${prompt}". You can now see the diff in the external preview tab.`,
        },
      ],
    };
  }
  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenCode AI-Diff MCP server running on stdio");
}

main().catch(console.error);
