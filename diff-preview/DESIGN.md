# OpenCode AI-Diff Preview Design Document

## 1. Project Overview
OpenCode AI-Diff Preview is an intelligent frontend design plugin designed to bridge the gap between AI-generated design concepts and human implementation. It provides a real-time "Diff Preview" layer over existing frontend code, allowing developers to visualize, interact with, and refine AI suggestions before committing them to the codebase.

## 2. Core Architecture
The project follows a "Plugin-as-a-Service" architecture:
- **Frontend (React + Vite)**: The visual interface that renders the IDE environment and the interactive Diff layer.
- **AI Engine (Gemini API)**: Powers the design generation, resource suggestion, and layout analysis.
- **Plugin Bridge**: Interfaces for integrating with host environments like OpenCode or Claude Code (MCP).

## 3. Key Features
### 3.1 AI Diff Preview Layer
- **Visual Overlay**: A semi-transparent layer that renders proposed UI elements (buttons, cards, text, images) on top of the current canvas.
- **Interactive Manipulation**: Drag-and-drop to reposition elements and handles for resizing.
- **Resource Points**: Ability to click and drop "AI Resource Points" which represent assets or components the AI has prepared.

### 3.2 Intelligent Design Assistant
- **Context-Aware Generation**: Uses Gemini 3 Flash to generate designs based on natural language prompts.
- **Resource Harvesting**: Automatically suggests relevant images and styles based on the design theme.
- **Multi-Language Support**: Simulates implementation in React, Vue, Svelte, and vanilla HTML/CSS.

### 3.3 Integration Hooks
- **OpenCode Plugin API**: Hooks into `onFileChange` and `onDesignRequest` events.
- **MCP (Model Context Protocol)**: Exposes design tools to Claude Code, allowing the agent to "push" designs to the preview window.

## 4. Technical Stack
- **Framework**: React 19
- **Styling**: Tailwind CSS 4
- **Animations**: Motion (formerly Framer Motion)
- **Icons**: Lucide React
- **AI SDK**: @google/genai (Gemini 3 Flash Preview)
- **Build Tool**: Vite 6

## 5. Plugin Integration Formats

### 5.1 OpenCode Integration
The plugin is structured to be loaded as a TypeScript module in OpenCode. It registers a custom tool `show_design_diff` which triggers the preview window.

### 5.2 Claude Code (MCP) Integration
Exposes an MCP server with the following tools:
- `generate_preview`: Sends a prompt to the AI and returns a layout schema.
- `sync_preview`: Updates the visual state of the preview window based on agent instructions.

## 6. Future Roadmap
- **Real-time Code Sync**: Automatically generating the actual code (JSX/CSS) as the user manipulates the Diff layer.
- **Asset Library Integration**: Connecting to Unsplash or Figma for high-fidelity assets.
- **Collaborative Diffing**: Allowing multiple designers/developers to interact with the same Diff layer.
