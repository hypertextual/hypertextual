import type { Keymap } from 'core-ts'
import type { EditorState } from '@tiptap/pm/state'
import {
  createContainerNodeNavigation,
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusBeforeBlock,
  focusBlockAtPos,
  focusTextPosition,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory, NoticeAttributes, NoticeVariant } from '../types.js'

export type { NoticeAttributes, NoticeVariant }

// types ---------------------------------------------------------------------

export interface NoticeNodeOptions {
  nodeView?: HtmdNodeViewFactory
  keymap?: Keymap<HtmdCommandContext>
}

// api -----------------------------------------------------------------------

/**
 * Callout notice container extension (`> [!NOTE] Title`) with an editable
 * header title input, variant selector (`info`, `success`, `warning`, `error`),
 * and nested rich block body:
 *
 * ```text
 * +------------------------------------------------------------+
 * | (i) [Notice title...           ]          [Info v]         | <-- Tab / ArrowUp
 * |     Body paragraph inside notice...                        | <-- Enter / ArrowDown
 * +------------------------------------------------------------+
 * ```
 */
export const NoticeNode = defineHtmdExtension<
  NoticeNodeOptions,
  Record<string, never>,
  {
    insertNotice: (attributes?: NoticeAttributes) => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'notice',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined, keymap: undefined }),
  navigation: () =>
    createContainerNodeNavigation({
      controls: [
        'input[aria-label="Notice title"]',
        '[aria-label="Notice type"][data-part="trigger"]',
      ],
      bodyOffset: 2,
      enterBelowMode: 'findFrom',
      focusControl(editor, pos, _node, options) {
        const dom = editor.view?.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) return false
        if (options?.control === 'type') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Notice type"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return true
          }
        }
        const input = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
        if (!input) return false
        input.focus()
        const caret =
          typeof options?.offset === 'number'
            ? Math.max(0, Math.min(input.value.length, options.offset))
            : input.value.length
        input.setSelectionRange(caret, caret)
        return true
      },
    }),
  keymap() {
    return {
      Tab: {
        id: 'notice.focusTitle',
        key: 'Tab',
        label: 'Focus Notice Title or Next Notice Control',
        mode: 'insert',
        when: whenNoticeActiveOrControl,
        run: handleTab,
      },
      'Shift-Tab': {
        id: 'notice.focusType',
        key: 'Shift+Tab',
        label: 'Focus Notice Type or Previous Notice Control',
        mode: 'insert',
        when: whenNoticeActiveOrControl,
        run: handleShiftTab,
      },
      ArrowUp: {
        id: 'notice.arrowUpToTitle',
        key: 'ArrowUp',
        label: 'Move to Notice Title or Above Notice',
        mode: 'insert',
        when: whenNoticeArrowKey,
        run: handleArrowUp,
      },
      ArrowDown: {
        id: 'notice.arrowDownToTitleOrExit',
        key: 'ArrowDown',
        label: 'Move to Notice Body or Exit Notice',
        mode: 'insert',
        when: whenNoticeArrowKey,
        run: handleArrowDown,
      },
      Enter: {
        id: 'notice.focusBodyEnter',
        key: 'Enter',
        label: 'Focus Notice Body',
        mode: 'insert',
        when: whenNoticeTitleEnter,
        run: handleEnter,
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

// helpers -------------------------------------------------------------------

function findNoticeDepth(state: EditorState): number {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'notice') {
      return depth
    }
  }
  return -1
}

function whenNoticeActiveOrControl({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(findNodeViewControl(state, event, 'notice')) || findNoticeDepth(state) > 0
}

function whenNoticeArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'notice'))
  }
  return true
}

function whenNoticeTitleEnter({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(
    findNodeViewControl(state, event, 'notice')?.target.matches('input[aria-label="Notice title"]'),
  )
}

function handleTab({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
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
}

function handleShiftTab(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
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
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
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
    const titleInput = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
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
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
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
}

function handleEnter({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'notice')
  if (!ctrl) return false
  return focusTextPosition(editor, ctrl.pos + 2)
}
