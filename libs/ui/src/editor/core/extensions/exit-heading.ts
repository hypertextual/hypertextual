// libs/helical-ui/src/editor/extensions/exit-heading.ts
// Verbatim lift from ~/Projects/readership/libs/editor/src/extensions/exit-heading.ts.
// Framework-free: imports only @tiptap/core.
// Enter inside a heading exits into a paragraph rather than creating another heading —
// on an empty heading it converts in place; at the end of a non-empty one it splits and
// makes the new block a paragraph.
// NOTE: the source used `setParagraph()`, whose type augmentation comes from
// @tiptap/extension-paragraph. Importing that here would be an undeclared dependency, so we
// use the core `setNode('paragraph')` it wraps instead. Behaviour is identical.
import { Extension } from '@tiptap/core'

export const ExitHeading = Extension.create({
  name: 'exitHeading',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from } = selection

        // Check if we're in a heading
        if ($from.parent.type.name === 'heading') {
          // If at the end of an empty heading, convert to paragraph
          if ($from.parent.textContent.length === 0) {
            return editor.chain().setNode('paragraph').run()
          }

          // If at the end of heading, create a new paragraph below
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

        return false // Let default Enter behavior handle it
      },
    }
  },
})
