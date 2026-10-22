import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Blockquote from '@tiptap/extension-blockquote'
import { ListItem, OrderedList } from '@tiptap/extension-list'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Node, decodeHtmlEntities, encodeHtmlEntities, type JSONContent } from '@tiptap/core'

// Markdown trims literal boundary whitespace. Numeric character references preserve it as
// text, without introducing raw HTML or changing the editor's content during typing.
function preserveBoundaryWhitespace(text: string): string {
  return text.replace(/^[ \t]+|[ \t]+$/g, (whitespace) =>
    Array.from(whitespace, (character) => (character === ' ' ? '&#32;' : '&#9;')).join(''),
  )
}

const ArticleHeading = Heading.extend({
  renderMarkdown(node, helpers) {
    const level = node.attrs?.level ?? 1
    // The upstream renderer drops headings whose empty content array is omitted in JSON.
    return (
      '#'.repeat(level) +
      ' ' +
      preserveBoundaryWhitespace(helpers.renderChildren(node.content ?? []))
    )
  },
})

const ArticleParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    if (!node.content?.length) return this.parent?.(node, helpers, context) ?? ''
    return preserveBoundaryWhitespace(helpers.renderChildren(node.content))
  },
})

// An empty quote parses without children upstream, but the editor requires a paragraph.
const ArticleBlockquote = Blockquote.extend({
  parseMarkdown(token, helpers) {
    const children =
      helpers.parseBlockChildren?.(token.tokens ?? []) ?? helpers.parseChildren(token.tokens ?? [])
    return helpers.createNode(
      'blockquote',
      undefined,
      children.length ? children : [{ type: 'paragraph' }],
    )
  },
})

const ArticleListItem = ListItem.extend({
  renderMarkdown(node, helpers, context) {
    const rendered = this.parent?.(node, helpers, context) ?? ''
    // A space after a bare bullet makes the upstream lexer treat it as paragraph text.
    return node.content?.length === 1 &&
      node.content[0]?.type === 'paragraph' &&
      !node.content[0].content?.length
      ? rendered.trimEnd()
      : rendered
  },
})

const ArticleOrderedList = OrderedList.extend({
  parseMarkdown(token, helpers) {
    const parsed = this.parent?.(token, helpers)
    if (parsed && !Array.isArray(parsed) && 'type' in parsed && parsed.type === 'orderedList') {
      const list = parsed as JSONContent
      list.content = list.content?.map((item) =>
        item.content?.length ? item : { ...item, content: [{ type: 'paragraph' }] },
      )
    }
    return parsed ?? []
  },
})

const noticeVariants: Record<string, string> = {
  NOTE: 'info',
  TIP: 'success',
  WARNING: 'warning',
  CAUTION: 'error',
}
const noticeMarkers: Record<string, string> = {
  info: 'NOTE',
  success: 'TIP',
  warning: 'WARNING',
  error: 'CAUTION',
}

const ArticleNotice = Node.create({
  name: 'notice',
  group: 'block',
  content: 'block+',
  addAttributes() {
    return { variant: { default: 'info' }, title: { default: 'Note' } }
  },
  markdownTokenizer: {
    name: 'notice',
    level: 'block',
    start: (source) => source.search(/^> \[!(?:NOTE|TIP|WARNING|CAUTION)\]/m),
    tokenize(source, _tokens, lexer) {
      const header = /^> \[!(NOTE|TIP|WARNING|CAUTION)\](?: ([^\n]*))?(?:\n|$)/.exec(source)
      if (!header) return
      const quoted = /^(?:>[^\n]*(?:\n|$))+/.exec(source)![0]
      const body = quoted.slice(header[0].length).replace(/^> ?/gm, '')
      return {
        type: 'notice',
        raw: quoted,
        variant: noticeVariants[header[1]!],
        title: decodeHtmlEntities(header[2] ?? 'Note'),
        tokens: lexer.blockTokens(body),
      }
    },
  },
  parseMarkdown(token, helpers) {
    const children =
      helpers.parseBlockChildren?.(token.tokens ?? []) ?? helpers.parseChildren(token.tokens ?? [])
    return helpers.createNode(
      'notice',
      { variant: token.variant, title: token.title },
      children.length ? children : [{ type: 'paragraph' }],
    )
  },
  renderMarkdown(node, helpers) {
    const marker = noticeMarkers[node.attrs?.variant ?? 'info']
    if (!marker) throw new Error('Unsupported notice variant.')
    const title = preserveBoundaryWhitespace(
      encodeHtmlEntities(node.attrs?.title ?? 'Note')
        .replace(/\r/g, '&#13;')
        .replace(/\n/g, '&#10;'),
    )
    const body = helpers.renderChildren(node.content ?? [{ type: 'paragraph' }], '\n\n')
    return (
      `> [!${marker}] ${title}\n` +
      body
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    )
  },
})

const ArticleImage = Node.create({
  name: 'imageNode',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      srcset: { default: null },
      alt: { default: '' },
      caption: { default: '' },
    }
  },
  markdownTokenName: 'image',
  parseMarkdown(token, helpers) {
    return helpers.createNode('imageNode', {
      src: token.href || null,
      alt: token.text ?? '',
      caption: token.title ?? '',
    })
  },
  renderMarkdown(node) {
    const src = String(node.attrs?.src ?? '')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/\s/g, (c) => encodeURIComponent(c))
    const alt = String(node.attrs?.alt ?? '').replace(/[\\[\]]/g, '\\$&')
    const caption = String(node.attrs?.caption ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '&#10;')
    return `![${alt}](${src ? `<${src}>` : ''}${caption ? ` "${caption}"` : ''})`
  },
})

const markdown = new MarkdownManager({
  extensions: [
    StarterKit.configure({
      heading: false,
      paragraph: false,
      blockquote: false,
      listItem: false,
      orderedList: false,
    }),
    ArticleHeading,
    ArticleParagraph,
    ArticleBlockquote,
    ArticleListItem,
    ArticleOrderedList,
    TaskList,
    TaskItem,
    ArticleNotice,
    ArticleImage,
  ],
})

export interface Article {
  source: string
  content: string
  editable: boolean
  reason?: string
}

const nodes = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'horizontalRule',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'notice',
  'imageNode',
])
const marks = new Set(['bold', 'italic', 'strike', 'code', 'link'])
const tokenTypes = new Set([
  'space',
  'code',
  'heading',
  'hr',
  'blockquote',
  'list',
  'list_item',
  'paragraph',
  'text',
  'escape',
  'strong',
  'em',
  'codespan',
  'br',
  'del',
  'link',
  'taskList',
  'taskItem',
  'notice',
  'image',
])

/** Ignore only attributes that Helical adds by default and Markdown cannot express. */
export function articleIdentity(value: JSONContent): string {
  function clean(node: JSONContent): JSONContent {
    if (!node.type || !nodes.has(node.type))
      throw new Error(
        `The ${node.type ?? 'unknown'} block cannot be saved as Markdown yet. Remove it or copy your draft before leaving.`,
      )
    const attrs: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(node.attrs ?? {})) {
      if (
        v === null ||
        v === undefined ||
        (key === 'textAlign' && v === 'left') ||
        (node.type === 'orderedList' && key === 'start' && v === 1)
      )
        continue
      if (node.type === 'imageNode' && ['src', 'alt', 'caption'].includes(key) && !v) continue
      if (
        (node.type === 'imageNode' && ['src', 'alt', 'caption'].includes(key)) ||
        (node.type === 'heading' && key === 'level') ||
        (node.type === 'orderedList' && key === 'start') ||
        (node.type === 'taskItem' && key === 'checked') ||
        (node.type === 'codeBlock' && key === 'language') ||
        (node.type === 'notice' && ['variant', 'title'].includes(key))
      )
        attrs[key] = v
      else
        throw new Error(
          `The ${key} formatting cannot be saved as Markdown yet. Your draft is retained.`,
        )
    }
    const normalizedMarks = node.marks
      ?.map((mark) => {
        if (!marks.has(mark.type))
          throw new Error(
            `The ${mark.type} formatting cannot be saved as Markdown yet. Remove it or copy your draft before leaving.`,
          )
        if (mark.type !== 'link') return { type: mark.type }
        const extras = Object.entries(mark.attrs ?? {}).filter(
          ([key, v]) => !['href', 'title', 'target', 'rel', 'class'].includes(key) && v != null,
        )
        if (extras.length)
          throw new Error('This link contains unsupported formatting. Your draft is retained.')
        return {
          type: 'link',
          attrs: {
            href: mark.attrs?.href,
            ...(mark.attrs?.title ? { title: mark.attrs.title } : {}),
          },
        }
      })
      .sort((a, b) => a.type.localeCompare(b.type))
    return {
      type: node.type,
      ...(Object.keys(attrs).length ? { attrs } : {}),
      ...(node.text !== undefined ? { text: node.text } : {}),
      ...(normalizedMarks?.length ? { marks: normalizedMarks } : {}),
      ...(node.content?.length ? { content: node.content.map(clean) } : {}),
    }
  }
  return JSON.stringify(clean(value))
}

function unsupportedToken(tokens: unknown[]): boolean {
  return tokens.some((value) => {
    const token = value as { type?: string; tokens?: unknown[]; items?: unknown[] }
    return (
      !token.type ||
      !tokenTypes.has(token.type) ||
      (token.tokens ? unsupportedToken(token.tokens) : false) ||
      (token.items ? unsupportedToken(token.items) : false)
    )
  })
}

export function decodeArticle(source: string): Article {
  const plain = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const reason =
    'This article contains syntax that the editor cannot preserve yet. The original source is shown read-only.'
  // HTMD rich-block syntax has no established codec in this repository. Preserve it verbatim.
  if (
    /^---\n/.test(plain) ||
    /^\s*:{3,}/m.test(plain) ||
    /^\s*```(?:htmd|chart|mermaid|manim)\b/m.test(plain) ||
    /^\s*\[[^\]]+\]:/m.test(plain)
  ) {
    return { source, content: '', editable: false, reason }
  }
  try {
    const tokens = markdown.instance.lexer(plain)
    if (unsupportedToken(tokens)) return { source, content: '', editable: false, reason }
    const parsed = markdown.parse(plain)
    if (!parsed.content?.length) parsed.content = [{ type: 'paragraph' }]
    const identity = articleIdentity(parsed)
    if (articleIdentity(markdown.parse(markdown.serialize(parsed))) !== identity && plain.trim()) {
      return { source, content: '', editable: false, reason }
    }
    return { source, content: JSON.stringify(parsed), editable: true }
  } catch {
    return { source, content: '', editable: false, reason }
  }
}

export function encodeArticle(article: Article, content: string): string {
  if (!article.editable) throw new Error(article.reason ?? 'This article is read-only.')
  const parsed = JSON.parse(content) as JSONContent
  const identity = articleIdentity(parsed)
  if (identity === articleIdentity(JSON.parse(article.content) as JSONContent))
    return article.source
  // Reject unsupported blocks/marks before serializing: MarkdownManager's fallback may drop them.
  const serialized = markdown.serialize(parsed)
  const roundtrip = markdown.parse(serialized)
  if (!roundtrip.content?.length) roundtrip.content = [{ type: 'paragraph' }]
  if (articleIdentity(roundtrip) !== identity) {
    throw new Error(
      'This edit cannot be preserved as Markdown. Your draft is retained; undo the unsupported change or copy your draft.',
    )
  }
  const lineEnding = article.source.includes('\r\n') ? '\r\n' : '\n'
  const trailing = /\r?\n$/.test(article.source) ? '\n' : ''
  const bom = article.source.startsWith('\uFEFF') ? '\uFEFF' : ''
  return bom + (serialized + trailing).replace(/\n/g, lineEnding)
}
