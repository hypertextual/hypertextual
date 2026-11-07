import { defineHtmdExtension, mergeHtmlAttributes } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory, UrlMentionAttributes } from '../types.js'

export interface UrlMentionOptions {
  nodeView?: HtmdNodeViewFactory
}

function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

export const UrlMention = defineHtmdExtension<
  UrlMentionOptions,
  Record<string, never>,
  {
    insertUrlMention: (
      attributes: UrlMentionAttributes,
    ) => (ctx: { commands: { insertContent: (value: unknown) => boolean } }) => boolean
  }
>({
  name: 'urlMention',
  kind: 'node',
  group: 'inline',
  inline: true,
  atom: true,
  defaultOptions: () => ({ nodeView: undefined }),
  attributes: {
    url: { default: null },
    title: { default: null },
    favicon: { default: null },
  },
  parseHTML() {
    return [{ tag: 'span[data-type="url-mention"]' }, { tag: 'a[data-type="url-mention"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const { url, title } = HTMLAttributes
    const displayTitle = title || url || ''

    return [
      'a',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-type': 'url-mention',
        href: safeUrl(url),
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'url-mention-pill',
      }),
      displayTitle,
    ]
  },
  commands: () => ({
    insertUrlMention:
      (attributes: UrlMentionAttributes) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'urlMention',
          attrs: attributes,
        }),
  }),
})
