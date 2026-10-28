// libs/helical-ui/src/editor/extensions/current-empty-block.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const currentEmptyBlockKey = new PluginKey('currentEmptyBlock')

/** Marks the empty text block that owns the cursor so persistent placeholders can hide there. */
export const CurrentEmptyBlock = Extension.create({
  name: 'currentEmptyBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
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
      }),
    ]
  },
})
