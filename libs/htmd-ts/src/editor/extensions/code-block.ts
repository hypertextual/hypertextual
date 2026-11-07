import type { Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
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
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export interface CodeBlockOptions {
  lowlight?: unknown
  defaultLanguage?: string | null
  nodeView?: HtmdNodeViewFactory
  HTMLAttributes?: Record<string, unknown>
  keymap?: Keymap<HtmdCommandContext>
}

const LANG_TRIGGER_SELECTOR =
  '[data-scope="select"][data-part="trigger"], [aria-label="Code language"][data-part="trigger"]'

// api -----------------------------------------------------------------------

/**
 * Interactive fenced code block extension with Lowlight syntax highlighting,
 * language selector, copy button, and insert-mode keyboard navigation:
 *
 * ```text
 * +------------------------------------------------------------+
 * | [typescript v]                              [Copy]         | <-- ArrowUp / Shift+Tab
 * +------------------------------------------------------------+
 * | const x = 42|                                              | <-- Tab / ArrowDown
 * +------------------------------------------------------------+
 * ```
 */
export const CodeBlock = defineHtmdExtension<CodeBlockOptions>({
  name: 'codeBlock',
  kind: 'node',
  defaultOptions: () => ({
    lowlight: undefined,
    defaultLanguage: 'javascript',
    nodeView: undefined,
    HTMLAttributes: {},
    keymap: undefined,
  }),
  navigation: () =>
    createContainerNodeNavigation({
      controls: [LANG_TRIGGER_SELECTOR],
      bodyOffset: 1,
      enterBelowMode: 'endPos',
      focusControl(editor, pos, _node, options) {
        const dom = editor.view?.nodeDOM(pos)
        if (dom instanceof HTMLElement && options?.control === 'language') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return true
          }
        }
        editor.commands.setTextSelection(pos + 1)
        editor.view?.focus()
        return true
      },
    }),
  keymap() {
    return {
      Tab: {
        id: 'codeBlock.indent',
        key: 'Tab',
        label: 'Insert Tab or Next Code Block Control',
        mode: 'insert',
        when: whenCodeBlockActiveOrControl,
        run: handleTab,
      },
      'Shift-Tab': {
        id: 'codeBlock.outdentOrFocusLanguage',
        key: 'Shift+Tab',
        label: 'Outdent or Focus Code Language',
        mode: 'insert',
        when: whenCodeBlockActiveOrControl,
        run: handleShiftTab,
      },
      ArrowUp: {
        id: 'codeBlock.arrowUpToLanguage',
        key: 'ArrowUp',
        label: 'Focus Code Language Selector or Above Code Block',
        mode: 'insert',
        when: whenCodeBlockArrowKey,
        run: handleArrowUp,
      },
      ArrowDown: {
        id: 'codeBlock.arrowDownToLanguageOrExit',
        key: 'ArrowDown',
        label: 'Enter Code Language Selector or Exit Code Block',
        mode: 'insert',
        when: whenCodeBlockArrowKey,
        run: handleArrowDown,
      },
    }
  },
})

// helpers -------------------------------------------------------------------

function focusLanguageSelectorAt(editor: TiptapEditor, pos: number): boolean {
  return focusBlockAtPos(editor, pos, 'down')
}

function focusLanguageSelector(editor: TiptapEditor): boolean {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock') {
    return focusLanguageSelectorAt(editor, selection.from)
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'codeBlock') {
      if (focusLanguageSelectorAt(editor, $from.before(depth))) {
        return true
      }
      break
    }
  }
  return false
}

function whenCodeBlockActiveOrControl(
  { editor, state }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  return Boolean(findNodeViewControl(state, event, 'codeBlock')) || editor.isActive('codeBlock')
}

function whenCodeBlockArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'codeBlock'))
  }
  return true
}

function handleTab({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'codeBlock')
  if (ctrl) {
    const trigger = ctrl.target.closest<HTMLElement>(LANG_TRIGGER_SELECTOR)
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return false
      const copyBtn = ctrl.wrapper.querySelector<HTMLElement>(
        'button[aria-label*="Copy"], button:not([data-scope="select"])',
      )
      if (copyBtn) {
        copyBtn.focus()
      } else {
        focusTextPosition(editor, ctrl.pos + 1)
      }
      return true
    }
    if (ctrl.target.closest('button')) {
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  if (editor.isActive('codeBlock')) {
    return editor.commands.insertContent('\t')
  }
  return false
}

function handleShiftTab({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'codeBlock')
  if (ctrl) {
    const trigger = ctrl.target.closest<HTMLElement>(LANG_TRIGGER_SELECTOR)
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return false
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    if (ctrl.target.closest('button')) {
      const langTrigger = ctrl.wrapper.querySelector<HTMLElement>(LANG_TRIGGER_SELECTOR)
      if (langTrigger) {
        langTrigger.focus()
        return true
      }
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  if (!editor.isActive('codeBlock')) return false
  const { selection } = state
  const { $from } = selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset)
  if (textBefore.endsWith('\t')) {
    return editor.commands.deleteRange({
      from: $from.pos - 1,
      to: $from.pos,
    })
  }
  return focusLanguageSelector(editor)
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'codeBlock')
  if (ctrl) {
    const trigger = ctrl.target.closest<HTMLElement>(LANG_TRIGGER_SELECTOR)
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return false
      return focusBeforeBlock(editor, ctrl.pos)
    }
    if (ctrl.target.closest('button')) {
      return focusBeforeBlock(editor, ctrl.pos)
    }
    return false
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock') {
    return focusLanguageSelectorAt(editor, selection.from)
  }
  if (editor.isActive('codeBlock')) {
    if (!selection.empty) return false
    const { $from } = selection
    const textBefore = $from.parent.textBetween(0, $from.parentOffset)
    if (!textBefore.includes('\n')) {
      return focusLanguageSelector(editor)
    }
    return false
  }
  if (isAtFirstVisualLine(view, state)) {
    const prevPos = findPrevBlockPos(state)
    if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'codeBlock') {
      return focusBlockAtPos(editor, prevPos, 'up')
    }
  }
  return false
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  const ctrl = findNodeViewControl(state, event, 'codeBlock')
  if (ctrl) {
    const trigger = ctrl.target.closest<HTMLElement>(LANG_TRIGGER_SELECTOR)
    if (trigger) {
      if (trigger.getAttribute('aria-expanded') === 'true') return false
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    if (ctrl.target.closest('button')) {
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock') {
    return focusLanguageSelectorAt(editor, selection.from)
  }
  if (editor.isActive('codeBlock')) {
    if (!isAtLastVisualLine(view, state)) return false
    const { $from } = selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === 'codeBlock') {
        return focusBlockAtPos(editor, $from.after(depth), 'down', true)
      }
    }
    return false
  }
  if (isAtLastVisualLine(view, state)) {
    const nextPos = findNextBlockPos(state)
    if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'codeBlock') {
      return focusLanguageSelectorAt(editor, nextPos)
    }
  }
  return false
}
