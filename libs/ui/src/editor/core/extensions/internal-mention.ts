// libs/helical-ui/src/editor/extensions/internal-mention.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/internal-mention.ts.
// Adaptations — this is where the two app-specific behaviours became seams:
//   - suggestion.items: the hardcoded `/api/search/internal` fetch -> injected `mentionSource`
//   - renderHTML href: the hardcoded `/read/...` path           -> injected `hrefBuilder`
//   - the suggestion `render` (which mounted the Svelte list)   -> injected, per framework
// The schema/attribute wiring and the insert command are carried over verbatim.
import { Mention, type MentionOptions } from '@tiptap/extension-mention'
import type { EditorSeams, MentionItem } from '../types'

interface InternalMentionOptions extends MentionOptions<MentionItem> {
  hrefBuilder?: EditorSeams['hrefBuilder']
}

export const InternalMention = Mention.extend<InternalMentionOptions>({
  addOptions() {
    return { ...this.parent!(), hrefBuilder: undefined }
  },

  name: 'internalMention',

  parseHTML() {
    return [
      {
        tag: 'span[data-type="internal-mention"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { id, label, type, seriesId } = node.attrs

    // Injected seam; the fallback preserves the source editor's original path shape when the
    // consumer supplies no hrefBuilder.
    const href = this.options.hrefBuilder
      ? this.options.hrefBuilder({ id, label, type, seriesId })
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

  addAttributes() {
    return {
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
    }
  },
}).configure({
  HTMLAttributes: {
    class: 'internal-mention',
  },
  suggestion: {
    char: '@',
    allowSpaces: true,
    command: ({ editor, range, props }) => {
      // Insert mention without trailing space
      editor
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
})
