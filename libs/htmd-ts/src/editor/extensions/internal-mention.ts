import type { SuggestionOptions } from '@tiptap/suggestion'
import { defineHtmdExtension, type HtmdInternalEditor } from '../define-htmd-extension.js'
import type { MentionItem } from '../types.js'
import { isEditorInInsertMode } from './modal-keymap.js'

export interface InternalMentionOptions {
  hrefBuilder?: (item: MentionItem) => string
  HTMLAttributes?: Record<string, unknown>
  suggestion?: Partial<Omit<SuggestionOptions<MentionItem>, 'editor'>>
}

export const InternalMention = defineHtmdExtension<InternalMentionOptions>({
  name: 'internalMention',
  kind: 'node',
  base: 'mention',
  defaultOptions: () => ({
    hrefBuilder: undefined,
    HTMLAttributes: {
      class: 'internal-mention',
    },
    suggestion: {
      char: '@',
      allowSpaces: true,
      allow: ({ editor }: { editor: unknown }) =>
        isEditorInInsertMode(editor as HtmdInternalEditor),
      command: ({
        editor,
        range,
        props,
      }: {
        editor: unknown
        range: { from: number; to: number }
        props: MentionItem
      }) => {
        ;(editor as HtmdInternalEditor)
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
  parseHTML() {
    return [{ tag: 'span[data-type="internal-mention"]' }]
  },
  renderHTML({ node, HTMLAttributes, options }) {
    const { id, label, type, seriesId } = node.attrs as {
      id: string
      label: string
      type: string
      seriesId?: string | null
    }

    const href = options.hrefBuilder
      ? options.hrefBuilder({ id, label, type, seriesId })
      : type === 'post' && seriesId
        ? `/read/${seriesId}?post=${id}`
        : `/read/${id}`

    return [
      'a',
      {
        ...HTMLAttributes,
        class: 'internal-mention',
        'data-type': 'internal-mention',
        'data-id': id,
        'data-label': label,
        'data-mention-type': type,
        'data-series-id': seriesId,
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      label,
    ]
  },
  attributes: {
    id: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-id'),
      renderHTML: (attributes) => ({
        'data-id': attributes.id,
      }),
    },
    label: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-label'),
      renderHTML: (attributes) => ({
        'data-label': attributes.label,
      }),
    },
    type: {
      default: 'post',
      parseHTML: (element) => element.getAttribute('data-type'),
      renderHTML: (attributes) => ({
        'data-type': attributes.type,
      }),
    },
    seriesId: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-series-id'),
      renderHTML: (attributes) => ({
        'data-series-id': attributes.seriesId,
      }),
    },
  },
})
