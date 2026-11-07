import type { Editor as TiptapEditor } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { defineHtmdExtension } from '../define-htmd-extension.js'
import type { MentionItem } from '../types.js'
import { isEditorInInsertMode } from './modal-editing.js'

// types ---------------------------------------------------------------------

export interface InternalMentionOptions {
  hrefBuilder?: (item: MentionItem) => string
  HTMLAttributes?: Record<string, unknown>
  suggestion?: Partial<Omit<SuggestionOptions<MentionItem>, 'editor'>>
}

// api -----------------------------------------------------------------------

/**
 * Inline `@mention` extension (`:mention[...]{id="..." type="post"}`) that
 * opens an autocomplete menu when typing `@` in insert mode:
 *
 * ```text
 * Related to @arch|
 *            +------------------------+
 *            | > Architecture Guide   |
 *            |   Editor Overview      |
 *            +------------------------+
 * ```
 */
export const InternalMention = defineHtmdExtension<InternalMentionOptions>({
  name: 'internalMention',
  kind: 'node',
  defaultOptions: () => ({
    hrefBuilder: undefined,
    HTMLAttributes: {
      class: 'internal-mention',
    },
    suggestion: {
      char: '@',
      allowSpaces: true,
      allow: ({ editor }: { editor: unknown }) => isEditorInInsertMode(editor as TiptapEditor),
      command: ({
        editor,
        range,
        props,
      }: {
        editor: unknown
        range: { from: number; to: number }
        props: MentionItem
      }) => {
        ;(editor as TiptapEditor)
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'internalMention',
              attrs: props,
            },
          ])
          .run()
      },
      items: () => [],
      render: () => ({}),
    },
  }),
})
