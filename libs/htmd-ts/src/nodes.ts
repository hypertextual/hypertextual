import {
  Node,
  Extension,
  createAtomBlockMarkdownSpec,
  createInlineMarkdownSpec,
  getExtensionField,
  decodeHtmlEntities,
  renderNestedMarkdownContent,
} from '@tiptap/core'
import type { AnyExtension, MarkdownToken, MarkdownParseHelpers } from '@tiptap/core'
import { Heading } from '@tiptap/extension-heading'
import { Mention } from '@tiptap/extension-mention'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { attributeDefaults, escape, parseAttributes, renderAttributes } from './syntax.js'
import type { JSONContent } from './types.js'

/** Merge DOM attribute maps while deduplicating CSS classes and joining inline styles. */
export function mergeHtmlAttributes(
  ...objects: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const item of objects) {
    if (!item) continue
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || value === null) continue
      if (key === 'class' && typeof merged.class === 'string' && typeof value === 'string') {
        const classes = new Set(
          [...merged.class.split(/\s+/), ...value.split(/\s+/)].filter(Boolean),
        )
        merged.class = [...classes].join(' ')
      } else if (key === 'style' && typeof merged.style === 'string' && typeof value === 'string') {
        merged.style = `${merged.style.replace(/;?\s*$/, '')}; ${value}`
      } else {
        merged[key] = value
      }
    }
  }
  return merged
}

/** Return an HTTP(S) URL string or empty string when untrusted/invalid. */
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

/** Normalize YouTube watch/short/embed URLs into privacy-enhanced iframe embed URLs. */
export function safeEmbedUrl(value: unknown): string {
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

/** Use Tiptap's own syntax helpers for custom atomic elements. */
function atom(name: string, syntax: string, defaults: Record<string, unknown>, inline: boolean) {
  const spec = inline
    ? createInlineMarkdownSpec({
        nodeName: name,
        name: syntax,
        selfClosing: true,
        parseAttributes,
        serializeAttributes: renderAttributes,
        allowedAttributes: Object.keys(defaults),
      })
    : createAtomBlockMarkdownSpec({
        nodeName: name,
        name: syntax,
        parseAttributes,
        serializeAttributes: renderAttributes,
        defaultAttributes: defaults,
        allowedAttributes: Object.keys(defaults),
      })
  return Node.create({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    addAttributes: () => attributeDefaults(defaults),
    ...spec,
    parseMarkdown(token, h) {
      return h.createNode(name, token.attributes ?? {})
    },
  })
}

const previewDefaults = {
  url: null,
  title: null,
  description: null,
  image: null,
  favicon: null,
  provider: null,
  type: 'bookmark',
}
const youtubeSpec = createAtomBlockMarkdownSpec({
  nodeName: 'linkPreview',
  name: 'youtube',
  defaultAttributes: previewDefaults,
  parseAttributes,
  serializeAttributes: renderAttributes,
  allowedAttributes: Object.keys(previewDefaults).filter((key) => key !== 'type'),
})
const bookmark = atom('linkPreview', 'bookmark', previewDefaults, false)
export const LinkPreview = bookmark.extend({
  parseHTML() {
    return [{ tag: 'div[data-type="link-preview"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const { url, title, type } = HTMLAttributes as Record<string, string | null | undefined>

    if (type === 'embed') {
      return [
        'div',
        mergeHtmlAttributes(HTMLAttributes, { 'data-type': 'link-preview' }),
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

    return [
      'div',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-type': 'link-preview',
        class: 'link-preview my-4',
      }),
      [
        'a',
        {
          href: safeUrl(url),
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'bookmark-link',
        },
        title || url || '',
      ],
    ]
  },
  renderMarkdown(node, h) {
    return node.attrs?.type === 'embed'
      ? youtubeSpec.renderMarkdown(node)
      : getExtensionField(bookmark, 'renderMarkdown', {
          name: bookmark.name,
          options: bookmark.options,
          storage: bookmark.storage,
        })!(node, h, { index: 0, level: 0 })
  },
})
export const YouTubeSyntax = Extension.create({
  name: 'youtubeSyntax',
  markdownTokenizer: {
    ...youtubeSpec.markdownTokenizer,
    name: 'youtubeSyntax',
    tokenize(src, tokens, lexer) {
      const token = youtubeSpec.markdownTokenizer.tokenize(src, tokens, lexer)
      return token ? { ...token, type: 'youtubeSyntax' } : undefined
    },
  },
  parseMarkdown(token, h) {
    return h.createNode('linkPreview', { ...(token.attributes ?? {}), type: 'embed' })
  },
})

export const Image = Node.create({
  name: 'imageNode',
  group: 'block',
  atom: true,
  addAttributes: () => attributeDefaults({ src: null, srcset: null, alt: '', caption: '' }),
  parseHTML() {
    return [{ tag: 'figure[data-type="image-node"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const { src, srcset, alt, caption } = HTMLAttributes
    const imgAttrs = {
      src,
      srcset,
      alt: alt || '',
      sizes: '(max-width: 768px) 100vw, 720px',
      class: 'w-full object-cover',
    }
    if (!caption) {
      return ['figure', { 'data-type': 'image-node', class: 'my-6 m-0' }, ['img', imgAttrs]]
    }
    return [
      'figure',
      { 'data-type': 'image-node', class: 'my-6 m-0' },
      ['img', imgAttrs],
      ['figcaption', { class: 'mt-4 text-sm text-muted-foreground text-center italic' }, caption],
    ]
  },
  markdownTokenName: 'image',
  parseMarkdown: (token, h) =>
    h.createNode('imageNode', {
      src: decodeHtmlEntities(token.href ?? ''),
      alt: decodeHtmlEntities(token.text ?? ''),
      caption: decodeHtmlEntities(token.title ?? ''),
    }),
  renderMarkdown(node) {
    const quote = node.attrs?.caption ? ` "${escape(node.attrs.caption)}"` : ''
    const src = escape(node.attrs?.src ?? '')
    const destination = /[\s()]/.test(src) ? `<${src}>` : src
    return `![${escape(node.attrs?.alt ?? '').replace(/[[\\\]]/g, '\\$&')}](${destination}${quote})`
  },
})

const noticeMarkers: Record<string, string> = {
  info: 'NOTE',
  success: 'TIP',
  warning: 'WARNING',
  error: 'CAUTION',
}
export const Notice = Node.create({
  name: 'notice',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,
  addAttributes: () => ({
    title: {
      default: 'Note',
      parseHTML: (element: HTMLElement) =>
        element.querySelector('[data-notice-title]')?.textContent ?? 'Note',
    },
    variant: {
      default: 'info',
      validate: (value: unknown) => {
        if (!Object.hasOwn(noticeMarkers, String(value)))
          throw new Error('Unsupported notice variant.')
      },
    },
  }),
  parseHTML() {
    return [{ tag: 'aside[data-type="notice"]', contentElement: '[data-notice-body]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const {
      title = 'Note',
      variant: rawVariant = 'info',
      ...attributes
    } = HTMLAttributes as Record<string, unknown>
    return [
      'aside',
      mergeHtmlAttributes(attributes, {
        'data-type': 'notice',
        'data-variant': String(rawVariant),
        class: 'editor-notice my-4 rounded-lg border border-border bg-muted/40 p-4',
      }),
      ['div', { 'data-notice-title': '', class: 'font-semibold tracking-tight' }, String(title)],
      ['div', { 'data-notice-body': '' }, 0],
    ]
  },
  renderMarkdown(node, h) {
    const body = h.renderChildren(node.content ?? [], '\n\n')
    return [
      `> [!${noticeMarkers[String(node.attrs?.variant)]}] ${node.attrs?.title ?? 'Note'}`,
      ...body.split('\n').map((line) => `> ${line}`),
    ].join('\n')
  },
})

const internalMentionDefaults = { id: null, label: null, type: 'post', seriesId: null }
const internalMentionMarkdownSpec = createInlineMarkdownSpec({
  nodeName: 'internalMention',
  name: 'mention',
  selfClosing: true,
  parseAttributes,
  serializeAttributes: renderAttributes,
  allowedAttributes: Object.keys(internalMentionDefaults),
})
export const InternalMention = Mention.extend({
  name: 'internalMention',
  addOptions() {
    return {
      ...this.parent?.(),
      hrefBuilder: undefined as
        | ((item: { id: string; label: string; type: string; seriesId?: string | null }) => string)
        | undefined,
      HTMLAttributes: {
        class: 'internal-mention',
      },
    } as never
  },
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-id': attributes.id,
        }),
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-label': attributes.label,
        }),
      },
      type: {
        default: 'post',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-type'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-type': attributes.type,
        }),
      },
      seriesId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-series-id'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-series-id': attributes.seriesId,
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="internal-mention"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const { id, label, type, seriesId } = node.attrs as {
      id: string
      label: string
      type: string
      seriesId?: string | null
    }
    const hrefBuilder = (
      this.options as {
        hrefBuilder?: (item: {
          id: string
          label: string
          type: string
          seriesId?: string | null
        }) => string
      }
    )?.hrefBuilder
    const href = hrefBuilder
      ? hrefBuilder({ id, label, type, seriesId })
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
  ...internalMentionMarkdownSpec,
  parseMarkdown(token, h) {
    return h.createNode('internalMention', token.attributes ?? {})
  },
})

export const UrlMention = atom(
  'urlMention',
  'url-mention',
  { url: null, title: null, favicon: null },
  true,
).extend({
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
})

export const UnparsedBlock = Node.create({
  name: 'unparsedBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  selectable: true,
  addAttributes: () => ({
    kind: {
      default: null,
      rendered: false,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-source-kind'),
    },
    reason: {
      default: null,
      rendered: false,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-reason'),
    },
  }),
  parseHTML() {
    return [{ tag: 'pre[data-unparsed="block"]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-unparsed': 'block',
        'data-source-kind': node.attrs.kind,
        'data-reason': node.attrs.reason,
        'aria-label': 'Unparsed Markdown',
        title: `Unrecognized Markdown: ${node.attrs.reason ?? 'unsupported syntax'}`,
        class: 'rounded border border-border bg-muted/40 px-2 py-1 font-mono whitespace-pre-wrap',
      }),
      0,
    ]
  },
  renderMarkdown: (node) => (node.content ?? []).map((child) => child.text ?? '').join(''),
})

export const UnparsedInline = UnparsedBlock.extend({
  name: 'unparsedInline',
  group: 'inline',
  inline: true,
  code: false,
  parseHTML() {
    return [{ tag: 'span[data-unparsed="inline"]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-unparsed': 'inline',
        'data-source-kind': node.attrs.kind,
        'data-reason': node.attrs.reason,
        'aria-label': 'Unparsed Markdown',
        title: `Unrecognized Markdown: ${node.attrs.reason ?? 'unsupported syntax'}`,
        class: 'rounded border border-border bg-muted/40 px-2 py-1 font-mono whitespace-pre-wrap',
      }),
      0,
    ]
  },
})

export const HeadingNodeWithId = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level as number
    const id = node.textContent.toLowerCase().replace(/\s+/g, '-')
    return [
      `h${level}`,
      mergeHtmlAttributes(
        (this.options as { HTMLAttributes?: Record<string, unknown> })?.HTMLAttributes,
        HTMLAttributes,
        { id },
      ),
      0,
    ]
  },
})

/** Reuse standard Tiptap nodes; specialize only format policy and editor-specific shapes. */
export function adaptNodes(extensions: AnyExtension[]): AnyExtension[] {
  return extensions.map((extension) => {
    if (extension.name === 'paragraph')
      return extension.extend({
        parseMarkdown(token, h) {
          const content = h.parseInline(token.tokens ?? [])
          const blocks: JSONContent[] = []
          let inline: JSONContent[] = []
          for (const child of content) {
            if (['imageNode', 'linkPreview', 'unparsedBlock'].includes(String(child.type))) {
              if (inline.length) blocks.push({ type: 'paragraph', content: inline })
              blocks.push(child)
              inline = []
            } else inline.push(child)
          }
          if (inline.length || !blocks.length) blocks.push({ type: 'paragraph', content: inline })
          return blocks
        },
        renderMarkdown(node, h) {
          return node.content?.length ? h.renderChildren(node.content) : '<p></p>'
        },
      })
    if (extension.name === 'hardBreak') return extension.extend({ renderMarkdown: () => '\\\n' })
    if (extension.name === 'heading')
      return extension.extend({
        renderMarkdown(node, h) {
          return `${'#'.repeat(Number(node.attrs?.level ?? 1))}${node.content?.length ? ' ' + h.renderChildren(node.content) : ''}`
        },
      })
    if (extension.name === 'orderedList') {
      const native = getExtensionField(extension, 'parseMarkdown', {
        name: extension.name,
        options: extension.options,
        storage: extension.storage,
      })!
      return extension.extend({
        // Marked's CommonMark list tokenizer respects changes between `.` and `)`.
        // Tiptap's typed-list tokenizer joins them, losing separate editor list nodes.
        markdownTokenizer: {
          name: 'orderedList',
          level: 'block',
          start: () => -1,
          tokenize: () => undefined,
        },
        parseMarkdown(token: MarkdownToken, h: MarkdownParseHelpers) {
          // Tight Marked lists carry block-level text tokens. Route their inline children
          // through the paragraph parser so entities and marks receive normal decoding.
          const items = token.items?.map((item) => ({
            ...item,
            tokens: item.tokens?.map((child) =>
              child.type === 'text' && child.tokens ? { ...child, type: 'paragraph' } : child,
            ),
          }))
          const parsed = native({ ...token, items }, h)
          if (
            parsed &&
            !Array.isArray(parsed) &&
            'type' in parsed &&
            parsed.type === 'orderedList'
          ) {
            const start = /^\s*(\d+)[.)]/.exec(token.raw ?? '')?.[1]
            return {
              ...parsed,
              attrs: {
                ...parsed.attrs,
                start: start === undefined ? (token.start ?? 1) : Number(start),
              },
            }
          }
          return parsed
        },
      })
    }
    if (extension.name === 'listItem')
      return extension.extend({
        renderMarkdown(node, h, context) {
          return renderNestedMarkdownContent(
            node,
            h,
            (ctx) =>
              ctx.parentType === 'orderedList'
                ? `${Number(ctx.meta?.parentAttrs?.start ?? 1) + ctx.index}${ctx.meta?.parentAttrs?.htmdListMarker ?? '.'} `
                : `${ctx.meta?.parentAttrs?.htmdListMarker ?? '-'} `,
            context,
            { alignNestedToPrefix: context.parentType === 'orderedList' },
          )
        },
      })
    if (extension.name === 'codeBlock')
      return extension.configure({ defaultLanguage: 'javascript' }).extend({
        parseMarkdown(token, h) {
          const language = String(token.lang || 'javascript')
          if (/\s/.test(language) || ['htmd', 'chart', 'mermaid', 'manim'].includes(language))
            throw new Error('This code fence is reserved for a future format extension.')
          return h.createNode(
            'codeBlock',
            { language },
            token.text ? [h.createTextNode(token.text)] : [],
          )
        },
      })
    if (extension.name === 'blockquote') {
      const native = getExtensionField(extension, 'parseMarkdown', {
        options: extension.options,
        name: extension.name,
        storage: extension.storage,
      })!
      return extension.extend({
        parseMarkdown(token, h) {
          const first = token.tokens?.[0]
          const match =
            first?.type === 'paragraph' &&
            /^\[!(NOTE|TIP|WARNING|CAUTION)\](?:[ \t]+([^\n]*))?(?:\n|$)/.exec(first.text ?? '')
          if (!match) return native(token, h)
          const variant = Object.entries(noticeMarkers).find(
            ([, marker]) => marker === match[1],
          )![0]
          const body = String(first.text).slice(match[0].length)
          const tokens = [
            ...(body
              ? [{ type: 'paragraph', raw: body, text: body, tokens: h.tokenizeInline!(body) }]
              : []),
            ...(token.tokens?.slice(1) ?? []),
          ]
          return h.createNode(
            'notice',
            { variant, title: match[2] ?? 'Note' },
            h.parseBlockChildren!(tokens).length
              ? h.parseBlockChildren!(tokens)
              : [{ type: 'paragraph' }],
          )
        },
      })
    }
    return extension
  })
}

export const customNodes = [
  TaskList,
  TaskItem.configure({ nested: true }),
  Notice,
  Image,
  InternalMention,
  UrlMention,
  LinkPreview,
  UnparsedBlock,
  UnparsedInline,
  YouTubeSyntax,
]
