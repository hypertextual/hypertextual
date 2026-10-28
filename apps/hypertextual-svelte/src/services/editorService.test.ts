import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parse, serialize, type JSONContent, type ParseIssue } from 'htmd-ts'
import { EditorService } from './editorService.svelte'

// integration -----------------------------------------------------------------

describe('When checking format and editor compatibility', () => {
  it('accepts the complete format fixture without dropping editor data', () => {
    // Given
    const source = readFileSync(
      new URL('../../../../libs/htmd-ts/fixtures/editor-roundtrip.md', import.meta.url),
      'utf8',
    )
    const expected = JSON.parse(
      readFileSync(
        new URL('../../../../libs/htmd-ts/fixtures/editor-roundtrip.json', import.meta.url),
        'utf8',
      ),
    )

    // When
    const parsed = parse(source).content
    const mounted = EditorService.validateDocument(parsed)

    // Then
    expect(parsed).toEqual(expected)
    expect(mounted).toEqual(expected)
  })

  it('writes editor-native JSON and reopens its formatting and attributes without issues', () => {
    // Given
    const expected: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Editor content' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ordinary ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' ' },
            {
              type: 'text',
              text: 'highlight',
              marks: [{ type: 'highlight', attrs: { color: '#ef4444' } }],
            },
          ],
        },
        {
          type: 'imageNode',
          attrs: { src: '.images/photo.png', srcset: null, alt: 'Photo', caption: 'Caption' },
        },
      ],
    }

    // When
    const mounted = EditorService.validateDocument(expected)
    const source = serialize(mounted)
    const reopened = parse(source)

    // Then
    expect(mounted).toEqual(expected)
    expect(reopened.content).toEqual(expected)
    expect(reopened.issues).toEqual([])
  })

  it('accepts raw-source wrappers without dropping source text or diagnostics', () => {
    // Given
    const source = '# Article\n\n:::chart\n{"series":[1,2]}\n:::'
    const expected: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Article' }] },
        {
          type: 'unparsedBlock',
          attrs: { kind: 'containerDirective', reason: 'Unsupported chart directive.' },
          content: [{ type: 'text', text: ':::chart\n{"series":[1,2]}\n:::' }],
        },
      ],
    }
    const expectedIssues: ParseIssue[] = [
      {
        code: 'unsupported-syntax',
        kind: 'containerDirective',
        message: 'Unsupported chart directive.',
        source: ':::chart\n{"series":[1,2]}\n:::',
      },
    ]

    // When
    const parsed = parse(source)
    const mounted = EditorService.validateDocument(parsed.content)
    const reopened = parse(serialize(mounted))

    // Then
    expect(parsed).toEqual({ content: expected, issues: expectedIssues })
    expect(mounted).toEqual(expected)
    expect(reopened).toEqual({ content: expected, issues: expectedIssues })
  })
})
