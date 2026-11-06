import { NodeSelection } from '@tiptap/pm/state'
import {
  defineHtmdExtension,
  findNextBlockPos,
  findPrevBlockPos,
  focusBlockAtPos,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  type HtmdInternalEditor,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

export interface CodeBlockCustomOptions {
  lowlight?: unknown
  defaultLanguage?: string | null
  nodeView?: HtmdNodeViewFactory
  HTMLAttributes?: Record<string, unknown>
}

function focusLanguageSelectorAt(editor: HtmdInternalEditor, pos: number): boolean {
  return focusBlockAtPos(editor, pos, 'down')
}

function focusLanguageSelector(editor: HtmdInternalEditor): boolean {
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

export const CodeBlockCustom = defineHtmdExtension<CodeBlockCustomOptions>({
  name: 'codeBlock',
  kind: 'node',
  base: 'codeBlockLowlight',
  selectable: true,
  defaultOptions: () => ({
    lowlight: undefined,
    defaultLanguage: 'javascript',
    nodeView: undefined,
    HTMLAttributes: {},
  }),
  keymap() {
    return {
      Tab: {
        id: 'codeBlock.indent',
        key: 'Tab',
        label: 'Insert Tab in Code Block',
        mode: 'insert',
        when: ({ editor }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return editor.isActive('codeBlock')
        },
        run: ({ editor }) => {
          if (editor.isActive('codeBlock')) {
            return editor.commands.insertContent('\t')
          }
          return false
        },
      },
      'Shift-Tab': {
        id: 'codeBlock.outdentOrFocusLanguage',
        key: 'Shift+Tab',
        label: 'Outdent or Focus Code Language',
        mode: 'insert',
        when: ({ editor }, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return editor.isActive('codeBlock')
        },
        run: ({ editor, state }) => {
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
        },
      },
      ArrowUp: {
        id: 'codeBlock.arrowUpToLanguage',
        key: 'ArrowUp',
        label: 'Focus Code Language Selector',
        mode: 'insert',
        when: (_, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return true
        },
        run: ({ editor, state, view }) => {
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
        },
      },
      ArrowDown: {
        id: 'codeBlock.arrowDownToLanguageOrExit',
        key: 'ArrowDown',
        label: 'Enter Code Language Selector or Exit Code Block',
        mode: 'insert',
        when: (_, event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[contenteditable="false"]')
          ) {
            return false
          }
          return true
        },
        run: ({ editor, state, view }) => {
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
        },
      },
    }
  },
})
