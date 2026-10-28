import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewOptions } from '../types'

/** Display editable source and diagnostics without interpreting it as HTML. */
export const UnparsedBlock = Node.create<NodeViewOptions>({
  name: 'unparsedBlock',
  group: 'block',
  code: true,
  content: 'text*',
  marks: '',
  defining: true,

  addOptions() {
    return { nodeView: undefined }
  },
  addAttributes() {
    return {
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
    }
  },
  parseHTML() {
    return [{ tag: 'pre[data-unparsed="block"]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        'data-unparsed': 'block',
        'data-source-kind': node.attrs.kind,
        'data-reason': node.attrs.reason,
        'aria-label': 'Unparsed Markdown',
        title: `Unrecognized Markdown: ${node.attrs.reason ?? 'unsupported syntax'}`,
        class: 'rounded border border-border bg-muted/40 px-2 py-1 font-mono whitespace-pre-wrap',
      }),
      0,
    ]
  },
  addNodeView() {
    return this.options.nodeView?.() ?? null
  },
})
