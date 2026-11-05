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

const LINK_ICON_PATH =
  'M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l-3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z'

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
    return [{ tag: 'span[data-type="url-mention"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const { url, title, favicon } = HTMLAttributes
    const displayTitle = title || url || ''

    return [
      'a',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-type': 'url-mention',
        href: safeUrl(url),
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'url-mention-pill',
        style: 'text-decoration: none !important; color: inherit;',
      }),
      favicon
        ? [
            'img',
            {
              src: favicon,
              alt: '',
              class: 'inline-block w-3.5 h-3.5 flex-shrink-0',
              onerror: "this.style.display='none'",
            },
          ]
        : [
            'svg',
            {
              class: 'inline-block w-3.5 h-3.5 flex-shrink-0',
              fill: 'currentColor',
              viewBox: '0 0 20 20',
            },
            ['path', { d: LINK_ICON_PATH }],
          ],
      ['span', {}, displayTitle],
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
