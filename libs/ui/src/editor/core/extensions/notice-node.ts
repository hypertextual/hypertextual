// libs/helical-ui/src/editor/extensions/notice-node.ts
// Editable Notice block. Framework node views render the existing helical Notice component;
// renderHTML keeps the same content available to the static Reader.
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { NodeViewOptions } from '../types'

export type NoticeVariant = 'info' | 'success' | 'warning' | 'error'

export interface NoticeAttributes {
  variant?: NoticeVariant
  title?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notice: {
      insertNotice: (attributes?: NoticeAttributes) => ReturnType
    }
  }
}

export const NoticeNode = Node.create<NodeViewOptions>({
  addOptions() {
    return { nodeView: undefined }
  },

  name: 'notice',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: { default: 'info' },
      title: {
        default: 'Note',
        parseHTML: (element) => element.querySelector('[data-notice-title]')?.textContent ?? 'Note',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="notice"]', contentElement: '[data-notice-body]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const {
      title = 'Note',
      variant: rawVariant = 'info',
      ...attributes
    } = HTMLAttributes as Record<string, unknown>
    const variant = rawVariant as NoticeVariant
    return [
      'aside',
      mergeAttributes(attributes, {
        'data-type': 'notice',
        'data-variant': variant,
        class: 'editor-notice my-4 rounded-lg border border-border bg-muted/40 p-4',
      }),
      ['div', { 'data-notice-title': '', class: 'font-semibold tracking-tight' }, String(title)],
      ['div', { 'data-notice-body': '' }, 0],
    ]
  },

  addNodeView() {
    return this.options.nodeView?.() ?? null
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'ArrowUp') return false
            const { selection } = view.state
            const { $from } = selection
            if (!selection.empty) return false

            let noticeDepth = -1
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if ($from.node(depth).type.name === this.name) {
                noticeDepth = depth
                break
              }
            }
            if (noticeDepth < 0 || $from.index(noticeDepth) !== 0) return false

            const cursorCoords = view.coordsAtPos(selection.from)
            const firstLineCoords = view.coordsAtPos($from.start())
            if (cursorCoords.top > firstLineCoords.top + 2) return false

            const dom = view.nodeDOM($from.before(noticeDepth))
            if (!(dom instanceof HTMLElement)) return false
            const titleInput = dom.querySelector<HTMLInputElement>(
              'input[aria-label="Notice title"]',
            )
            if (!titleInput) return false

            titleInput.focus()
            return true
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      insertNotice:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: [{ type: 'paragraph', content: [] }],
          }),
    }
  },
})
