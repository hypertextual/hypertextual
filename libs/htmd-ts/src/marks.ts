import { DOMParser } from '@xmldom/xmldom'
import { InvalidDocumentError } from './errors.js'
import { Mark, Extension, decodeHtmlEntities } from '@tiptap/core'
import type {
  AnyExtension,
  MarkdownToken,
  MarkdownParseHelpers,
  JSONContent,
  MarkdownRendererHelpers,
} from '@tiptap/core'
import { attributeDefaults, escape, rawNode } from './syntax.js'

const tags: Record<string, string> = {
  u: 'underline',
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  s: 'strike',
  del: 'strike',
  code: 'code',
  a: 'link',
  span: 'textStyle',
  mark: 'highlight',
}

/** CommonMark inline HTML preserves attributes and formatting on whitespace. */
export function htmlToken(src: string): MarkdownToken | undefined {
  if (src.startsWith('<!--')) {
    const end = src.indexOf('-->')
    return {
      type: 'htmdHtml',
      kind: 'html',
      raw: end < 0 ? src : src.slice(0, end + 3),
      invalid: 'Unsupported inline HTML.',
    }
  }
  const opening = /^<([a-z][\w-]*)(?:\s[^<>]*)?>/i.exec(src)
  if (!opening) {
    const closing = /^<\/[^>]+>/.exec(src)
    return closing
      ? {
          type: 'htmdHtml',
          kind: 'html',
          raw: closing[0],
          invalid: 'Unmatched inline HTML closing tag.',
        }
      : undefined
  }
  const tag = opening[1]!.toLowerCase()
  const pattern = new RegExp(String.raw`</?${tag}\b[^>]*>`, 'gi')
  pattern.lastIndex = opening[0].length
  let depth = 1
  let end = opening[0].length
  let bodyEnd = end
  for (let match; (match = pattern.exec(src));) {
    depth += match[0].startsWith('</') ? -1 : match[0].endsWith('/>') ? 0 : 1
    if (!depth) {
      bodyEnd = match.index
      end = pattern.lastIndex
      break
    }
  }
  return {
    type: 'htmdHtml',
    kind: 'html',
    raw: src.slice(0, end),
    tag,
    opening: opening[0],
    body: src.slice(opening[0].length, bodyEnd),
    ...(depth ? { invalid: 'Unclosed inline HTML formatting.' } : {}),
  }
}

export const HtmlSyntax = Extension.create({
  name: 'htmdHtml',
  markdownTokenizer: {
    name: 'htmdHtml',
    level: 'inline',
    start: (src) => src.indexOf('<'),
    tokenize: (src) => htmlToken(src),
  },
  parseMarkdown(token, h) {
    try {
      if (/^<p>\s*<\/p>\s*$/.test(token.raw ?? '')) return []
      if (token.invalid) throw new Error(String(token.invalid))
      const mark = tags[String(token.tag)]
      if (!mark) throw new Error('Unsupported inline HTML.')
      const document = new DOMParser({
        onError: () => {
          throw new Error('Invalid inline HTML.')
        },
      }).parseFromString(String(token.opening).replace(/>$/, '/>'), 'application/xml')
      const element = document.documentElement!
      const attrs: Record<string, unknown> = {}
      for (let i = 0; i < element.attributes.length; i++) {
        const a = element.attributes.item(i)!
        if (mark === 'link' && ['href', 'title', 'target', 'rel', 'class'].includes(a.name))
          attrs[a.name] = a.value
        else if ((mark === 'textStyle' || mark === 'highlight') && a.name === 'style') {
          const match = /^(?:color|background-color):\s*([^;]+);?$/.exec(a.value)
          if (!match) throw new Error('Unsupported color style.')
          attrs.color = match[1]
        } else throw new Error(`Unsupported ${a.name} HTML attribute.`)
      }
      const content =
        mark === 'code'
          ? [h.createTextNode(decodeHtmlEntities(String(token.body)))]
          : h.parseInline(h.tokenizeInline!(String(token.body)))
      return h.applyMark(mark, content, attrs)
    } catch (error) {
      return rawNode(token, true, error instanceof Error ? error.message : String(error))
    }
  },
})

export function renderLiteral(node: JSONContent): string {
  let source = escape(node.text)
  for (const mark of [...(node.marks ?? [])].reverse()) {
    const tag = Object.entries(tags).find(([, name]) => name === mark.type)?.[0]
    if (!tag) throw new InvalidDocumentError(`Unsupported ${mark.type} mark.`)
    const attrs =
      mark.type === 'link'
        ? Object.entries(mark.attrs ?? {})
            .filter(([, value]) => value != null)
            .map(([key, value]) => ` ${key}="${escape(value)}"`)
            .join('')
        : mark.type === 'textStyle' || mark.type === 'highlight'
          ? mark.attrs?.color
            ? ` style="${mark.type === 'highlight' ? 'background-color' : 'color'}:${escape(mark.attrs.color)}"`
            : ''
          : ''
    source = `<${tag}${attrs}>${source}</${tag}>`
  }
  return source
}
export const TextColor = Mark.create({
  name: 'textStyle',
  priority: 101,
  addAttributes: () => attributeDefaults({ color: null }),
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers) {
    return `<span${node.attrs?.color ? ` style="color:${escape(node.attrs.color)}"` : ''}>${h.renderChildren(node.content ?? [])}</span>`
  },
})
export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes: () => attributeDefaults({ color: null }),
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers) {
    return `<mark${node.attrs?.color ? ` style="background-color:${escape(node.attrs.color)}"` : ''}>${h.renderChildren(node.content ?? [])}</mark>`
  },
})
export const Underline = Mark.create({
  name: 'underline',
  renderMarkdown: (node, h) => `<u>${h.renderChildren(node.content ?? [])}</u>`,
})

export function adaptMarks(extensions: AnyExtension[]): AnyExtension[] {
  return extensions.map((extension) =>
    extension.name === 'link'
      ? extension.extend({
          addAttributes() {
            return {
              ...attributeDefaults({
                href: null,
                title: null,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'text-primary underline',
              }),
            }
          },
          parseMarkdown(token: MarkdownToken, h: MarkdownParseHelpers) {
            return h.applyMark('link', h.parseInline(token.tokens ?? []), {
              href: decodeHtmlEntities(token.href ?? ''),
              title: token.title == null ? null : decodeHtmlEntities(token.title),
            })
          },
          renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers) {
            const attrs = node.attrs ?? {}
            const plain =
              attrs.title !== '' &&
              attrs.target === '_blank' &&
              attrs.rel === 'noopener noreferrer' &&
              attrs.class === 'text-primary underline'
            const content = h.renderChildren(node.content ?? [])
            if (plain)
              return `[${content}](${escape(attrs.href ?? '')}${attrs.title != null ? ` "${escape(attrs.title)}"` : ''})`
            return `<a${Object.entries(attrs)
              .filter(([, v]) => v != null)
              .map(([k, v]) => ` ${k}="${escape(v)}"`)
              .join('')}>${content}</a>`
          },
        })
      : extension,
  )
}
export const customMarks = [TextColor, Highlight, Underline]
