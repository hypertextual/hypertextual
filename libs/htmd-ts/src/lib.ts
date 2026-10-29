import StarterKit from '@tiptap/starter-kit'
import { flattenExtensions, getExtensionField, getSchema } from '@tiptap/core'
import type { AnyExtension, JSONContent as EngineJSON, MarkdownParseResult } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { Marked, Tokenizer, type marked } from 'marked'
import { adaptNodes, customNodes } from './nodes.js'
import { adaptMarks, customMarks, HtmlSyntax, renderLiteral } from './marks.js'
import {
  UnknownBlock,
  UnknownInline,
  UnsupportedTable,
  HtmlBlock,
  EmptyParagraph,
  LiteralSpan,
  ReferenceDefinition,
  rawNode,
} from './syntax.js'
import { InvalidDocumentError, MarkdownParseError, MarkdownSerializationError } from './errors.js'
import type { JSONContent, ParseIssue, ParseResult } from './types.js'

const standard = flattenExtensions([
  StarterKit.configure({ underline: false, trailingNode: false }),
]).filter((e) => e.type !== 'extension')
const definitions = [...adaptMarks(adaptNodes(standard)), ...customNodes, ...customMarks]
const schema = getSchema(definitions)

function validateAttributes(
  attrs: Record<string, unknown> | undefined,
  specs: Record<string, { default?: unknown }> = {},
): void {
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (!Object.hasOwn(specs, name))
      throw new InvalidDocumentError(`Unsupported ${name} attribute.`)
    const expected = specs[name]!.default
    if (
      expected == null
        ? value != null && typeof value !== 'string'
        : typeof value !== typeof expected
    )
      throw new InvalidDocumentError(`Invalid ${name} attribute value.`)
  }
}
function portableNode(node: JSONContent): JSONContent {
  const attrs = node.attrs ? { ...node.attrs } : undefined
  if (node.type === 'linkPreview' && attrs?.type === 'embed') attrs.title = null
  if (node.type === 'imageNode' && attrs) {
    attrs.srcset = null
    attrs.alt ??= ''
    attrs.caption ??= ''
  }
  if (node.type === 'orderedList' && attrs) attrs.type = null
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(portableNode) } : {}),
  }
}
function checkNode(node: JSONContent): void {
  const type = node.type && schema.nodes[node.type]
  if (!type) throw new InvalidDocumentError(`Unsupported ${node.type ?? 'unknown'} node.`)
  validateAttributes(node.attrs, type.spec.attrs)
  if (
    node.type === 'heading' &&
    (!Number.isInteger(node.attrs?.level ?? 1) ||
      Number(node.attrs?.level ?? 1) < 1 ||
      Number(node.attrs?.level ?? 1) > 6)
  )
    throw new InvalidDocumentError('Heading level must be between 1 and 6.')
  for (const mark of node.marks ?? []) {
    const type = schema.marks[mark.type]
    if (!type) throw new InvalidDocumentError(`Unsupported ${mark.type} mark.`)
    validateAttributes(mark.attrs, type.spec.attrs)
  }
  node.content?.forEach(checkNode)
}
/** Validate the persisted JSON contract, apply schema defaults, and remove display-only image/list attributes. */
export function validateDocument(document: JSONContent): JSONContent {
  try {
    if (document.type !== 'doc') throw new InvalidDocumentError('A document root is required.')
    const value = portableNode(document)
    checkNode(value)
    const parsed = schema.nodeFromJSON(value)
    parsed.check()
    return parsed.toJSON()
  } catch (error) {
    throw error instanceof InvalidDocumentError
      ? error
      : new InvalidDocumentError(
          error instanceof Error ? error.message : 'Invalid document structure.',
        )
  }
}

/** Guard extension hooks so an invalid token only replaces its own source fragment. */
function recoverable(extension: AnyExtension): AnyExtension {
  const handler = getExtensionField(extension, 'parseMarkdown', {
    name: extension.name,
    options: extension.options,
    storage: extension.storage,
  })
  if (!handler) return extension
  return extension.extend({
    parseMarkdown(token, helpers) {
      try {
        const result = handler(token, helpers)
        const marked = result && !Array.isArray(result) && 'mark' in result ? result : null
        const values = marked
          ? marked.content.map((child: EngineJSON) => ({
              ...child,
              marks: [...(child.marks ?? []), { type: marked.mark, attrs: marked.attrs }],
            }))
          : Array.isArray(result)
            ? result
            : result
              ? [result]
              : []
        for (const value of values) {
          checkNode(value as JSONContent)
          schema.nodeFromJSON(value).check()
        }
        return result
      } catch (error) {
        const inline =
          extension.type === 'mark' ||
          Boolean(schema.nodes[extension.name]?.isInline) ||
          extension.name === 'htmdHtml'
        return rawNode(
          token,
          inline,
          error instanceof Error ? error.message : String(error),
        ) as MarkdownParseResult
      }
    },
  })
}
// Preserve definitions as document fragments while letting Marked resolve their links.
const definitionTokenizer = new Tokenizer()
const markedParser = new Marked().setOptions({ tokenizer: definitionTokenizer }).use({
  extensions: [
    {
      name: 'htmdDefinition',
      level: 'block',
      tokenizer(source) {
        const definition = definitionTokenizer.def(source)
        if (!definition) return undefined
        this.lexer.tokens.links[definition.tag] = { href: definition.href, title: definition.title }
        return { ...definition, type: 'htmdDefinition' }
      },
    },
  ],
})
// Isolated Marked instance avoids registering custom tokenizers in other consumers.
const engine = new MarkdownManager({
  marked: markedParser as unknown as typeof marked,
  extensions: [
    ReferenceDefinition,
    UnknownBlock,
    UnknownInline,
    UnsupportedTable,
    HtmlBlock,
    EmptyParagraph,
    HtmlSyntax,
    ...definitions,
  ].map(recoverable),
})
engine.registerExtension(LiteralSpan)

function collectIssues(node: JSONContent): ParseIssue[] {
  const own: ParseIssue[] =
    node.type === 'unparsedBlock' || node.type === 'unparsedInline'
      ? [
          {
            code: String(node.attrs?.reason).startsWith('Unsupported')
              ? 'unsupported-syntax'
              : 'invalid-syntax',
            kind: String(node.attrs?.kind),
            message: String(node.attrs?.reason),
            source: (node.content ?? []).map((child) => child.text ?? '').join(''),
          },
        ]
      : []
  return [...own, ...(node.content ?? []).flatMap(collectIssues)]
}
/** Convert opaque Markdown contents to native document JSON and recoverable source issues. */
export function parse(source: string): ParseResult {
  try {
    const plain = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const parsed = engine.parse(plain)
    const content = validateDocument(
      parsed.content?.length ? parsed : { type: 'doc', content: [{ type: 'paragraph' }] },
    )
    return { content, issues: collectIssues(content) }
  } catch (error) {
    throw new MarkdownParseError(
      error instanceof Error ? error.message : 'Markdown could not be read.',
    )
  }
}

function repairRaw(node: JSONContent): JSONContent[] {
  if (node.type === 'unparsedBlock' || node.type === 'unparsedInline') {
    const source = (node.content ?? []).map((child) => child.text ?? '').join('')
    if (node.type === 'unparsedBlock') return parse(source).content.content ?? []
    const parsed = parse('x ' + source).content.content
    if (parsed?.length !== 1 || parsed[0]?.type !== 'paragraph')
      throw new MarkdownSerializationError('Inline source must remain in one paragraph.')
    const content = parsed[0].content ?? []
    const first = content[0]
    if (first?.type !== 'text' || !first.text?.startsWith('x '))
      throw new MarkdownSerializationError('Inline source changed its surrounding paragraph.')
    first.text = first.text.slice(2)
    if (!first.text) content.shift()
    return content.map((child) => ({
      ...child,
      ...(node.marks?.length ? { marks: [...node.marks, ...(child.marks ?? [])] } : {}),
    }))
  }
  return [{ ...node, ...(node.content ? { content: node.content.flatMap(repairRaw) } : {}) }]
}
/** Preserve boundary whitespace, marked whitespace, and unfinished block prefixes while typing. */
function protectWhitespace(node: JSONContent, parent?: JSONContent): EngineJSON {
  if (
    node.type === 'text' &&
    !node.marks?.length &&
    parent?.type !== 'codeBlock' &&
    parent?.type !== 'unparsedBlock' &&
    parent?.type !== 'unparsedInline'
  ) {
    const escaped = engine.renderNodeToMarkdown(node, parent)
    const encode = (value: string) => Array.from(value, (c) => `&#${c.codePointAt(0)};`).join('')
    const first = parent?.content?.[0] === node
    const last = parent?.content?.at(-1) === node
    let source = escaped.replace(/[\r\n]/g, encode)
    if (first) source = source.replace(/^\s+/, encode)
    if (last) source = source.replace(/\s+$/, encode)
    if (first && parent?.type === 'paragraph')
      source = source.replace(/^(?=[#>+=-]|\d+[.)](?:\s|$))./, encode)
    if (source !== escaped) return { type: 'htmdLiteral', attrs: { source } }
  }
  if (
    node.type === 'text' &&
    node.marks?.length &&
    (/^\s|\s$|[\r\n]/.test(node.text ?? '') ||
      node.marks.some((m) => m.type === 'code' && /[ `]/.test(node.text ?? '')))
  )
    return { type: 'htmdLiteral', attrs: { source: renderLiteral(node) } }
  // CommonMark separates neighboring lists by marker style, not by extra blank lines.
  let marker: string | undefined
  if (node.type === 'orderedList' || node.type === 'bulletList') {
    const siblings = parent?.content ?? []
    let previous = siblings.indexOf(node) - 1
    let adjacent = 0
    while (previous >= 0 && siblings[previous--]?.type === node.type) adjacent++
    marker = node.type === 'orderedList' ? (adjacent % 2 ? ')' : '.') : adjacent % 2 ? '*' : '-'
  }
  return {
    ...node,
    ...(marker ? { attrs: { ...node.attrs, htmdListMarker: marker } } : {}),
    ...(node.content
      ? { content: node.content.map((child) => protectWhitespace(child, node)) }
      : {}),
  }
}
/** Convert native JSON to Markdown only when reopening preserves all persisted content and attributes. */
export function serialize(
  document: JSONContent,
  options: { originalSource?: string } = {},
): string {
  const value = validateDocument(repairRaw(validateDocument(document))[0]!)
  const identity = JSON.stringify(value)
  const original = options.originalSource
  if (original !== undefined && JSON.stringify(parse(original).content) === identity)
    return original
  let source: string
  try {
    source = engine.serialize(protectWhitespace(value)).replace(/\n*$/, '\n')
  } catch (error) {
    throw new MarkdownSerializationError(
      error instanceof Error ? error.message : 'Markdown rendering failed.',
    )
  }
  if (JSON.stringify(parse(source).content) !== identity)
    throw new MarkdownSerializationError('This document cannot be preserved as Markdown.')
  if (original !== undefined) {
    source = source.replace(/\n$/, '') + (/\r?\n$/.test(original) ? '\n' : '')
    if (original.includes('\r\n')) source = source.replace(/\n/g, '\r\n')
    if (original.startsWith('\uFEFF')) source = '\uFEFF' + source
  }
  return source
}
