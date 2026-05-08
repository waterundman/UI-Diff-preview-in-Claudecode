/**
 * OpenCode SDK Bridge for AI-Diff Preview (Browser-compatible)
 *
 * This module provides connectivity between the React Web App and
 * a running OpenCode Server instance using plain fetch() calls.
 *
 * We avoid importing `@opencode-ai/sdk` directly in the browser bundle
 * because the SDK contains Node.js-only code (child_process, fs, etc.).
 * Instead, we call the OpenCode REST API directly.
 *
 * Reference: https://opencode.ai/docs/server/
 */

export interface BridgeConfig {
  baseUrl?: string
  password?: string
  timeout?: number
  maxRetries?: number
  autoReconnect?: boolean
  healthCheckInterval?: number
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error"

class OpenCodeBridge {
  private baseUrl = "http://localhost:4096"
  private headers: Record<string, string> = {}
  private connected = false
  private connectionState: ConnectionState = "disconnected"
  private config: BridgeConfig = {}
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private abortController: AbortController | null = null

  /**
   * Attempt to connect to OpenCode Server with retry and timeout.
   */
  async connect(config: BridgeConfig = {}): Promise<boolean> {
    this.config = {
      timeout: 10000,
      maxRetries: 3,
      autoReconnect: true,
      healthCheckInterval: 30000,
      ...config,
    }
    this.baseUrl = this.config.baseUrl || "http://localhost:4096"
    this.headers = {}

    if (this.config.password) {
      this.headers["Authorization"] = `Basic ${btoa(`opencode:${this.config.password}`)}`
    }

    this.connectionState = "connecting"
    this.cleanup()

    const maxRetries = this.config.maxRetries || 3
    const timeout = this.config.timeout || 10000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.abortController = new AbortController()
        const timeoutId = setTimeout(() => this.abortController?.abort(), timeout)

        const res = await fetch(`${this.baseUrl}/project/current`, {
          headers: this.headers,
          signal: this.abortController.signal,
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          this.connected = true
          this.connectionState = "connected"
          console.log(`[OpenCodeBridge] Connected to ${this.baseUrl}`)
          this.startHealthCheck()
          return true
        }

        console.warn(`[OpenCodeBridge] Connection attempt ${attempt} failed: HTTP ${res.status}`)
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "AbortError"
        console.warn(
          `[OpenCodeBridge] Connection attempt ${attempt}/${maxRetries} failed:`,
          isTimeout ? "Timeout" : err
        )
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    this.connected = false
    this.connectionState = "error"
    return false
  }

  isConnected(): boolean {
    return this.connected
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)
    const interval = this.config.healthCheckInterval || 30000
    this.healthCheckTimer = setInterval(() => this.healthCheck(), interval)
  }

  private async healthCheck(): Promise<void> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${this.baseUrl}/project/current`, {
        headers: this.headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        this.handleDisconnect()
      }
    } catch {
      this.handleDisconnect()
    }
  }

  private handleDisconnect(): void {
    this.connected = false
    this.connectionState = "disconnected"
    console.warn("[OpenCodeBridge] Connection lost")

    if (this.config.autoReconnect) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(async () => {
      console.log("[OpenCodeBridge] Attempting reconnect...")
      await this.connect(this.config)
    }, 5000)
  }

  private cleanup(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  disconnect(): void {
    this.cleanup()
    this.connected = false
    this.connectionState = "disconnected"
    console.log("[OpenCodeBridge] Disconnected")
  }

  private async request(path: string): Promise<any> {
    const timeout = this.config.timeout || 10000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Request timeout")
      }
      throw err
    }
  }

  private async post(path: string, body: any): Promise<any> {
    const timeout = this.config.timeout || 10000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Request timeout")
      }
      throw err
    }
  }

  /**
   * Read a file from the OpenCode-managed project.
   */
  async readFile(path: string): Promise<string | null> {
    if (!this.connected) return null
    try {
      const data = await this.request(`/file/content?path=${encodeURIComponent(path)}`)
      return data?.content ?? null
    } catch (err) {
      console.error(`[OpenCodeBridge] Failed to read ${path}:`, err)
      return null
    }
  }

  /**
   * Subscribe to OpenCode server events (SSE).
   */
  async *subscribeEvents() {
    if (!this.connected) return
    try {
      const response = await fetch(`${this.baseUrl}/event`, { headers: this.headers })
      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              yield JSON.parse(line.slice(6))
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      console.error("[OpenCodeBridge] Event subscription failed:", err)
    }
  }

  /**
   * Get the current project information.
   */
  async getProject() {
    if (!this.connected) return null
    try {
      return await this.request("/project/current")
    } catch (err) {
      console.error("[OpenCodeBridge] Failed to get project:", err)
      return null
    }
  }

  /**
   * Show a toast in OpenCode TUI (if connected and TUI is active).
   */
  async showToast(message: string, variant: "info" | "success" | "warning" | "error" = "info") {
    if (!this.connected) return false
    try {
      await this.post("/tui/show-toast", { message, variant })
      return true
    } catch {
      return false
    }
  }

  async writeFile(path: string, content: string): Promise<boolean> {
    if (!this.connected) return false
    try {
      await this.post("/file/write", { path, content })
      return true
    } catch (err) {
      console.error(`[OpenCodeBridge] Failed to write ${path}:`, err)
      return false
    }
  }

  async notifyAgent(sessionId: string, message: string): Promise<boolean> {
    if (!this.connected) return false
    try {
      await this.post(`/session/${encodeURIComponent(sessionId)}/prompt`, {
        noReply: true,
        parts: [{ type: "text", text: `[AI-Diff Preview] ${message}` }]
      })
      return true
    } catch (err) {
      console.error("[OpenCodeBridge] Failed to notify agent:", err)
      return false
    }
  }

  async suggestNext(text: string): Promise<boolean> {
    if (!this.connected) return false
    try {
      await this.post("/tui/append-prompt", { text })
      return true
    } catch (err) {
      console.error("[OpenCodeBridge] Failed to suggest next step:", err)
      return false
    }
  }
}

export const opencodeBridge = new OpenCodeBridge()
export default opencodeBridge
