# OpenCode AI-Diff Preview — 项目维护文档

> 本文档基于代码库实际扫描生成，用于后续开发、排障与功能扩展。  
> 生成日期：2026-05-01

---

## 1. 项目概述

**项目名称**：OpenCode AI-Diff Preview  
**定位**：AI 驱动的前端设计 Diff 预览插件，架接 AI 生成设计与人工代码实现之间的鸿沟。  
**原始来源**：Google AI Studio 导出项目（App ID: `671ce2cd-c9c9-429d-adf6-1fbebaa80547`）  

核心能力：
- 根据自然语言提示，调用 Gemini 3 Flash 生成前端布局建议。
- 在现有画布上叠加 **Diff Preview 层**，支持拖拽、缩放、点击添加资源点。
- 实时生成多框架代码（React / Vue / Svelte / HTML+CSS）。
- 提供 MCP（Model Context Protocol）服务器，供 Claude Code 等 Agent 推送设计。
- 提供 OpenCode 插件接口，注册自定义工具 `ai_diff_preview`。

---

## 2. 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | React | ^19.0.0 | UI 运行时 |
| 语言 | TypeScript | ~5.8.2 | 全栈 TS |
| 构建 | Vite | ^6.2.0 | 开发服务器 + 打包（**重复声明于 devDeps & deps**） |
| 样式 | Tailwind CSS | ^4.1.14 | 原子化 CSS，通过 `@tailwindcss/vite` 插件集成 |
| 动画 | motion | ^12.23.24 | 原 Framer Motion，用于 Diff 层入场/拖拽 |
| 图标 | lucide-react | ^0.546.0 | 全量 SVG 图标 |
| AI SDK | @google/genai | ^1.29.0 | Gemini 3 Flash Preview 调用 |
| MCP | @modelcontextprotocol/sdk | ^1.29.0 | Claude Code 集成 |
| 运行时工具 | express | ^4.21.2 | MCP Server 底层依赖（当前未启用 HTTP 传输） |
| 工具链 | tsx | ^4.21.0 | 直接运行 TypeScript（`npm run mcp`） |
| 配置 | dotenv | ^17.2.3 | 环境变量加载 |

> **注意**：本项目没有独立的 `.css` 文件。Tailwind CSS v4 通过 Vite 插件在构建时注入，所有样式类均写在 JSX 中。

---

## 3. 目录结构

```
diff-preview-opencode/
├── index.html                     # HTML 入口（引用 /diff-preview/src/main.tsx）
├── metadata.json                  # AI Studio 应用元数据
├── package.json
├── tsconfig.json                  # TS 配置：path alias "@/*" -> "./diff-preview/*"
├── vite.config.ts                 # Vite 配置：React + Tailwind 插件、HMR 控制、env 注入
├── .env.example                   # 环境变量模板
├── .gitignore
├── README.md                      # AI Studio 提供的原始说明
│
└── diff-preview/
    ├── DESIGN.md                  # 高层设计文档（功能愿景、Roadmap）
    ├── mcp-server.ts              # MCP Server 定义（stdio 传输，当前未启动）
    ├── opencode-plugin.ts         # OpenCode 插件入口（注册 ai_diff_preview 工具）
    └── src/
        ├── App.tsx                # 主应用：IDE 布局 + Canvas + Diff 层 + 属性面板
        └── services/
            └── gemini.ts          # Gemini API 封装：generateDesignSuggestion()
```

### 3.1 关键文件详解

#### `index.html`
- 标准单页应用 HTML 壳。
- 脚本入口：`<script type="module" src="/diff-preview/src/main.tsx"></script>`
- ⚠️ **已知问题**：`diff-preview/src/main.tsx` **文件不存在**，会导致 Vite 启动时报 `404`。

#### `vite.config.ts`
- 插件：`react()` + `tailwindcss()`
- `define` 中将 `process.env.GEMINI_API_KEY` 注入为运行时可用字符串（供 `gemini.ts` 读取）。
- `resolve.alias` 配置 `"@"` -> `./diff-preview`，与 `tsconfig.json` 的 `paths` 保持一致。
- `server.hmr` 受 `DISABLE_HMR` 环境变量控制（AI Studio 内部使用，防止 Agent 编辑时闪烁）。

#### `diff-preview/src/App.tsx`（核心）
- **状态管理**：使用 React `useState`，无外部状态库。
  - `currentElements`：当前画布上的已有元素。
  - `suggestion` / `showDiff`：AI 建议及其显隐。
  - `selectedElementId`：当前选中元素 ID。
  - `activeTab` / `activeBottomTab` / `activeLanguage`：UI 面板状态。
- **ElementNode 组件**：递归渲染元素树，支持 `parentId` 层级。
  - Diff 元素（`isDiff=true`）：`motion.div` 包裹，支持拖拽（`drag`）、缩放（右下角手柄）。
  - 现有元素（`isDiff=false`）：普通 `div`，支持点击选中。
- **坐标系统**：全部使用百分比（`0–100`），相对于 `canvas-root` 容器。
- **代码生成**：`generateCode()` 根据当前元素树生成 React / Vue / Svelte / HTML 代码片段。
- **模拟 Agent Push**：`simulateAgentPush()` 硬编码一套演示数据，用于本地测试 MCP 流程。

#### `diff-preview/src/services/gemini.ts`
- 初始化：`new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`
- 模型：`gemini-3-flash-preview`
- 调用方式：`generateContent`，强制要求 JSON 输出（`responseMimeType: "application/json"`）。
- Schema 约束：返回必须包含 `title`、`description`、`elements[]`、`resources[]`。
- `elements` 中 `x, y, width, height` 为百分比数值；`style` 存放 Tailwind 类名；`parentId` 可选，用于父子嵌套。

#### `diff-preview/mcp-server.ts`
- 使用 `@modelcontextprotocol/sdk` 构建标准 MCP Server。
- 注册工具 `show_design_suggestion`，参数：`prompt`（必填）、`elements`（可选）。
- 传输层：`StdioServerTransport`（标准输入输出，适合 Claude Code 本地集成）。
- ⚠️ **当前状态**：`main()` 被注释掉，文件仅作定义，不会真正启动服务器。

#### `diff-preview/opencode-plugin.ts`
- 导出默认函数 `initPlugin(context)`。
- 注册工具 `ai_diff_preview`：接收 `prompt` + 可选 `context_code`，返回预览 URL。
- 监听 `file:save` 事件：对 `.tsx` / `.jsx` 文件保存时打印日志（设计建议 Toast 逻辑未实现）。

---

## 4. 环境变量

复制 `.env.example` 为 `.env.local`（或 `.env`）并填入真实值：

| 变量名 | 必填 | 说明 |
|---|---|---|
| `GEMINI_API_KEY` | ✅ 是 | Gemini API 密钥。AI Studio 运行时自动从用户 Secrets 注入。 |
| `APP_URL` | ⚠️ 插件场景需要 | 本应用部署后的公网地址。AI Studio 自动注入 Cloud Run URL。 |

> 本地开发时，Vite 通过 `loadEnv` 读取根目录 `.env` 文件，并将 `GEMINI_API_KEY` 打包进 `process.env.GEMINI_API_KEY`。

---

## 5. 可用脚本

```bash
# 开发服务器（端口 3000，监听 0.0.0.0）
npm run dev

# 生产构建（输出到 dist/）
npm run build

# 预览构建产物
npm run preview

# 启动 MCP Server（需 tsx）
npm run mcp

# TypeScript 类型检查（不输出文件）
npm run lint

# 清理构建产物（⚠️ Windows 下 rm 命令会失败）
npm run clean
```

---

## 6. 已知问题与维护清单

### 🔴 阻塞性问题

| 编号 | 问题 | 影响 | 建议修复 |
|---|---|---|---|
| **ISSUE-001** | `diff-preview/src/main.tsx` 不存在 | `index.html` 引用该文件，Vite 启动直接 404，项目无法运行 | **必须补充**。典型内容：渲染 `<App />` 到 `root` 节点，并引入 Tailwind CSS 基础样式。 |
| **ISSUE-002** | `package.json` 中 `vite` 同时出现在 `dependencies` 和 `devDependencies` | 依赖冗余，可能造成版本锁定冲突 | 将 `vite` 保留在 `devDependencies`，从 `dependencies` 中移除。 |
| **ISSUE-003** | `clean` 脚本使用 `rm -rf` | Windows 环境（当前平台为 win32）执行 `npm run clean` 会报错 | 改为跨平台方案，如安装 `rimraf` 并改写为 `rimraf dist`，或直接用 `node -e "require('fs').rmSync('dist', {recursive:true, force:true})"`。 |

### 🟡 功能/集成缺陷

| 编号 | 问题 | 说明 |
|---|---|---|
| **ISSUE-004** | MCP Server 未真正启动 | `mcp-server.ts` 末尾 `main()` 被注释，stdio 传输未连接。若需集成 Claude Code，需取消注释并确保进程可被调用。 |
| **ISSUE-005** | OpenCode 插件未挂载 | `opencode-plugin.ts` 为模块导出，当前没有在任何地方被 `import` 并执行 `initPlugin()`。需要确认 OpenCode 运行时的插件加载机制。 |
| **ISSUE-006** | `gemini.ts` 缺少错误兜底 | `JSON.parse(response.text || '{}')` 在 API 返回异常或空内容时会抛错，建议加 `try/catch` 并返回友好错误。 |
| **ISSUE-007** | 资源图片外链稳定性 | `gemini.ts` 生成的 `resources[].url` 与 `simulateAgentPush()` 中的 `picsum.photos` 均依赖第三方图床，生产环境建议接入自托管或 Unsplash API。 |
| **ISSUE-008** | 拖拽/缩放无精度限制 | 百分比坐标可超出 `0–100` 范围（虽然代码做了 `Math.max(0, Math.min(90, ...))`，但属性面板输入框未限制）。 |

### 🟢 代码优化建议

- **状态管理**：当前所有状态集中在 `App.tsx`。若后续扩展多画布、多页面，建议引入 Zustand / Jotai / Redux Toolkit。
- **类型复用**：`Element` 接口与 `AIDesignSuggestion.elements` 成员类型重复，可提取到共享 `types.ts`。
- **图片加载**：`resources` 网格中的 `<img>` 没有 `onError` 处理，网络异常时会显示裂图。
- **无障碍**：画布元素均为 `div`，缺少 `role`、`aria-label`、`tabIndex`，键盘无法操作。
- **性能**：`generateCode()` 在每次渲染时重新拼接字符串，若元素树变大可使用 `useMemo` 缓存。

---

## 7. 架构与数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Sidebar  │  │   Canvas     │  │  Properties Panel    │  │
│  │ (AI Tab) │  │ (Current +   │  │  (Layout / Style)    │  │
│  │          │  │  Diff Overlay)│  │                      │  │
│  └────┬─────┘  └──────┬───────┘  └──────────────────────┘  │
│       │               │                                      │
│       └───────────────┼──────────────────────────────────────┘
│                       │ React State (useState)
│                       ▼
│              ┌────────────────┐
│              │   App.tsx      │
│              │ (Orchestrator) │
│              └───────┬────────┘
│                      │
│         ┌────────────┼────────────┐
│         ▼            ▼            ▼
│   ┌──────────┐ ┌──────────┐ ┌──────────────┐
│   │ gemini.ts│ │ simulate │ │ updateElement│
│   │(AI Call) │ │AgentPush │ │(Local Edit)  │
│   └────┬─────┘ └──────────┘ └──────────────┘
│        │
│        ▼ HTTP
│  ┌─────────────┐
│  │Gemini 3 Flash│
│  └─────────────┘
└─────────────────────────────────────────────────────────────┘

外部集成接口：
┌──────────────────┐      ┌──────────────────┐
│ mcp-server.ts    │      │ opencode-plugin.ts│
│ (Claude Code)    │      │ (OpenCode Agent)  │
│ Stdio Transport  │      │ registerTool()    │
└──────────────────┘      └──────────────────┘
```

### 7.1 核心类型

```typescript
// Element（画布通用节点）
interface Element {
  id: string;
  type: 'button' | 'card' | 'text' | 'image' | 'container';
  content: string;      // 文本内容或占位符
  x: number;            // 百分比横坐标
  y: number;            // 百分比纵坐标
  width: number;        // 百分比宽度
  height: number;       // 百分比高度
  style: string;        // Tailwind CSS 类名
  parentId?: string;    // 父节点 ID，可选
}

// AI 返回的完整建议
interface AIDesignSuggestion {
  title: string;
  description: string;
  elements: Element[];
  resources: { name: string; type: string; url: string }[];
}
```

---

## 8. 扩展与开发指南

### 8.1 添加新元素类型
1. 在 `Element['type']` 联合类型中追加新类型（如 `'input'`、`'video'`）。
2. 在 `ElementNode` 组件中增加渲染分支（参考 `el.type === 'image'` 的处理）。
3. 更新 `gemini.ts` 的 `responseSchema` 中 `type` 字段的 `enum`，让 AI 知道可以生成该类型。

### 8.2 接入其他 AI 模型
- 当前硬编码 `gemini-3-flash-preview`。
- 如需切换模型（如 Gemini 2.5 Pro、OpenAI GPT-4o），建议封装 `services/ai.ts` 抽象层，保持 `App.tsx` 不变。

### 8.3 接入真实资源库
- 当前 `resources` 为 AI 生成的外链图片。
- 可扩展 `services/assets.ts`，对接 Unsplash API / Figma API / 本地素材库，将 `url` 替换为可信 CDN 地址。

### 8.4 MCP Server 真正运行
- 取消 `mcp-server.ts` 末尾注释：`main().catch(console.error)`。
- 在 Claude Code 配置中添加 `mcpServers.opencode-ai-diff` 指向 `"tsx diff-preview/mcp-server.ts"`。
- 若需 HTTP/SSE 传输，可将 `StdioServerTransport` 替换为 `SSEServerTransport`。

### 8.5 OpenCode 插件加载
- 确认 OpenCode 是否支持直接 `import()` 外部 `.ts` 文件。
- 若不支持，需将 `opencode-plugin.ts` 预编译为 CommonJS 或 ESM  bundle。

---

## 9. 维护检查表（Checklist）

每次迭代前建议确认：

- [ ] `GEMINI_API_KEY` 已配置且未过期。
- [ ] `diff-preview/src/main.tsx` 存在且正确挂载 `App`。
- [ ] `npm run lint` 无 TS 类型错误。
- [ ] `npm run build` 成功输出 `dist/`。
- [ ] MCP Server 如需启用，确认 `main()` 未注释。
- [ ] 新增依赖时检查是否重复加入 `dependencies` / `devDependencies`。
- [ ] 修改 `Element` 类型后同步更新 `gemini.ts` 的 JSON Schema。

---

## 10. 相关链接与参考

- Google AI Studio 在线预览：https://ai.studio/apps/671ce2cd-c9c9-429d-adf6-1fbebaa80547
- Tailwind CSS v4 文档：https://tailwindcss.com/docs/v4-beta
- Motion (Framer Motion) 文档：https://motion.dev/
- Google GenAI SDK (`@google/genai`)：https://github.com/googleapis/js-genai
- Model Context Protocol (MCP) 规范：https://modelcontextprotocol.io/

---

> **文档维护者**：请在本文件顶部追加修订记录，格式如下：  
> `2026-05-01 — 初始版本：完成项目扫描与维护文档编写。`
