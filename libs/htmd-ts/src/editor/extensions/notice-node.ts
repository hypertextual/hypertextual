import { defineHtmdExtension, mergeHtmlAttributes } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory, NoticeAttributes, NoticeVariant } from '../types.js'

export type { NoticeAttributes, NoticeVariant }

export interface NoticeNodeOptions {
  nodeView?: HtmdNodeViewFactory
}

function findNoticeDepth(state: import('@tiptap/pm/state').EditorState): number {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'notice') {
      return depth
    }
  }
  return -1
}

export const NoticeNode = defineHtmdExtension<
  NoticeNodeOptions,
  Record<string, never>,
  {
    insertNotice: (
      attributes?: NoticeAttributes,
    ) => (ctx: { commands: { insertContent: (value: unknown) => boolean } }) => boolean
  }
>({
  name: 'notice',
  kind: 'node',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,
  defaultOptions: () => ({ nodeView: undefined }),
  attributes: {
    variant: { default: 'info' },
    title: {
      default: 'Note',
      parseHTML: (element) => element.querySelector('[data-notice-title]')?.textContent ?? 'Note',
    },
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
      mergeHtmlAttributes(attributes, {
        'data-type': 'notice',
        'data-variant': variant,
        class: 'editor-notice my-4 rounded-lg border border-border bg-muted/40 p-4',
      }),
      ['div', { 'data-notice-title': '', class: 'font-semibold tracking-tight' }, String(title)],
      ['div', { 'data-notice-body': '' }, 0],
    ]
  },
  keymap() {
    return {
      Tab: {
        id: 'notice.focusTitle',
        key: 'Tab',
        label: 'Focus Notice Title',
        mode: 'insert',
        when: ({ state }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return findNoticeDepth(state) > 0
        },
        run: ({ state, view }) => {
          const depth = findNoticeDepth(state)
          if (depth < 0) return false
          const dom = view.nodeDOM(state.selection.$from.before(depth))
          if (!(dom instanceof HTMLElement)) return false
          const target = dom.querySelector<HTMLElement>('input[aria-label="Notice title"]')
          if (!target) return false
          target.focus()
          return true
        },
      },
      'Shift-Tab': {
        id: 'notice.focusType',
        key: 'Shift+Tab',
        label: 'Focus Notice Type',
        mode: 'insert',
        when: ({ state }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return findNoticeDepth(state) > 0
        },
        run: ({ state, view }) => {
          const depth = findNoticeDepth(state)
          if (depth < 0) return false
          const dom = view.nodeDOM(state.selection.$from.before(depth))
          if (!(dom instanceof HTMLElement)) return false
          const target = dom.querySelector<HTMLElement>(
            '[aria-label="Notice type"][data-part="trigger"], [data-part="trigger"]',
          )
          if (!target) return false
          target.focus()
          return true
        },
      },
      ArrowUp: {
        id: 'notice.arrowUpToTitle',
        key: 'ArrowUp',
        label: 'Move to Notice Title',
        mode: 'insert',
        when: ({ state }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          const depth = findNoticeDepth(state)
          if (depth < 0 || !state.selection.empty) return false
          return state.selection.$from.index(depth) === 0
        },
        run: ({ state, view }) => {
          const depth = findNoticeDepth(state)
          if (depth < 0 || !state.selection.empty) return false
          const { $from } = state.selection
          if ($from.index(depth) !== 0) return false
          const cursorCoords = view.coordsAtPos(state.selection.from)
          const firstLineCoords = view.coordsAtPos($from.start())
          if (cursorCoords.top > firstLineCoords.top + 2) return false
          const dom = view.nodeDOM($from.before(depth))
          if (!(dom instanceof HTMLElement)) return false
          const titleInput = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
          if (!titleInput) return false
          titleInput.focus()
          return true
        },
      },
    }
  },
  commands: () => ({
    insertNotice:
      (attributes = {}) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'notice',
          attrs: attributes,
          content: [{ type: 'paragraph', content: [] }],
        }),
  }),
})
