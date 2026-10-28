import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  parse,
  serialize,
  validateDocument,
  InvalidDocumentError,
  MarkdownSerializationError,
  type JSONContent,
} from './index.js'
import complete from '../fixtures/editor-roundtrip.json' with { type: 'json' }

// integration -----------------------------------------------------------------

describe('When opening and saving the complete format contract', () => {
  it('preserves every other node and attribute when the heading changes', () => {
    // Given
    const source = readFileSync(new URL('../fixtures/editor-roundtrip.md', import.meta.url), 'utf8')
    const edited: JSONContent = structuredClone(complete)
    edited.content![0]!.content![0]!.text = 'Roundtrip fixture updated'

    // When
    const saved = serialize(edited, { originalSource: source })

    // Then
    expect(saved).not.toBe(source)
    expect(saved).toContain('# Roundtrip fixture updated')
    expect(parse(saved).content).toEqual(edited)
  })

  it('covers every supported node and mark and preserves every attribute', () => {
    // Given
    const source = readFileSync(new URL('../fixtures/editor-roundtrip.md', import.meta.url), 'utf8')
    const nodeTypes = new Set<string>()
    const markTypes = new Set<string>()
    const inventory = (node: JSONContent) => {
      nodeTypes.add(node.type!)
      node.marks?.forEach((mark) => markTypes.add(mark.type))
      node.content?.forEach(inventory)
    }
    inventory(complete)
    // When
    const document = parse(source).content
    const saved = serialize(document)
    // Then
    expect([...nodeTypes].sort()).toEqual(
      [
        'doc',
        'paragraph',
        'text',
        'heading',
        'blockquote',
        'bulletList',
        'orderedList',
        'listItem',
        'taskList',
        'taskItem',
        'codeBlock',
        'hardBreak',
        'horizontalRule',
        'imageNode',
        'notice',
        'internalMention',
        'urlMention',
        'linkPreview',
        'unparsedBlock',
        'unparsedInline',
      ].sort(),
    )
    expect([...markTypes].sort()).toEqual(
      ['bold', 'italic', 'strike', 'underline', 'code', 'link', 'textStyle', 'highlight'].sort(),
    )
    expect(document).toEqual(complete)
    expect(parse(saved).content).toEqual(complete)
    expect(saved).not.toContain('data-editor-')
    expect(saved).not.toContain('data-hypertextual-block')
  })

  for (const source of [
    '',
    '# Original\n\nA paragraph.\n',
    '\uFEFF# Windows\r\n\r\nBody.\r\n',
    '- [x] Done\n- [ ] Pending\n',
    '> Quoted\n\n---\n',
  ]) {
    it(`keeps unchanged source bytes for ${JSON.stringify(source)}`, () => {
      // Given
      const document = parse(source).content
      // When
      const saved = serialize(document, { originalSource: source })
      // Then
      expect(saved).toBe(source)
    })
  }

  it('keeps BOM and Windows line endings after an edit', () => {
    // Given
    const source = '\uFEFF# Original\r\n'
    const document = parse(source).content
    document.content![0]!.content![0]!.text = 'Edited'
    // When
    const saved = serialize(document, { originalSource: source })
    // Then
    expect(saved).toBe('\uFEFF# Edited\r\n')
    expect(parse(saved).content).toEqual(document)
  })

  it('preserves repeated empty blocks and headings during intermediate editing', () => {
    // Given
    const document: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 } },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 } },
        { type: 'paragraph' },
        { type: 'blockquote', content: [{ type: 'paragraph' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        },
      ],
    }
    // When
    const saved = serialize(document)
    // Then
    expect(parse(saved).content).toEqual(validateDocument(document))
  })
})

describe('When input cannot be represented by the supported format', () => {
  for (const source of [
    '---\ntitle: Metadata\n---\nBody',
    '<div>Keep HTML</div>',
    '| A | B |\n|---|---|\n|1|2|',
    ':::chart\n{"series":[1,2]}\n:::',
    '```chart\n{}\n```',
    '[ref]: https://example.com\n\n[Link][ref]',
    ':underline[text]{future="value"}',
    '::image[unexpected body]{src="photo.png"}',
    ':::align{value="diagonal"}\nBody\n:::',
  ]) {
    it(`keeps unsupported source ${JSON.stringify(source)} editable and recoverable`, () => {
      // Given
      const document = parse(source).content
      // When
      const saved = serialize(document)
      // Then
      expect(parse(saved).content).toEqual(document)
      expect(serialize(document, { originalSource: source })).toBe(source)
    })
  }
  for (const document of [
    { type: 'doc', content: [{ type: 'futureBlock' }] },
    { type: 'doc', content: [{ type: 'paragraph', attrs: { future: 'value' } }] },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Draft', marks: [{ type: 'futureMark' }] }],
        },
      ],
    },
  ]) {
    it(`rejects unsupported document data ${JSON.stringify(document)}`, () => {
      // Given / When / Then
      expect(() => serialize(document)).toThrow(InvalidDocumentError)
    })
  }
})

describe('When callers inspect recoverable parsing issues', () => {
  it('returns issues for only the affected fragments and leaves supported content intact', () => {
    // Given
    const source = '# Known\n\nBefore :future[raw] after.\n\nKnown **bold** <u>unclosed'
    // When
    const result = parse(source)
    const saved = serialize(result.content)
    // Then
    expect(result.issues).toEqual([
      {
        code: 'unsupported-syntax',
        kind: 'textDirective',
        message: 'Unsupported future directive.',
        source: ':future[raw]',
      },
      {
        code: 'invalid-syntax',
        kind: 'html',
        message: 'Unclosed inline HTML formatting.',
        source: '<u>',
      },
    ])
    expect(result.content.content![0]).toEqual({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Known' }],
    })
    expect(result.content.content![1]!.content![0]).toEqual({ type: 'text', text: 'Before ' })
    expect(parse(saved)).toEqual(result)
  })
  it('keeps nested unsupported containers in one raw block', () => {
    // Given
    const source = ':::outer\nBefore\n\n:::inner\nInside\n:::\n\nAfter\n:::'
    // When
    const result = parse(source)
    // Then
    expect(result.content.content).toEqual([
      {
        type: 'unparsedBlock',
        attrs: { kind: 'containerDirective', reason: 'Unsupported outer directive.' },
        content: [{ type: 'text', text: source }],
      },
    ])
    expect(result.issues).toEqual([
      {
        code: 'unsupported-syntax',
        kind: 'containerDirective',
        message: 'Unsupported outer directive.',
        source,
      },
    ])
    expect(parse(serialize(result.content))).toEqual(result)
  })
  it('retains unreferenced definitions while another block is edited', () => {
    // Given
    const source = '# Known\n\n[unused]: https://example.com "Keep metadata"\n\nBody'
    const result = parse(source)
    // When
    result.content.content![0]!.content![0]!.text = 'Edited'
    const saved = serialize(result.content)
    // Then
    expect(result.issues).toEqual([
      {
        code: 'unsupported-syntax',
        kind: 'definition',
        message: 'Unsupported Markdown definition.',
        source: '[unused]: https://example.com "Keep metadata"',
      },
    ])
    expect(saved).toContain('[unused]: https://example.com "Keep metadata"')
    expect(parse(saved)).toEqual(result)
  })
})

describe('When valid editor JSON cannot be written without loss', () => {
  it('returns a purpose-specific write error instead of dropping a missing link destination', () => {
    // Given
    const document: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: null } }] },
          ],
        },
      ],
    }
    // When / Then
    expect(() => serialize(document)).toThrow(MarkdownSerializationError)
  })
})

describe('When unsupported inline HTML is a comment or custom tag', () => {
  for (const fragment of [
    '<!-- Keep private notes -->',
    '<!-- Unclosed comment',
    '<custom-widget>Raw</custom-widget>',
  ]) {
    it(`retains ${JSON.stringify(fragment)} as a source-aware wrapper`, () => {
      // Given
      const source = 'Before ' + fragment
      // When
      const result = parse(source)
      // Then
      expect(result.content.content![0]!.content![1]!.type).toBe('unparsedInline')
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]!.source).toBe(fragment)
      expect(parse(serialize(result.content))).toEqual(result)
    })
  }
})

describe('When writing intermediate plain text during typing', () => {
  for (const [text, source] of [
    ['#', '&#35;\n'],
    ['##', '&#35;#\n'],
    [' ', '&#32;\n'],
    [' Leading', '&#32;Leading\n'],
    ['Trailing ', 'Trailing&#32;\n'],
    ['1. Literal', '&#49;. Literal\n'],
    ['---', '&#45;--\n'],
    ['Line\n---', 'Line&#10;---\n'],
    ['> Literal', '&gt; Literal\n'],
  ] as const) {
    it(`preserves ${JSON.stringify(text)} before any editor shortcut completes`, () => {
      // Given
      const expected = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      }
      // When
      const saved = serialize(expected)
      // Then
      expect(saved).toBe(source)
      expect(parse(saved)).toEqual({ content: expected, issues: [] })
    })
  }
  it('preserves a trailing space while typing inside a list item', () => {
    // Given
    const expected = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Widget ' }] }],
            },
          ],
        },
      ],
    }
    // When
    const saved = serialize(expected)
    // Then
    expect(saved).toBe('- Widget&#32;\n')
    expect(parse(saved)).toEqual({ content: expected, issues: [] })
  })
})
