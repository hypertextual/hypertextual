// libs/helical-ui/src/editor/extensions/code-block-custom.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/code-block-custom.ts.
// Adaptation: the Svelte node-view renderer is configured with nodeView instead of imported,
// so the core stays framework-free. Configure `lowlight` and `nodeView` per editor.
import CodeBlockLowlight, {
  type CodeBlockLowlightOptions,
} from '@tiptap/extension-code-block-lowlight'
import { NodeSelection } from '@tiptap/pm/state'
import type { NodeViewOptions } from '../types'

export const CodeBlockCustom = CodeBlockLowlight.extend<CodeBlockLowlightOptions & NodeViewOptions>(
  {
    selectable: true,

    addOptions() {
      return {
        ...this.parent!(),
        defaultLanguage: 'javascript',
        nodeView: undefined,
      }
    },

    addNodeView() {
      return this.options.nodeView?.() ?? null
    },

    addKeyboardShortcuts() {
      const focusLanguageSelectorAt = (pos: number) => {
        const dom = this.editor.view.nodeDOM(pos)
        if (dom instanceof HTMLElement) {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return true
          }
        }
        return false
      }

      const focusLanguageSelector = () => {
        const { selection } = this.editor.state
        if (selection instanceof NodeSelection && selection.node.type.name === this.name) {
          return focusLanguageSelectorAt(selection.from)
        }
        const { $from } = selection
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === this.name) {
            if (focusLanguageSelectorAt($from.before(depth))) {
              return true
            }
            break
          }
        }
        return false
      }

      return {
        Tab: () => {
          if (this.editor.isActive('codeBlock')) {
            return this.editor.commands.insertContent('\t')
          }
          return false
        },
        'Shift-Tab': () => {
          if (this.editor.isActive('codeBlock')) {
            const { state } = this.editor
            const { selection } = state
            const { $from } = selection
            const textBefore = $from.parent.textBetween(0, $from.parentOffset)

            if (textBefore.endsWith('\t')) {
              return this.editor.commands.deleteRange({
                from: $from.pos - 1,
                to: $from.pos,
              })
            }
            return focusLanguageSelector()
          }
          return false
        },
        ArrowUp: () => {
          const { selection } = this.editor.state
          if (selection instanceof NodeSelection && selection.node.type.name === this.name) {
            return focusLanguageSelectorAt(selection.from)
          }
          if (this.editor.isActive('codeBlock')) {
            if (!selection.empty) return false
            const { $from } = selection
            const textBefore = $from.parent.textBetween(0, $from.parentOffset)
            if (!textBefore.includes('\n')) {
              return focusLanguageSelector()
            }
          }
          return false
        },
      }
    },
  },
)
