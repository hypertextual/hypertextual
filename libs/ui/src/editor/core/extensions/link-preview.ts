// libs/helical-ui/src/editor/extensions/link-preview.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/link-preview.ts.
// Adaptation: the node-view renderer is configured with nodeView. escapeHtml, the schema, and
// renderHTML — both the `bookmark` card and the 16:9 `embed` iframe — are carried over verbatim.
import { Node, mergeAttributes } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import type { LinkPreviewAttributes, NodeViewOptions } from '../types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkPreview: {
      insertLinkPreview: (attributes: LinkPreviewAttributes) => ReturnType
    }
  }
}

// Only http(s) may reach an iframe src or an anchor href. Anything else — `javascript:`,
// `data:`, … — is dropped, because the static Reader injects this markup via
// dangerouslySetInnerHTML / {@html}, where a hostile URL taken from document content would
// execute in-origin. Plain attribute values (title, image, alt) need no such guard: the DOM
// serializer sets them as attributes and escapes them.
function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

function safeEmbedUrl(value: unknown): string {
  const url = safeUrl(value)
  if (!url) return ''

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    let videoId: string | null | undefined

    if (host === 'youtu.be') {
      videoId = /^\/([^/]+)/.exec(parsed.pathname)?.[1]
    } else if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      videoId = parsed.searchParams.get('v') ?? /^\/embed\/([^/]+)/.exec(parsed.pathname)?.[1]
    }

    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : url
  } catch {
    return ''
  }
}

// Fallback bookmark glyph (the source editor's path), rendered as a real SVG node.
const LINK_ICON_PATH =
  'M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l-3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z'

export const LinkPreview = Node.create<NodeViewOptions>({
  addOptions() {
    return { nodeView: undefined }
  },

  name: 'linkPreview',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      image: { default: null },
      favicon: { default: null },
      provider: { default: null },
      type: { default: 'bookmark' }, // bookmark | embed
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="link-preview"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { url, title, description, image, favicon, type } = HTMLAttributes

    if (type === 'embed') {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-type': 'link-preview' }),
        [
          'div',
          { class: 'relative pb-[56.25%] h-0 overflow-hidden rounded-lg' },
          [
            'iframe',
            {
              src: safeEmbedUrl(url),
              title: title || '',
              frameborder: '0',
              allowfullscreen: '',
              class: 'absolute top-0 left-0 w-full h-full',
            },
          ],
        ],
      ]
    }

    // bookmark type — the link card, built as real nodes rather than an `innerHTML`
    // attribute: ProseMirror's serializer sets attributes verbatim and does not parse HTML,
    // so an `innerHTML` string serializes as a literal `innerhtml="…"` and the card body
    // renders empty in the static Reader.
    const hostname = url
      ? (() => {
          try {
            return new URL(url).hostname
          } catch {
            return url
          }
        })()
      : ''

    const faviconNode: DOMOutputSpec = favicon
      ? [
          'img',
          {
            src: favicon,
            alt: '',
            class: 'w-3.5 h-3.5 flex-shrink-0',
            onerror: "this.style.display='none'",
          },
        ]
      : [
          'svg',
          { class: 'w-3 h-3 flex-shrink-0', fill: 'currentColor', viewBox: '0 0 20 20' },
          ['path', { d: LINK_ICON_PATH }],
        ]

    const textBlock: DOMOutputSpec[] = [
      ['div', { class: 'text-base font-semibold mb-1 line-clamp-1' }, title || ''],
    ]
    if (description) {
      textBlock.push([
        'p',
        { class: 'text-xs text-muted-foreground mb-2 line-clamp-2 leading-snug' },
        description,
      ])
    }

    const cardChildren: DOMOutputSpec[] = [
      [
        'div',
        { class: 'flex-1 min-w-0 flex flex-col justify-between px-3 py-1.5' },
        ['div', {}, ...textBlock],
        [
          'div',
          { class: 'flex items-center gap-1.5 text-xs text-muted-foreground mt-auto' },
          faviconNode,
          ['span', { class: 'truncate opacity-80' }, hostname],
        ],
      ],
    ]
    if (image) {
      cardChildren.push([
        'div',
        { class: 'flex-shrink-0 w-44 aspect-video bg-muted' },
        [
          'img',
          {
            src: image,
            alt: title || '',
            class: 'w-full h-full object-cover',
            onerror: "this.parentElement.style.display='none'",
          },
        ],
      ])
    }

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'link-preview',
        class: 'link-preview my-4',
      }),
      [
        'a',
        {
          href: safeUrl(url),
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'flex transition-colors overflow-hidden bookmark-link',
          style: 'text-decoration: none !important; color: inherit;',
        },
        ...cardChildren,
      ],
    ]
  },

  addNodeView() {
    return this.options.nodeView?.() ?? null
  },

  addCommands() {
    return {
      insertLinkPreview:
        (attributes: LinkPreviewAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
