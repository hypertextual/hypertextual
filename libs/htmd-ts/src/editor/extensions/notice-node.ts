import {
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusBeforeBlock,
  focusBlockAtPos,
  focusTextPosition,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  mergeHtmlAttributes,
} from '../define-htmd-extension.js'
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
        label: 'Focus Notice Title or Next Notice Control',
        mode: 'insert',
        when: ({ state }, event) =>
          Boolean(findNodeViewControl(state, event, 'notice')) || findNoticeDepth(state) > 0,
        run: ({ editor, state, view }, event) => {
          const ctrl = findNodeViewControl(state, event, 'notice')
          if (ctrl) {
            if (ctrl.target.matches('input[aria-label="Notice title"]')) {
              const trigger = ctrl.wrapper.querySelector<HTMLElement>(
                'button[data-part="trigger"], [aria-label="Notice type"][data-part="trigger"]',
              )
              if (trigger) {
                trigger.focus()
                return true
              }
              return false
            }
            const trigger = ctrl.target.closest<HTMLElement>('[data-part="trigger"]')
            if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
              return focusTextPosition(editor, ctrl.pos + 2)
            }
            return false
          }
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
        label: 'Focus Notice Type or Previous Notice Control',
        mode: 'insert',
        when: ({ state }, event) =>
          Boolean(findNodeViewControl(state, event, 'notice')) || findNoticeDepth(state) > 0,
        run: ({ editor, state, view }, event) => {
          const ctrl = findNodeViewControl(state, event, 'notice')
          if (ctrl) {
            if (ctrl.target.matches('input[aria-label="Notice title"]')) {
              return focusTextPosition(editor, ctrl.pos + 2)
            }
            const trigger = ctrl.target.closest<HTMLElement>('[data-part="trigger"]')
            if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
              const titleInput = ctrl.wrapper.querySelector<HTMLInputElement>(
                'input[aria-label="Notice title"]',
              )
              if (titleInput) {
                titleInput.focus()
                return true
              }
            }
            return false
          }
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
        label: 'Move to Notice Title or Above Notice',
        mode: 'insert',
        when: ({ state }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return Boolean(findNodeViewControl(state, event, 'notice'))
          }
          return true
        },
        run: ({ editor, state, view }, event) => {
          const ctrl = findNodeViewControl(state, event, 'notice')
          if (ctrl) {
            if (ctrl.target.matches('input[aria-label="Notice title"]')) {
              return focusBeforeBlock(editor, ctrl.pos)
            }
            const trigger = ctrl.target.closest<HTMLElement>('[data-part="trigger"]')
            if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
              return focusBeforeBlock(editor, ctrl.pos)
            }
            return false
          }
          const depth = findNoticeDepth(state)
          if (depth > 0) {
            if (!state.selection.empty) return false
            const { $from } = state.selection
            if ($from.index(depth) !== 0) return false
            if (!isAtFirstVisualLine(view, state)) return false
            const dom = view.nodeDOM($from.before(depth))
            if (!(dom instanceof HTMLElement)) return false
            const titleInput = dom.querySelector<HTMLInputElement>(
              'input[aria-label="Notice title"]',
            )
            if (!titleInput) return false
            titleInput.focus()
            return true
          }
          if (isAtFirstVisualLine(view, state)) {
            const prevPos = findPrevBlockPos(state)
            if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'notice') {
              return focusBlockAtPos(editor, prevPos, 'up')
            }
          }
          return false
        },
      },
      ArrowDown: {
        id: 'notice.arrowDownToTitleOrExit',
        key: 'ArrowDown',
        label: 'Move to Notice Body or Exit Notice',
        mode: 'insert',
        when: ({ state }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return Boolean(findNodeViewControl(state, event, 'notice'))
          }
          return true
        },
        run: ({ editor, state, view }, event) => {
          const ctrl = findNodeViewControl(state, event, 'notice')
          if (ctrl) {
            if (ctrl.target.matches('input[aria-label="Notice title"]')) {
              return focusTextPosition(editor, ctrl.pos + 2)
            }
            const trigger = ctrl.target.closest<HTMLElement>('[data-part="trigger"]')
            if (trigger && trigger.getAttribute('aria-expanded') !== 'true') {
              return focusTextPosition(editor, ctrl.pos + 2)
            }
            return false
          }
          if (!isAtLastVisualLine(view, state)) return false
          const depth = findNoticeDepth(state)
          if (depth > 0) {
            const { $from } = state.selection
            if ($from.index(depth) === $from.node(depth).childCount - 1) {
              return focusBlockAtPos(editor, $from.after(depth), 'down', true)
            }
            return false
          }
          const nextPos = findNextBlockPos(state)
          if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'notice') {
            return focusBlockAtPos(editor, nextPos, 'down')
          }
          return false
        },
      },
      Enter: {
        id: 'notice.focusBodyEnter',
        key: 'Enter',
        label: 'Focus Notice Body',
        mode: 'insert',
        when: ({ state }, event) =>
          Boolean(
            findNodeViewControl(state, event, 'notice')?.target.matches(
              'input[aria-label="Notice title"]',
            ),
          ),
        run: ({ editor, state }, event) => {
          const ctrl = findNodeViewControl(state, event, 'notice')
          if (!ctrl) return false
          return focusTextPosition(editor, ctrl.pos + 2)
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
