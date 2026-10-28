// libs/helical-ui/src/editor/extensions/url-mention.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/url-mention.ts.
// Adaptation: the node-view renderer is configured with nodeView. escapeHtml, the schema,
// and renderHTML (including the favicon/fallback-SVG pill markup) are carried over verbatim.
import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewOptions, UrlMentionAttributes } from '../types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    urlMention: {
      insertUrlMention: (attributes: UrlMentionAttributes) => ReturnType
    }
  }
}

// Only http(s) may reach an anchor href or an iframe src. Anything else — `javascript:`,
// `data:`, … — is dropped, because the static Reader injects this markup via
// dangerouslySetInnerHTML / {@html}, where a hostile URL taken from document content would
// execute in-origin. Plain attribute values (title, favicon, alt) need no such guard: the
// DOM serializer sets them as attributes and escapes them.
function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

// Fallback link glyph (the source editor's path), rendered as a real SVG node.
const LINK_ICON_PATH =
  'M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l-3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z'

export const UrlMention = Node.create<NodeViewOptions>({
  addOptions() {
    return { nodeView: undefined }
  },

  name: 'urlMention',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      favicon: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="url-mention"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { url, title, favicon } = HTMLAttributes
    const displayTitle = title || url || ''

    // Children as real nodes, not an `innerHTML` attribute: ProseMirror's serializer sets
    // attributes verbatim and does not parse HTML, so an `innerHTML` string would land in
    // the output as a literal `innerhtml="…"` attribute and the pill would render empty.
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
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

  addNodeView() {
    return this.options.nodeView?.() ?? null
  },

  addCommands() {
    return {
      insertUrlMention:
        (attributes: UrlMentionAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
