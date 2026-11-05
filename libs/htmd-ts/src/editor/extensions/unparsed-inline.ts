import { defineHtmdExtension, mergeHtmlAttributes } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

export interface UnparsedInlineOptions {
  nodeView?: HtmdNodeViewFactory
}

/** Display editable source and diagnostics without interpreting it as HTML. */
export const UnparsedInline = defineHtmdExtension<UnparsedInlineOptions>({
  name: 'unparsedInline',
  kind: 'node',
  inline: true,
  group: 'inline',
  content: 'text*',
  marks: '',
  defining: true,
  defaultOptions: () => ({ nodeView: undefined }),
  attributes: {
    kind: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute('data-source-kind'),
    },
    reason: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute('data-reason'),
    },
  },
  parseHTML() {
    return [{ tag: 'span[data-unparsed="inline"]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-unparsed': 'inline',
        'data-source-kind': node.attrs.kind,
        'data-reason': node.attrs.reason,
        'aria-label': 'Unparsed Markdown',
        title: `Unrecognized Markdown: ${node.attrs.reason ?? 'unsupported syntax'}`,
        class: 'rounded border border-border bg-muted/40 px-2 py-1 font-mono whitespace-pre-wrap',
      }),
      0,
    ]
  },
})
