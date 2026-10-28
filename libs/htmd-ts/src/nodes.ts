import {
  Node,
  Extension,
  createAtomBlockMarkdownSpec,
  createBlockMarkdownSpec,
  createInlineMarkdownSpec,
  getExtensionField,
  decodeHtmlEntities,
  renderNestedMarkdownContent,
} from '@tiptap/core'
import type { AnyExtension, MarkdownToken, MarkdownParseHelpers } from '@tiptap/core'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { attributeDefaults, escape, parseAttributes, renderAttributes } from './syntax.js'
import type { JSONContent } from './types.js'

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
  ...createBlockMarkdownSpec({
    nodeName: 'notice',
    parseAttributes,
    defaultAttributes: { title: 'Note', variant: 'info' },
  }),
  parseMarkdown(token, h) {
    const content = h.parseChildren(token.tokens ?? [])
    return h.createNode(
      'notice',
      { title: 'Note', variant: 'info', ...token.attributes },
      content.length ? content : [{ type: 'paragraph' }],
    )
  },
  addAttributes: () => ({
    title: { default: 'Note' },
    variant: {
      default: 'info',
      validate: (value: unknown) => {
        if (!Object.hasOwn(noticeMarkers, String(value)))
          throw new Error('Unsupported notice variant.')
      },
    },
  }),
  renderMarkdown(node, h) {
    const body = h.renderChildren(node.content ?? [], '\n\n')
    return [
      `> [!${noticeMarkers[String(node.attrs?.variant)]}] ${node.attrs?.title ?? 'Note'}`,
      ...body.split('\n').map((line) => `> ${line}`),
    ].join('\n')
  },
})

export const InternalMention = atom(
  'internalMention',
  'mention',
  { id: null, label: null, type: 'post', seriesId: null },
  true,
)
export const UrlMention = atom(
  'urlMention',
  'url-mention',
  { url: null, title: null, favicon: null },
  true,
)
export const UnparsedBlock = Node.create({
  name: 'unparsedBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes: () => attributeDefaults({ kind: null, reason: null }),
  renderMarkdown: (node) => (node.content ?? []).map((child) => child.text ?? '').join(''),
})
export const UnparsedInline = UnparsedBlock.extend({
  name: 'unparsedInline',
  group: 'inline',
  inline: true,
  code: false,
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
