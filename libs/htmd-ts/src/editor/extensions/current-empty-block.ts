import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { defineHtmdExtension } from '../define-htmd-extension.js'

// types ---------------------------------------------------------------------

const currentEmptyBlockKey = new PluginKey('currentEmptyBlock')

// api -----------------------------------------------------------------------

/**
 * Decorates the currently focused empty text block with `.is-current-empty` so
 * CSS can show or hide persistent placeholders based on cursor presence:
 *
 * ```text
 * # Untitled               (non-focused empty H1 -> shows "Untitled")
 *
 * |                        (cursor in empty paragraph -> class="is-current-empty",
 *                           shows "Type '/' for commands")
 * ```
 */
export const CurrentEmptyBlock = defineHtmdExtension({
  name: 'currentEmptyBlock',
  kind: 'behavior',
  pmPlugins() {
    return [createCurrentEmptyBlockPlugin()]
  },
})

// pm ------------------------------------------------------------------------

function createCurrentEmptyBlockPlugin(): Plugin {
  return new Plugin({
    key: currentEmptyBlockKey,
    props: {
      decorations(state) {
        const { selection } = state
        const { $from } = selection
        if (!selection.empty || $from.depth === 0 || $from.parent.content.size > 0) return null

        return DecorationSet.create(state.doc, [
          Decoration.node($from.before($from.depth), $from.after($from.depth), {
            class: 'is-current-empty',
          }),
        ])
      },
    },
  })
}
