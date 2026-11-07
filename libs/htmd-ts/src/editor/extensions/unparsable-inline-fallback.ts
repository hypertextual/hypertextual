import { defineHtmdExtension } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export interface UnparsableInlineFallbackOptions {
  nodeView?: HtmdNodeViewFactory
}

// api -----------------------------------------------------------------------

/**
 * Editable inline fallback extension for unrecognized inline directives and
 * malformed inline HTML marks (`unparsedInline` schema node).
 *
 * Because ProseMirror `Mark`s are flat metadata attached to text and cannot
 * own editable fallback content or a `NodeView`, both unsupported inline nodes
 * and malformed inline HTML marks recover into this inline chip:
 *
 * ```text
 * Paragraph text with [:unknown-directive]{! Unrecognized} inline source.
 * ```
 */
export const UnparsableInlineFallback = defineHtmdExtension<UnparsableInlineFallbackOptions>({
  name: 'unparsedInline',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined }),
})
