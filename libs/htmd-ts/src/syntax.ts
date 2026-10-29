import {
  Extension,
  decodeHtmlEntities,
  createBlockMarkdownSpec,
  parseAttributes as parseNativeAttributes,
} from '@tiptap/core'
import type { MarkdownToken, MarkdownTokenizer } from '@tiptap/core'
import type { JSONContent } from './types.js'

export function escape(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"\r\n\t]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\r': '&#13;',
        '\n': '&#10;',
        '\t': '&#9;',
      })[c]!,
  )
}

export function attributeDefaults(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { default: value }]),
  )
}

export function rawNode(token: MarkdownToken, inline: boolean, reason: string): JSONContent {
  const source = String(token.raw ?? token.text ?? '').replace(/\n+$/, '')
  return {
    type: inline ? 'unparsedInline' : 'unparsedBlock',
    attrs: { kind: String(token.kind ?? token.type), reason },
    ...(source ? { content: [{ type: 'text', text: source }] } : {}),
  }
}

export function parseAttributes(source: string) {
  return Object.fromEntries(
    Object.entries(parseNativeAttributes(source)).map(([key, value]) => [
      key,
      typeof value === 'string' ? decodeHtmlEntities(value) : value,
    ]),
  )
}
export function renderAttributes(attrs: Record<string, unknown>) {
  return Object.entries(attrs)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}="${escape(value).replace(/\]/g, '&#93;')}"`)
    .join(' ')
}

/** Catch unsupported syntax before Marked's permissive fallback discards its structure. */
export const UnknownInline = Extension.create({
  name: 'htmdUnknownInline',
  markdownTokenizer: {
    name: 'htmdUnknownInline',
    level: 'inline',
    start: (src) => src.search(/:[a-z][\w-]*(?=\[|\{)/i),
    tokenize(src) {
      const match = /^:([a-z][\w-]*)(?:\[[\s\S]*?\])?(?:\{[^}]*\})?/i.exec(src)
      return match
        ? { type: 'htmdUnknownInline', kind: 'textDirective', name: match[1], raw: match[0] }
        : undefined
    },
  },
  parseMarkdown(token) {
    return rawNode(token, true, `Unsupported ${token.name} directive.`)
  },
})

const blockTokenizer: MarkdownTokenizer = {
  name: 'htmdUnknownBlock',
  level: 'block',
  start: (src) => src.search(/^(?::::|::[a-z]|---\n[\w-]+:|\+\+\+\n)/m),
  tokenize(src, tokens, lexer) {
    const frontmatter = /^(---|\+\+\+)\n[\s\S]*?\n\1(?:\n|$)/.exec(src)
    if (frontmatter)
      return {
        type: 'htmdUnknownBlock',
        kind: frontmatter[1] === '---' ? 'yaml' : 'toml',
        raw: frontmatter[0],
      }
    const container = /^:::([\w-]+)(?:\s|$)/.exec(src)
    if (container) {
      const spec = createBlockMarkdownSpec({ nodeName: 'htmdUnknownBlock', name: container[1] })
      const token = spec.markdownTokenizer.tokenize(src, tokens, lexer)
      if (token)
        return {
          ...token,
          type: 'htmdUnknownBlock',
          kind: 'containerDirective',
          name: container[1],
        }
    }
    const block = /^:::([\w-]+)[^\n]*\n[\s\S]*?^:::[ \t]*(?:\n|$)/m.exec(src)
    if (block?.index === 0)
      return { type: 'htmdUnknownBlock', kind: 'containerDirective', name: block[1], raw: block[0] }
    const leaf = /^::([\w-]+)[^\n]*(?:\n|$)/.exec(src)
    return leaf
      ? { type: 'htmdUnknownBlock', kind: 'leafDirective', name: leaf[1], raw: leaf[0] }
      : undefined
  },
}
export const UnknownBlock = Extension.create({
  name: 'htmdUnknownBlock',
  markdownTokenizer: blockTokenizer,
  parseMarkdown(token) {
    return rawNode(
      token,
      false,
      token.name ? `Unsupported ${token.name} directive.` : `Unsupported Markdown ${token.kind}.`,
    )
  },
})
export const UnsupportedTable = Extension.create({
  name: 'htmdTable',
  markdownTokenName: 'table',
  parseMarkdown: (token) => rawNode(token, false, 'Unsupported Markdown table.'),
})
export const HtmlBlock = Extension.create({
  name: 'htmdBlockHtml',
  markdownTokenName: 'html',
  parseMarkdown(token) {
    return /^<p>\s*<\/p>\s*$/.test(token.raw ?? '')
      ? { type: 'paragraph' }
      : rawNode({ ...token, kind: 'html' }, false, 'Unsupported Markdown html.')
  },
})

/** Read the empty paragraph directive written by earlier editor versions. */
export const EmptyParagraph = Extension.create({
  name: 'htmdEmptyParagraph',
  markdownTokenizer: {
    name: 'htmdEmptyParagraph',
    level: 'block',
    start: (src) => src.search(/^::paragraph[ \t]*(?:\n|$)/m),
    tokenize(src) {
      const match = /^::paragraph[ \t]*(?:\n|$)/.exec(src)
      return match ? { type: 'htmdEmptyParagraph', raw: match[0] } : undefined
    },
  },
  parseMarkdown: () => ({ type: 'paragraph' }),
})

/** Internal render-only node avoids Tiptap moving whitespace out of marks. */
export const LiteralSpan = Extension.create({
  name: 'htmdLiteral',
  renderMarkdown: (node) => String(node.attrs?.source ?? ''),
})

export const ReferenceDefinition = Extension.create({
  name: 'htmdDefinition',
  parseMarkdown: (token) =>
    rawNode({ ...token, kind: 'definition' }, false, 'Unsupported Markdown definition.'),
})
