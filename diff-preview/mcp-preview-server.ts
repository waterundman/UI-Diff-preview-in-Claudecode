/**
 * AI-Diff Preview MCP Server with Integrated Preview Window
 * 
 * 功能:
 * 1. 生成 AI 设计预览
 * 2. 启动本地预览服务器
 * 3. 自动打开浏览器预览窗口
 * 4. 实时更新预览内容
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { GoogleGenAI, Type } from "@google/genai"
import http from "http"
import { exec } from "child_process"
import path from "path"
import fs from "fs"

// 配置
const PREVIEW_PORT = 3456
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`

// 设计 taste 预设
interface DesignTaste {
  name: string
  prompt: string
}

const TASTES: DesignTaste[] = [
  {
    name: "Glassmorphism",
    prompt: "Frosted glass effect, semi-transparent backgrounds, backdrop-blur, dark bg with glass cards"
  },
  {
    name: "Minimal",
    prompt: "Clean minimal design, maximum whitespace, system font, single accent color"
  },
  {
    name: "Editorial",
    prompt: "Publication style, serif typography, generous layout, warm colors"
  },
  {
    name: "Brutalist",
    prompt: "Raw unpolished aesthetic, bold borders, monospace type, high contrast"
  },
  {
    name: "SaaS Modern",
    prompt: "Professional SaaS aesthetic, gradients, rounded cards, dark theme"
  }
]

// AI 设计元素
interface DesignElement {
  id: string
  type: string
  content: string
  x: number
  y: number
  width: number
  height: number
  style: string
  parentId?: string
}

interface DesignSuggestion {
  title: string
  description: string
  elements: DesignElement[]
  resources: { name: string; type: string; url: string }[]
}

// 当前预览状态
let currentDesign: DesignSuggestion | null = null
let previewServer: http.Server | null = null

// Gemini API Schema
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
          type: { type: Type.STRING, enum: ["button", "card", "text", "image", "container"] },
          content: { type: Type.STRING },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
          style: { type: Type.STRING },
          parentId: { type: Type.STRING }
        },
        required: ["id", "type", "content", "x", "y", "width", "height"]
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
  required: ["title", "description", "elements", "resources"]
}

/**
 * 生成 AI 设计
 */
async function generateDesign(prompt: string, taste?: string): Promise<DesignSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set")
  }

  const ai = new GoogleGenAI({ apiKey })
  
  const tastePrompt = taste 
    ? TASTES.find(t => t.name.toLowerCase() === taste.toLowerCase())?.prompt || ""
    : ""

  const fullPrompt = tastePrompt
    ? `Design a frontend component: "${prompt}". Style: ${tastePrompt}. Use Tailwind CSS classes.`
    : `Design a frontend component: "${prompt}". Use Tailwind CSS classes.`

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: fullPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  })

  const text = response.text
  if (!text) throw new Error("Empty response from Gemini API")

  return JSON.parse(text) as DesignSuggestion
}

/**
 * 生成预览 HTML
 */
function generatePreviewHTML(design: DesignSuggestion): string {
  const elementsHTML = design.elements
    .filter(el => !el.parentId)
    .map(el => {
      const children = design.elements.filter(child => child.parentId === el.id)
      const childrenHTML = children.map(child => `
        <div style="position:absolute;left:${child.x}%;top:${child.y}%;width:${child.width}%;height:${child.height}%;" class="element child">
          ${child.type === 'image' ? '<div class="image-placeholder">📷</div>' : `<span class="${child.style}">${child.content}</span>`}
        </div>
      `).join('')

      return `
        <div style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.width}%;height:${el.height}%;" class="element ${el.type}" data-id="${el.id}">
          ${el.type === 'image' ? '<div class="image-placeholder">📷</div>' : `<span class="${el.style}">${el.content}</span>`}
          ${childrenHTML}
        </div>
      `
    }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${design.title} - AI Design Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #09090b;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #18181b;
      border-bottom: 1px solid #27272a;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 { font-size: 14px; font-weight: 600; }
    .header .badge {
      background: #3b82f6;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
    }
    .canvas-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }
    .canvas {
      width: 100%;
      max-width: 960px;
      aspect-ratio: 16/9;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      position: relative;
      overflow: hidden;
    }
    .element {
      border: 1px dashed transparent;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .element:hover {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }
    .image-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f4f4f5;
      border-radius: 4px;
      font-size: 24px;
    }
    .info-panel {
      background: #18181b;
      border-top: 1px solid #27272a;
      padding: 12px 16px;
      font-size: 12px;
      color: #a1a1aa;
    }
    .element-count { color: #3b82f6; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">✨</span>
      <h1>${design.title}</h1>
    </div>
    <span class="badge">AI Preview</span>
  </div>
  
  <div class="canvas-container">
    <div class="canvas">
      ${elementsHTML}
    </div>
  </div>
  
  <div class="info-panel">
    <p>${design.description}</p>
    <p style="margin-top:4px;">
      Elements: <span class="element-count">${design.elements.length}</span> | 
      Resources: <span class="element-count">${design.resources.length}</span>
    </p>
  </div>
</body>
</html>`
}

/**
 * 启动预览服务器
 */
function startPreviewServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (previewServer) {
      resolve()
      return
    }

    previewServer = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.setHeader('Access-Control-Allow-Origin', '*')
      
      if (req.url === '/' || req.url === '/index.html') {
        if (currentDesign) {
          res.end(generatePreviewHTML(currentDesign))
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>AI Design Preview</title></head>
            <body style="font-family:system-ui;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;">
              <div style="text-align:center;">
                <h1 style="font-size:24px;margin-bottom:8px;">✨ AI Design Preview</h1>
                <p style="color:#a1a1aa;">Waiting for design generation...</p>
                <p style="color:#71717a;font-size:12px;margin-top:16px;">Use the ai-diff-preview tool to generate a design</p>
              </div>
            </body>
            </html>
          `)
        }
      } else {
        res.statusCode = 404
        res.end('Not found')
      }
    })

    previewServer.listen(PREVIEW_PORT, () => {
      console.log(`Preview server running at ${PREVIEW_URL}`)
      resolve()
    })

    previewServer.on('error', reject)
  })
}

/**
 * 打开浏览器
 */
function openBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${cmd} ${url}`)
}

/**
 * 更新预览
 */
function updatePreview(design: DesignSuggestion): void {
  currentDesign = design
}

// 创建 MCP 服务器
const server = new Server(
  {
    name: "ai-diff-preview",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
)

// 列出可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_preview",
        description: "Generate an AI design preview and open it in browser. Returns the preview URL.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Design requirement (e.g. 'modern hero section with glassmorphism')"
            },
            taste: {
              type: "string",
              description: "Design taste: Glassmorphism | Minimal | Editorial | Brutalist | SaaS Modern",
              enum: ["Glassmorphism", "Minimal", "Editorial", "Brutalist", "SaaS Modern"]
            },
            openBrowser: {
              type: "boolean",
              description: "Automatically open browser (default: true)"
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "refresh_preview",
        description: "Refresh the current preview in browser",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "list_tastes",
        description: "List available design tastes",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
  }
})

// 列出可用资源
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "preview://current",
        name: "Current Design Preview",
        description: "The current design preview data",
        mimeType: "application/json"
      }
    ]
  }
}

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "preview://current") {
    return {
      contents: [
        {
          uri: "preview://current",
          mimeType: "application/json",
          text: JSON.stringify(currentDesign || { status: "no design generated" })
        }
      ]
    }
  }
  throw new Error("Resource not found")
})

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case "generate_preview": {
      const prompt = args?.prompt as string
      const taste = args?.taste as string | undefined
      const shouldOpenBrowser = (args?.openBrowser as boolean) !== false

      // 启动预览服务器
      await startPreviewServer()

      // 生成设计
      const design = await generateDesign(prompt, taste)
      
      // 更新预览
      updatePreview(design)

      // 打开浏览器
      if (shouldOpenBrowser) {
        openBrowser(PREVIEW_URL)
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              title: design.title,
              description: design.description,
              elementCount: design.elements.length,
              resourceCount: design.resources.length,
              previewUrl: PREVIEW_URL,
              taste: taste || "default"
            }, null, 2)
          }
        ]
      }
    }

    case "refresh_preview": {
      if (!currentDesign) {
        return {
          content: [
            {
              type: "text",
              text: "No design generated yet. Use generate_preview first."
            }
          ]
        }
      }

      // 打开浏览器显示当前预览
      openBrowser(PREVIEW_URL)

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Preview refreshed",
              previewUrl: PREVIEW_URL
            }, null, 2)
          }
        ]
      }
    }

    case "list_tastes": {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              tastes: TASTES.map(t => ({
                name: t.name,
                description: t.prompt
              }))
            }, null, 2)
          }
        ]
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// 启动服务器
async function main() {
  // 预启动预览服务器
  await startPreviewServer()
  
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("AI-Diff Preview MCP Server running on stdio")
  console.error(`Preview available at ${PREVIEW_URL}`)
}

main().catch(console.error)
