# OpenCode AI-Diff Preview — 作为 OpenCode 插件的可行性研究报告

> 研究日期：2026-05-01  
> 研究范围：OpenCode 平台架构、插件系统、MCP 协议、Server API、IDE/Web 集成模式  
> 结论：**可行，但需选择正确的集成路径并重构现有代码**

---

## 1. OpenCode 平台概述

### 1.1 项目背景

**OpenCode**（[anomalyco/opencode](https://github.com/anomalyco/opencode)）是目前最流行的开源 AI 编码代理之一：

| 指标 | 数据 |
|---|---|
| GitHub Stars | **153K** |
| Contributors | **850+** |
| 月活开发者 | **6.5M** |
| 最新版本 | v1.14.31（2026-05-01）|
| 许可证 | MIT |

### 1.2 架构特点

OpenCode 采用 **Client/Server 分离架构**：

```
┌─────────────────┐     HTTP/WebSocket     ┌──────────────────┐
│   Clients       │ ◄────────────────────► │  OpenCode Server │
│  (TUI/Web/IDE)  │                        │  (Port 4096)     │
└─────────────────┘                        └──────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                             ▼                             ▼
              ┌──────────┐               ┌─────────────┐               ┌────────────┐
              │ Plugins  │               │ MCP Servers │               │ LSP/Formatter│
              │ (Hooks)  │               │ (Tools)     │               │ (Code Intel) │
              └──────────┘               └─────────────┘               └────────────┘
```

关键特性：
- **多客户端支持**：TUI（终端）、Web 界面、IDE 扩展（VS Code/Cursor）、Desktop App
- **HTTP Server**：运行 `opencode serve` 可启动 headless REST API 服务
- **插件系统**：基于 JavaScript/TypeScript 的 hook 机制
- **MCP 支持**：原生支持 Model Context Protocol（local + remote）
- **自定义工具**：`.opencode/tools/` 目录下可定义 LLM 可调用的工具
- **SDK 可用**：`@opencode-ai/sdk` 提供类型安全的 HTTP 客户端

---

## 2. 现有项目与 OpenCode 的兼容性分析

### 2.1 当前项目架构回顾

```
┌─────────────────────────────────────────────┐
│  OpenCode AI-Diff Preview (本项目)           │
│  ┌───────────────────────────────────────┐  │
│  │  Frontend: React 19 + Vite + Tailwind │  │
│  │  ├─ App.tsx (IDE-like UI + Canvas)    │  │
│  │  ├─ gemini.ts (AI Design Generation)  │  │
│  │  └─ main.tsx (Entry Point)            │  │
│  ├───────────────────────────────────────┤  │
│  │  Plugin Layer                         │  │
│  │  ├─ opencode-plugin.ts (Hypothetical) │  │
│  │  └─ mcp-server.ts (MCP Stdio)         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 2.2 假设 API vs 真实 API 对比

当前 `opencode-plugin.ts` 基于**假设的插件 API**编写，与 OpenCode 真实 API 存在显著差异：

| 功能 | 当前项目假设的 API | OpenCode 真实 API |
|---|---|---|
| **导出格式** | `export default function initPlugin(context)` | `export const MyPlugin = async (ctx) => ({ ...hooks })` |
| **注册工具** | `context.registerTool({ name, parameters, handler })` | `return { tool: { mytool: tool({ description, args, execute }) } }` |
| **参数校验** | 手写 JSON Schema | `tool.schema` (Zod) 或 `zod` 对象 |
| **事件监听** | `context.on("file:save", callback)` | `return { "file.edited": async (input, output) => {} }` |
| **上下文对象** | `context: any` | `{ project, client, $, directory, worktree }` |
| **执行环境** | 未知 | Bun 运行时（`Bun.$` shell API）|

**结论**：`opencode-plugin.ts` **完全无法直接运行**，需要基于 `@opencode-ai/plugin` 的 `tool` helper 和真实 hook 系统重写。

### 2.3 MCP Server 兼容性

当前 `mcp-server.ts` 使用 `@modelcontextprotocol/sdk`，与 OpenCode MCP 支持对比：

| 项目 | 当前实现 | OpenCode 要求 |
|---|---|---|
| 传输层 | `StdioServerTransport` | ✅ 支持 `type: "local"` + `command` |
| 工具定义 | `ListToolsRequestSchema` | ✅ 标准 MCP 协议兼容 |
| 工具执行 | `CallToolRequestSchema` | ✅ 标准 MCP 协议兼容 |
| 启动方式 | `tsx diff-preview/mcp-server.ts` | ✅ 可用 `command: ["npx", "tsx", "..."]` |

**结论**：MCP Server 部分**基本兼容**，只需微调配置即可接入 OpenCode。

---

## 3. 核心挑战：前端 UI 的嵌入问题

### 3.1 最大障碍

本项目的核心价值是**交互式视觉 Diff 预览层**（拖拽、缩放、Canvas 渲染），这天然依赖浏览器环境。但 OpenCode 的插件系统存在以下限制：

| OpenCode 运行模式 | 是否支持插件渲染 UI | 说明 |
|---|---|---|
| **TUI（终端）** | ❌ 不可能 | 纯文本终端，无法渲染 React/DOM |
| **Web 模式** | ⚠️ 有限 | 插件在服务端运行，无法直接注入前端组件 |
| **Desktop App** | ⚠️ 有限 | 同上，插件无 WebView/iframe API |
| **IDE 扩展** | ⚠️ 有限 | 通过终端集成，无自定义 Webview 能力 |
| **Server (API)** | ❌ 不可能 | Headless 模式，无 UI |

**关键发现**：OpenCode 插件系统类似于**后端中间件/Hook 层**，而非 VS Code 那样的可扩展 IDE 框架。插件可以：
- ✅ 注册自定义工具供 LLM 调用
- ✅ 监听文件/会话/工具执行事件
- ✅ 通过 `tui.showToast` 显示简单通知
- ✅ 通过 `tui.appendPrompt` 修改输入框文本
- ❌ **无法嵌入自定义 React 组件或 WebView**

### 3.2 与 VS Code 扩展模型的对比

| 能力 | VS Code Extension | OpenCode Plugin |
|---|---|---|
| WebView/Panel | ✅ `vscode.WebviewPanel` | ❌ 不支持 |
| Tree View | ✅ `vscode.TreeDataProvider` | ❌ 不支持 |
| Status Bar | ✅ `vscode.StatusBarItem` | ❌ 不支持 |
| Custom Editor | ✅ `CustomTextEditorProvider` | ❌ 不支持 |
| 自定义工具 | ⚠️ 需通过 Language Server | ✅ 原生支持 |
| 事件 Hook | ⚠️ 有限 | ✅ 丰富的事件系统 |
| MCP 接入 | ⚠️ 需额外配置 | ✅ 原生支持 |

---

## 4. 四条可行集成路径

基于以上分析，本项目作为 OpenCode 生态的一部分，有**四条不同的集成路径**，各有利弊。

---

### 路径 A：MCP Server + 独立 Web 应用（推荐短期方案）

**架构**：

```
┌──────────────────┐         ┌─────────────────────────┐
│  OpenCode Agent  │────────►│  MCP Server (stdio)     │
│  (TUI/Web/IDE)   │ 调用工具 │  ├─ show_design_suggestion│
└──────────────────┘         │  └─ 调用 Gemini API      │
                             └───────────┬─────────────┘
                                         │ 返回预览 URL
                                         ▼
                              ┌──────────────────────┐
                              │  独立 React Web App   │
                              │  (localhost:3000)    │
                              │  ├─ 渲染 Diff 层     │
                              │  └─ 拖拽/缩放交互    │
                              └──────────────────────┘
```

**实现方式**：
1. 保留并完善 `mcp-server.ts`（stdio 传输）
2. 在 `opencode.json` 中注册 local MCP：
   ```json
   {
     "mcp": {
       "ai-diff-preview": {
         "type": "local",
         "command": ["npx", "tsx", "diff-preview/mcp-server.ts"],
         "environment": { "GEMINI_API_KEY": "{env:GEMINI_API_KEY}" }
       }
     }
   }
   ```
3. MCP 工具 `show_design_suggestion` 被调用时：
   - 调用 Gemini API 生成设计
   - 将设计数据写入临时 JSON 文件
   - **返回包含预览 URL 的文本**（如 `http://localhost:3000/?design=temp-id`）
4. 用户在浏览器中手动打开该 URL 查看交互式预览

**优点**：
- ✅ 实现最简单，改动最小
- ✅ 利用 OpenCode 原生 MCP 支持
- ✅ 预览应用完全独立，不受 OpenCode UI 限制
- ✅ 可在任何 OpenCode 运行模式下工作

**缺点**：
- ❌ 用户体验有断层（需要手动打开浏览器标签页）
- ❌ Agent 无法直接"推送"设计到预览窗口
- ❌ 缺乏双向通信（预览应用的修改无法自动同步回 OpenCode）

**可行性评分**：⭐⭐⭐⭐☆（4/5）

---

### 路径 B：OpenCode 自定义工具 + Server API 桥接（推荐中期方案）

**架构**：

```
┌──────────────────────────────────────────────────────────────┐
│                        OpenCode Agent                        │
│  ┌──────────────────┐          ┌──────────────────────────┐  │
│  │ Custom Tool      │          │ OpenCode Server          │  │
│  │ ai_diff_preview  │─────────►│ (Port 4096)              │  │
│  │ .opencode/tools/ │          │ ├─ file.read()           │  │
│  └──────────────────┘          │ ├─ session.prompt()      │  │
│                                │ └─ event.subscribe()     │  │
└────────────────────────────────┼──────────────────────────┘  │
                                 │                            │
                                 ▼                            │
                    ┌──────────────────────┐                  │
                    │  @opencode-ai/sdk    │                  │
                    │  (HTTP Client)       │                  │
                    └──────────┬───────────┘                  │
                               │                             │
                               ▼                             │
                    ┌──────────────────────┐                 │
                    │  React Web App        │                 │
                    │  (localhost:3000)     │                 │
                    │  ├─ 读取项目文件      │                 │
                    │  ├─ 调用 Gemini API   │                 │
                    │  └─ 渲染 Diff 层     │                 │
                    └──────────────────────┘                 │
```

**实现方式**：
1. **创建 OpenCode 自定义工具** `.opencode/tools/ai-diff-preview.ts`：
   ```typescript
   import { tool } from "@opencode-ai/plugin"
   export default tool({
     description: "Generate an AI design diff preview for the current file",
     args: {
       prompt: tool.schema.string().describe("Design requirement"),
       filePath: tool.schema.string().optional().describe("Target file path"),
     },
     async execute(args, context) {
       // 1. 读取目标文件内容
       // 2. 将 prompt + code 发送到预览服务
       // 3. 返回预览 URL
       return `Design preview ready: http://localhost:3000/preview?file=${args.filePath}`
     }
   })
   ```
2. **React Web App 通过 SDK 连接 OpenCode Server**：
   ```typescript
   import { createOpencodeClient } from "@opencode-ai/sdk"
   const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
   // 读取当前项目文件
   const fileContent = await client.file.read({ query: { path: "src/App.tsx" } })
   // 监听 OpenCode 事件
   const events = await client.event.subscribe()
   ```
3. 用户在 React 应用中查看 Diff 预览，应用通过 SDK 反向读取/写入文件

**优点**：
- ✅ 自定义工具完美融入 OpenCode 工具链
- ✅ Web App 可通过 SDK 双向读取项目文件
- ✅ 用户体验比纯 MCP 更连贯
- ✅ 可监听 `file.edited` 事件实现实时同步

**缺点**：
- ❌ 需要 OpenCode Server 处于运行状态（`opencode serve` 或 `opencode web`）
- ❌ 需要处理 CORS 和认证（`OPENCODE_SERVER_PASSWORD`）
- ❌ 实现复杂度中等
- ❌ Web App 仍是独立窗口，非嵌入式

**可行性评分**：⭐⭐⭐⭐⭐（5/5）

---

### 路径 C：OpenCode 插件（Hooks）+ Toast/命令集成（轻量方案）

**架构**：

```
┌─────────────────────────────────────────────┐
│              OpenCode Plugin                 │
│  ┌───────────────────────────────────────┐  │
│  │  .opencode/plugins/ai-diff-preview.ts │  │
│  │  ├─ tool: { ai_diff_preview }         │  │
│  │  ├─ "file.edited": auto-suggest       │  │
│  │  └─ "tui.toast.show": notify user     │  │
│  └───────────────────────────────────────┘  │
│                    │                         │
│                    ▼                         │
│           ┌──────────────┐                   │
│           │ OpenCode TUI │                   │
│           │ / Web / IDE  │                   │
│           └──────────────┘                   │
└─────────────────────────────────────────────┘
```

**实现方式**：
1. 创建符合 OpenCode 规范的插件文件
2. 注册自定义工具供 Agent 调用
3. 监听 `file.edited` 事件，在保存 `.tsx`/`.jsx` 时触发设计分析
4. 通过 `tui.toast.show` 或 `tui.appendPrompt` 与用户交互
5. 工具返回外部预览 URL，用户点击打开

**优点**：
- ✅ 最符合 OpenCode 插件哲学
- ✅ 无需维护独立 Server
- ✅ 可利用所有 OpenCode 事件 Hook
- ✅ 用户可在 TUI 中直接调用工具

**缺点**：
- ❌ **无法渲染任何视觉 UI**，只能返回文本/URL
- ❌ Diff 预览必须在独立浏览器窗口中打开
- ❌ 交互式拖拽/缩放功能与 OpenCode 本体完全分离
- ❌ 插件中无法使用 React/Vite/Tailwind（插件是服务端 JS/TS）

**可行性评分**：⭐⭐⭐☆☆（3/5）

---

### 路径 D：OpenCode Web 模式内嵌（理论方案，当前不可行）

**构想**：

利用 OpenCode Web 模式的 CORS 支持，尝试将 React 应用作为 iframe 或 Web Component 嵌入 OpenCode Web UI。

**实现方式**：
1. 启动 `opencode web --cors http://localhost:3000`
2. 在 React 应用中通过 SDK 调用 OpenCode API
3. 尝试通过浏览器扩展或 iframe 将 React 应用嵌入 OpenCode Web 界面

**问题**：
- ❌ OpenCode Web UI **没有插件化扩展点**，无法注入自定义 iframe/panel
- ❌ 即使通过浏览器扩展强行注入，也属于 Hack 方案，不可维护
- ❌ OpenCode 团队未提供 WebView 或 Custom Panel API

**可行性评分**：⭐☆☆☆☆（1/5）

---

## 5. 技术限制深度分析

### 5.1 为什么 OpenCode 不支持 WebView/iframe？

OpenCode 的设计哲学是 **"Agent-first, UI-second"**：
- 核心是 AI Agent 的代码生成和文件操作能力
- UI（TUI/Web）只是与 Agent 交互的"客户端"
- 插件系统被设计为 **Agent 的能力扩展**，而非 IDE 的功能扩展
- 这与 VS Code（编辑器平台）或 JetBrains（IDE 平台）的定位完全不同

### 5.2 本项目的技术特性与 OpenCode 的匹配度

| 本项目特性 | 与 OpenCode 的匹配度 | 说明 |
|---|---|---|
| AI 设计生成（Gemini） | ✅ 高 | OpenCode 支持任意 LLM，Gemini 可直接接入 |
| 自然语言交互 | ✅ 高 | OpenCode Agent 天然支持 |
| Diff 预览渲染 | ⚠️ 中 | 需要浏览器环境，OpenCode 无法直接托管 |
| 拖拽/缩放交互 | ⚠️ 中 | 同上，需外部 Web 应用 |
| 代码生成（React/Vue/...）| ✅ 高 | Agent 可直接将生成代码写入文件 |
| 多语言支持 | ✅ 高 | OpenCode 本身不限定技术栈 |
| 文件监听/自动建议 | ✅ 高 | `file.edited` Hook 完美支持 |
| MCP 集成 | ✅ 高 | OpenCode 原生 MCP 支持 |

---

## 6. 推荐方案：混合架构

综合所有路径，推荐采用 **"OpenCode 自定义工具 + 独立 Web 应用 + SDK 桥接"** 的混合架构：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           用户工作流                                          │
│                                                                             │
│  1. 用户在 OpenCode 中输入："帮我设计一个 Hero Section"                        │
│  2. OpenCode Agent 调用 `ai_diff_preview` 工具                                │
│  3. 工具读取当前文件，发送给 Gemini，生成设计数据                                │
│  4. 工具返回："预览已生成，打开 http://localhost:3000/preview?id=xxx"          │
│  5. 用户点击链接，浏览器打开交互式 Diff 预览                                     │
│  6. 用户在预览中拖拽调整元素位置                                                │
│  7. 用户点击"Apply Changes"，预览应用通过 SDK 将代码写回项目文件                │
│  8. OpenCode 检测到文件变化，Agent 继续下一步工作                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

技术实现：

┌─────────────────────┐      ┌────────────────────────┐      ┌──────────────────┐
│   OpenCode Agent    │      │   OpenCode Server      │      │   React Web App   │
│                     │      │   (Port 4096)          │      │   (Port 3000)    │
│ ┌─────────────────┐ │      │                        │      │                  │
│ │ Custom Tool     │ │─────►│ ├─ REST API            │◄─────│ ├─ @opencode-ai/sdk│
│ │ ai_diff_preview │ │      │ ├─ file.read()         │      │ ├─ Gemini API    │
│ └─────────────────┘ │      │ ├─ file.write()        │      │ ├─ Diff Canvas   │
│                     │      │ ├─ event.subscribe()   │      │ └─ Code Gen      │
└─────────────────────┘      │ └─ tui.showToast()     │      └──────────────────┘
                             └────────────────────────┘
```

### 6.1 实施步骤

**Phase 1：MCP Server MVP（1-2 天）**
1. 完善 `mcp-server.ts`，添加 `generate_design` 和 `sync_preview` 工具
2. 在 `opencode.json` 中注册 MCP Server
3. 保持 React Web App 独立运行
4. 验证 Agent 可通过 MCP 调用设计生成

**Phase 2：自定义工具 + SDK 桥接（3-5 天）**
1. 创建 `.opencode/tools/ai-diff-preview.ts`
2. 在工具中通过 SDK 读取文件、调用 Gemini、返回 URL
3. 在 React Web App 中集成 `@opencode-ai/sdk`
4. 实现 Web App → OpenCode 的文件写回功能

**Phase 3：插件化增强（2-3 天）**
1. 创建 `.opencode/plugins/ai-diff-preview.ts`
2. 监听 `file.edited` 事件，自动触发设计建议 Toast
3. 监听 `session.compacted` 事件，保留设计上下文
4. 实现 `tui.toast.show` 通知用户预览就绪

**Phase 4：体验优化（持续）**
1. 自动打开浏览器标签页（通过 `open` 命令）
2. WebSocket 实时同步预览与 OpenCode 状态
3. 支持拖拽生成代码后直接写入文件

---

## 7. 代码重构建议

### 7.1 需要完全重写的文件

#### `opencode-plugin.ts` → `.opencode/plugins/ai-diff-preview.ts`

```typescript
import { tool } from "@opencode-ai/plugin"
import type { Plugin } from "@opencode-ai/plugin"

export const AiDiffPreviewPlugin: Plugin = async ({ client, directory }) => {
  return {
    // 自定义工具：Agent 可调用的设计生成
    tool: {
      ai_diff_preview: tool({
        description: "Generate an interactive AI design diff preview",
        args: {
          prompt: tool.schema.string().describe("Design requirement or change request"),
          filePath: tool.schema.string().optional().describe("Target component file path"),
        },
        async execute(args, context) {
          // 读取文件内容
          const code = args.filePath 
            ? await client.file.read({ query: { path: args.filePath } })
            : null
          
          // 调用 Gemini 生成设计
          // ...
          
          return `Design preview generated. Open: http://localhost:3000/preview?session=${context.sessionID}`
        }
      })
    },
    
    // 文件保存时触发设计建议
    "file.edited": async (input, output) => {
      if (input.path?.endsWith('.tsx') || input.path?.endsWith('.jsx')) {
        await client.tui.showToast({
          body: { 
            message: `Design suggestion available for ${input.path}. Use ai_diff_preview tool.`,
            variant: "info"
          }
        })
      }
    }
  }
}
```

#### `mcp-server.ts` → 标准 OpenCode MCP 配置

```json
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ai-diff-preview": {
      "type": "local",
      "command": ["npx", "tsx", "diff-preview/mcp-server.ts"],
      "environment": {
        "GEMINI_API_KEY": "{env:GEMINI_API_KEY}"
      },
      "enabled": true
    }
  }
}
```

### 7.2 需要新增的文件

| 文件 | 用途 |
|---|---|
| `.opencode/tools/ai-diff-preview.ts` | OpenCode 自定义工具定义 |
| `.opencode/plugins/ai-diff-preview.ts` | OpenCode 插件（Hooks）|
| `.opencode/package.json` | 插件依赖（`@opencode-ai/plugin` 等）|
| `diff-preview/src/services/opencode.ts` | React App 中集成 `@opencode-ai/sdk` |
| `diff-preview/src/services/bridge.ts` | Web App ↔ OpenCode Server 的通信桥接 |

### 7.3 依赖调整

```json
// .opencode/package.json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.0.0",
    "@opencode-ai/sdk": "^1.0.0",
    "@google/genai": "^1.29.0"
  }
}
```

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| OpenCode 插件 API 未来变更 | 中 | 中 | 使用官方 `@opencode-ai/plugin` 包，关注 changelog |
| OpenCode Server 未运行导致 SDK 连接失败 | 高 | 中 | 提供降级方案：纯本地模式（只读预览） |
| CORS/跨域问题 | 低 | 高 | 启动 OpenCode 时添加 `--cors http://localhost:3000` |
| Gemini API 限制/费用 | 中 | 低 | 添加缓存层，相同 prompt 复用结果 |
| 用户体验断层（独立窗口）| 高 | 高 | 探索浏览器扩展或未来 OpenCode WebView API |
| Windows 兼容性问题 | 中 | 低 | 使用 Node 跨平台 API，避免 shell 命令 |

---

## 9. 竞品与生态参考

在 OpenCode 生态中，有几个项目提供了类似"外部工具 + 独立 UI"的模式，可供参考：

| 项目 | 模式 | 与本项目的关联 |
|---|---|---|
| [opencode-daytona](https://github.com/daytonaio/daytona) | 插件 + 外部沙箱 | 如何在插件中启动外部服务 |
| [octto](https://github.com/vtemian/octto) | 独立 Web UI for AI brainstorming | 与本项目定位最接近（独立 Web UI） |
| [portal](https://github.com/hosenur/portal) | Mobile web UI over Tailscale | 外部客户端通过 SDK 连接 OpenCode |
| [@plannotator/opencode](https://github.com/backnotprop/plannotator) | 交互式计划审查 + 离线共享 | 视觉交互 + OpenCode 集成思路 |
| [OpenChamber](https://github.com/btriapitsyn/openchamber) | Web/Desktop App for OpenCode | 完整外部 UI 替代方案 |

---

## 10. 最终结论

### 10.1 可行性总评

| 维度 | 评分 | 说明 |
|---|---|---|
| **技术可行性** | ⭐⭐⭐⭐☆ | 有明确的集成路径，但需重构代码 |
| **用户体验** | ⭐⭐⭐☆☆ | 预览窗口独立，存在体验断层 |
| **开发成本** | ⭐⭐⭐⭐☆ | 中等，1-2 周可完成核心功能 |
| **维护成本** | ⭐⭐⭐⭐☆ | 依赖 OpenCode 稳定性，风险可控 |
| **生态价值** | ⭐⭐⭐⭐⭐ | 填补 OpenCode 生态中"视觉设计预览"空白 |

### 10.2 一句话结论

> **本项目作为 OpenCode 插件完全可行，但"插件"的定义应调整为：提供自定义工具（Custom Tool）+ MCP Server 来扩展 OpenCode Agent 的能力，同时将 React 前端作为独立 Web 应用通过 SDK 与 OpenCode Server 桥接。当前假设的 `context.registerTool()` 和 `context.on()` API 与 OpenCode 真实插件系统不兼容，需要基于 `@opencode-ai/plugin` 完全重写。**

### 10.3 行动建议

1. **立即执行**：重写 `opencode-plugin.ts` 为符合 OpenCode 规范的自定义工具（`.opencode/tools/ai-diff-preview.ts`）
2. **本周完成**：在 React Web App 中集成 `@opencode-ai/sdk`，实现文件读取和事件监听
3. **下周验证**：在真实 OpenCode 环境中测试 MCP Server + 自定义工具的端到端流程
4. **持续优化**：向 OpenCode 社区反馈 WebView/Panel 扩展需求，关注未来 API 演进

---

## 附录：参考链接

- OpenCode 官网：https://opencode.ai
- OpenCode GitHub：https://github.com/anomalyco/opencode
- 插件文档：https://opencode.ai/docs/plugins/
- MCP 文档：https://opencode.ai/docs/mcp-servers/
- SDK 文档：https://opencode.ai/docs/sdk/
- Server API 文档：https://opencode.ai/docs/server/
- 自定义工具文档：https://opencode.ai/docs/custom-tools/
- 生态系统：https://opencode.ai/docs/ecosystem/
- OpenCode Plugin Template：https://github.com/zenobi-us/opencode-plugin-template/
