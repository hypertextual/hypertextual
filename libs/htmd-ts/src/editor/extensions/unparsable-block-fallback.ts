import { defineHtmdExtension } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export interface UnparsableBlockFallbackOptions {
  nodeView?: HtmdNodeViewFactory
}

// api -----------------------------------------------------------------------

/**
 * Editable block fallback extension for unrecognized or malformed Markdown
 * blocks (`unparsedBlock` schema node).
 *
 * Preserves the exact raw source text in a monospace block with a diagnostic
 * badge so users can fix or inspect unsupported syntax without data loss:
 *
 * ```text
 * +------------------------------------------------------------+
 * | [!] Unrecognized Markdown: Unsupported table               |
 * | | col 1 | col 2 |                                          |
 * +------------------------------------------------------------+
 * ```
 */
export const UnparsableBlockFallback = defineHtmdExtension<UnparsableBlockFallbackOptions>({
  name: 'unparsedBlock',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined }),
})
