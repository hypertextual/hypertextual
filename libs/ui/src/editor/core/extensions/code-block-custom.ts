// libs/helical-ui/src/editor/extensions/code-block-custom.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/code-block-custom.ts.
// Adaptation: the Svelte node-view renderer is configured with nodeView instead of imported,
// so the core stays framework-free. Configure `lowlight` and `nodeView` per editor.
import CodeBlockLowlight, {
  type CodeBlockLowlightOptions,
} from '@tiptap/extension-code-block-lowlight'
import type { NodeViewOptions } from '../types'

export const CodeBlockCustom = CodeBlockLowlight.extend<CodeBlockLowlightOptions & NodeViewOptions>(
  {
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
      return {
        Tab: () => {
          if (this.editor.isActive('codeBlock')) {
            return this.editor.commands.insertContent('\t')
          }
          return false
        },
        'Shift-Tab': () => {
          if (this.editor.isActive('codeBlock')) {
            // Remove indent if at start of line
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
          }
          return false
        },
      }
    },
  },
)
