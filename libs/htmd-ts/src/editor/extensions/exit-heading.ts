import { defineHtmdExtension } from '../define-htmd-extension.js'

/**
 * Enter inside a heading exits into a paragraph rather than creating another heading —
 * on an empty heading it converts in place; at the end of a non-empty one it splits and
 * makes the new block a paragraph.
 */
export const ExitHeading = defineHtmdExtension({
  name: 'exitHeading',
  kind: 'behavior',
  keymap() {
    return {
      Enter: {
        id: 'exitHeading.enter',
        key: 'Enter',
        label: 'Exit Heading',
        mode: 'insert',
        run: ({ editor, state }) => {
          const { selection } = state
          const { $from } = selection

          if ($from.parent.type.name === 'heading') {
            if ($from.parent.textContent.length === 0) {
              return editor.chain().setNode('paragraph').run()
            }

            if (selection.empty && $from.parentOffset === $from.parent.textContent.length) {
              return editor
                .chain()
                .command(({ tr }) => {
                  tr.split(selection.from)
                  return true
                })
                .setNode('paragraph')
                .run()
            }
          }

          return false
        },
      },
    }
  },
})
