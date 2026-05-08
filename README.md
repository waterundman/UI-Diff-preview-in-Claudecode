# OpenCode AI-Diff Preview

AI驱动的交互式前端设计Diff预览工具，架接AI生成设计与人工代码实现之间的鸿沟。

## 核心能力

- **AI设计生成**：自然语言提示 → Gemini 3 Flash生成前端布局、资源建议
- **交互式Diff预览**：在画布上叠加AI建议层，支持拖拽、缩放、点击添加资源点
- **多框架代码生成**：实时生成 React / Vue / Svelte / HTML+CSS 代码
- **OpenCode Agent集成**：作为OpenCode自定义工具 + 插件使用，让AI编码Agent拥有视觉预览能力
- **MCP Server**：标准stdio MCP服务器，供Claude Code等Agent推送设计

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 | UI框架 |
| TypeScript 5.8 | 全栈类型安全 |
| Vite 6 | 构建工具 |
| Tailwind CSS 4 | 原子化样式 |
| Motion (Framer Motion) | Diff层动画与交互 |
| @google/genai | Gemini AI API |
| @modelcontextprotocol/sdk | MCP服务器 |
| @opencode-ai/plugin | OpenCode插件API |
| @opencode-ai/sdk | OpenCode Server桥接 |

## 快速开始

**前置条件**: Node.js 18+

1. 安装依赖
   ```bash
   npm install
   ```

2. 配置API密钥
   复制 `.env.example` 为 `.env`，填入 Gemini API Key：
   ```env
   GEMINI_API_KEY="your-api-key"
   ```

3. 启动开发服务器
   ```bash
   npm run dev
   ```

4. 打开浏览器访问 `http://localhost:3000`

## 集成方式

### OpenCode 集成

本项目提供两个集成入口：

**自定义工具** (`.opencode/tools/ai-diff-preview.ts`):
OpenCode Agent可直接调用 `ai_diff_preview` 工具生成设计预览。

**插件** (`.opencode/plugins/ai-diff-preview.ts`):
监听文件变更事件，自动建议设计预览。

### MCP Server (Claude Code)

```bash
npm run mcp
```

在 Claude Code 配置中添加：
```json
{
  "mcpServers": {
    "ai-diff-preview": {
      "command": "npx",
      "args": ["tsx", "diff-preview/mcp-server.ts"]
    }
  }
}
```

### OpenCode SDK 桥接

Web应用运行时自动尝试连接 `localhost:4096` 处的 OpenCode Server，实现：
- 文件读取 (`/file/content`)
- 事件订阅 (`/event` SSE)
- Toast通知 (`/tui/show-toast`)

## 可用脚本

```bash
npm run dev       # 开发服务器 (端口3000)
npm run build     # 生产构建
npm run preview   # 预览构建产物
npm run mcp       # MCP Server (stdio)
npm run lint      # TypeScript类型检查
```

## 项目结构

```
├── diff-preview/              # 核心代码
│   ├── src/
│   │   ├── App.tsx            # 主应用(IDE布局)
│   │   ├── main.tsx           # React入口
│   │   └── services/
│   │       ├── gemini.ts      # Gemini API(含重试逻辑)
│   │       └── opencode.ts    # OpenCode Bridge
│   └── mcp-server.ts          # MCP Server
├── .opencode/                 # OpenCode集成
│   ├── plugins/
│   │   └── ai-diff-preview.ts # 插件Hooks
│   └── tools/
│       └── ai-diff-preview.ts # 自定义工具
└── package.json
```

## 生态定位

本项目在"AI编码Agent + 可视化设计预览"生态位中处于独特位置：
- **与其他设计工具不同**：面向AI Agent而非人类设计师
- **与OpenCode深度集成**：通过自定义工具、插件Hooks、SDK桥接三层集成
- **轻量级**：Canvas叠加层而非完整Web沙箱
