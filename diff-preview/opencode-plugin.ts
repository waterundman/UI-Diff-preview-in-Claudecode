/**
 * @deprecated This file uses a hypothetical plugin API that does not match the
 * real OpenCode plugin system. It is preserved for reference only.
 *
 * For the actual OpenCode integration, see:
 * - .opencode/tools/ai-diff-preview.ts   (Custom Tool)
 * - .opencode/plugins/ai-diff-preview.ts (Plugin Hooks)
 * - diff-preview/src/services/opencode.ts (SDK Bridge)
 */

export default function initPlugin(_context: any) {
  console.warn(
    "[DEPRECATED] opencode-plugin.ts uses a non-standard API. " +
    "Please migrate to .opencode/tools/ai-diff-preview.ts and .opencode/plugins/ai-diff-preview.ts"
  )
}
