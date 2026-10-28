import { describe, expect, it } from 'bun:test'
import { parse, serialize, validateDocument, type JSONContent } from './index.js'

// integration -----------------------------------------------------------------

describe('When handling color', () => {
  describe('When parsing the color and highlight mark family', () => {
    it('preserves both colors on the same exact text', () => {
      // Given
      const source =
        '<span style="color:#ef4444"><mark style="background-color:yellow"> colored text </mark></span>'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: ' colored text ',
                marks: [
                  { type: 'textStyle', attrs: { color: '#ef4444' } },
                  { type: 'highlight', attrs: { color: 'yellow' } },
                ],
              },
            ],
          },
        ],
      }

      // When
      const document = parse(source).content
      const saved = serialize(document)

      // Then
      expect(document).toEqual(expected)
      expect(parse(saved).content).toEqual(expected)
      expect(saved).toContain('<span')
      expect(saved).toContain('<mark')
    })

    it('keeps a default highlight distinct from unmarked text', () => {
      // Given
      const source = '<mark>Highlighted</mark> ordinary'

      // When
      const document = parse(source).content

      // Then
      expect(document.content?.[0]?.content).toEqual([
        {
          type: 'text',
          marks: [{ type: 'highlight', attrs: { color: null } }],
          text: 'Highlighted',
        },
        { type: 'text', text: ' ordinary' },
      ])
      expect(parse(serialize(document)).content).toEqual(document)
    })

    it('keeps unknown color attributes in an unparsed inline wrapper', () => {
      // Given
      const source = '<span colour="red">text</span>'
      // When
      const document = parse(source).content
      // Then
      expect(document.content![0]!.content).toEqual([
        {
          type: 'unparsedInline',
          attrs: { kind: 'html', reason: 'Unsupported colour HTML attribute.' },
          content: [{ type: 'text', text: source }],
        },
      ])
      expect(parse(serialize(document)).content).toEqual(document)
    })
  })

  describe('When handling color and highlight variants', () => {
    for (const [source, type, color] of [
      ['<span style="color:#3b82f6">Text</span>', 'textStyle', '#3b82f6'],
      ['<span style="color:#22c55e">Text</span>', 'textStyle', '#22c55e'],
      ['<span style="color:#f97316">Text</span>', 'textStyle', '#f97316'],
      ['<span style="color:#ec4899">Text</span>', 'textStyle', '#ec4899'],
      ['<span style="color:#a855f7">Text</span>', 'textStyle', '#a855f7'],
      ['<span style="color:rgb(255, 0, 128)">Text</span>', 'textStyle', 'rgb(255, 0, 128)'],
      ['<span style="color:var(--primary)">Text</span>', 'textStyle', 'var(--primary)'],
      ['<span>Text</span>', 'textStyle', null],
      ['<mark style="background-color:#3b82f6">Text</mark>', 'highlight', '#3b82f6'],
      ['<mark style="background-color:#22c55e">Text</mark>', 'highlight', '#22c55e'],
      ['<mark style="background-color:#f97316">Text</mark>', 'highlight', '#f97316'],
      ['<mark style="background-color:#ec4899">Text</mark>', 'highlight', '#ec4899'],
      ['<mark style="background-color:#a855f7">Text</mark>', 'highlight', '#a855f7'],
      ['<mark style="background-color:yellow">Text</mark>', 'highlight', 'yellow'],
      ['<mark>Text</mark>', 'highlight', null],
    ] as const) {
      it(`parses and reopens ${type} color ${JSON.stringify(color)}`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Text', marks: [{ type, attrs: { color } }] }],
            },
          ],
        }
        // When
        const result = parse(source)
        const saved = serialize(result.content)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(saved)).toEqual({ content: expected, issues: [] })
      })
    }
    for (const [source, type] of [
      ['<span style="color:#3b82f6"> \t </span>', 'textStyle'],
      ['<mark style="background-color:#3b82f6"> \t </mark>', 'highlight'],
    ] as const) {
      it(`preserves ${type} on a span containing only whitespace`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: ' \t ', marks: [{ type, attrs: { color: '#3b82f6' } }] },
              ],
            },
          ],
        }
        // When
        const result = parse(source)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(serialize(result.content))).toEqual({ content: expected, issues: [] })
      })
    }
  })

  describe('When handling every editor palette token', () => {
    for (const [colorSource, highlightSource, color] of [
      [
        '<span style="color:var(--danger)">Text</span>',
        '<mark style="background-color:var(--danger)">Text</mark>',
        'var(--danger)',
      ],
      [
        '<span style="color:var(--warn)">Text</span>',
        '<mark style="background-color:var(--warn)">Text</mark>',
        'var(--warn)',
      ],
      [
        '<span style="color:var(--chart-4)">Text</span>',
        '<mark style="background-color:var(--chart-4)">Text</mark>',
        'var(--chart-4)',
      ],
      [
        '<span style="color:var(--success)">Text</span>',
        '<mark style="background-color:var(--success)">Text</mark>',
        'var(--success)',
      ],
      [
        '<span style="color:var(--info)">Text</span>',
        '<mark style="background-color:var(--info)">Text</mark>',
        'var(--info)',
      ],
      [
        '<span style="color:var(--chart-3)">Text</span>',
        '<mark style="background-color:var(--chart-3)">Text</mark>',
        'var(--chart-3)',
      ],
      [
        '<span style="color:var(--chart-5)">Text</span>',
        '<mark style="background-color:var(--chart-5)">Text</mark>',
        'var(--chart-5)',
      ],
      [
        '<span style="color:var(--chart-1)">Text</span>',
        '<mark style="background-color:var(--chart-1)">Text</mark>',
        'var(--chart-1)',
      ],
      [
        '<span style="color:var(--muted-foreground)">Text</span>',
        '<mark style="background-color:var(--muted-foreground)">Text</mark>',
        'var(--muted-foreground)',
      ],
    ] as const) {
      describe(`When using ${color}`, () => {
        for (const [source, type] of [
          [colorSource, 'textStyle'],
          [highlightSource, 'highlight'],
        ] as const) {
          it(`preserves the ${type} token through parsing, writing, and reopening`, () => {
            // Given
            const expected = {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Text', marks: [{ type, attrs: { color } }] }],
                },
              ],
            }
            // When
            const result = parse(source)
            // Then
            expect(result).toEqual({ content: expected, issues: [] })
            expect(parse(serialize(result.content))).toEqual({ content: expected, issues: [] })
          })
        }
      })
    }
  })
})

describe('When handling formatting', () => {
  describe('When parsing the inline formatting family', () => {
    it('maps ordinary Markdown formatting and explicit underline to editor marks', () => {
      // Given
      const source = '**Bold** *italic* ~~struck~~ `code` <u>underlined</u>'
      const expected = [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Bold' },
        { type: 'text', text: ' ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
        { type: 'text', text: ' ' },
        { type: 'text', marks: [{ type: 'strike' }], text: 'struck' },
        { type: 'text', text: ' ' },
        { type: 'text', marks: [{ type: 'code' }], text: 'code' },
        { type: 'text', text: ' ' },
        { type: 'text', marks: [{ type: 'underline' }], text: 'underlined' },
      ]
      // When
      const document = parse(source).content
      // Then
      expect(document.content?.[0]?.content).toEqual(expected)
      expect(parse(serialize(document)).content).toEqual(document)
    })

    for (const type of ['bold', 'italic', 'strike', 'code', 'underline']) {
      for (const text of ['Italic ', ' Leading', ' \t ', 'line\nbreak', '`literal` [text]']) {
        it(`preserves ${type} on ${JSON.stringify(text)} through writing and parsing`, () => {
          // Given
          const document: JSONContent = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type }] }] }],
          }
          // When
          const saved = serialize(document)
          // Then
          expect(parse(saved).content).toEqual(validateDocument(document))
          expect(saved).not.toContain('data-hypertextual-block')
        })
      }
    }
  })
})

describe('When handling link', () => {
  describe('When parsing the link mark family', () => {
    it('parses an ordinary destination and title with editor defaults', () => {
      // Given
      const source = '[Example](https://example.com "A title")'
      // When
      const document = parse(source).content
      // Then
      expect(document.content?.[0]?.content).toEqual([
        {
          type: 'text',
          text: 'Example',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://example.com',
                title: 'A title',
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'text-primary underline',
              },
            },
          ],
        },
      ])
      expect(parse(serialize(document)).content).toEqual(document)
    })

    it('preserves explicit link metadata and marked boundary whitespace', () => {
      // Given
      const source =
        '<a href="https://example.com" title="A title" target="_self" rel="author" class="custom-link">Example </a>'
      const expected = {
        type: 'text',
        text: 'Example ',
        marks: [
          {
            type: 'link',
            attrs: {
              href: 'https://example.com',
              title: 'A title',
              target: '_self',
              rel: 'author',
              class: 'custom-link',
            },
          },
        ],
      }
      // When
      const document = parse(source).content
      // Then
      expect(document.content?.[0]?.content).toEqual([expected])
      expect(parse(serialize(document)).content).toEqual(document)
    })
  })

  describe('When handling link attribute variants', () => {
    for (const [source, attrs] of [
      [
        '[Link](https://example.com)',
        {
          href: 'https://example.com',
          title: null,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline',
        },
      ],
      [
        '<a href="https://example.com" title="">Link</a>',
        {
          href: 'https://example.com',
          title: '',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline',
        },
      ],
      [
        '[Link](https://example.com "A &quot;quoted&quot; title")',
        {
          href: 'https://example.com',
          title: 'A "quoted" title',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline',
        },
      ],
      [
        '[Link](https://example.com?x=1&amp;y=2 "&amp;quot;")',
        {
          href: 'https://example.com?x=1&y=2',
          title: '&quot;',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline',
        },
      ],
      [
        '<a href="https://example.com" target="_self" rel="author" class="custom">Link</a>',
        {
          href: 'https://example.com',
          title: null,
          target: '_self',
          rel: 'author',
          class: 'custom',
        },
      ],
      [
        '<a href="https://example.com" target="preview" rel="" class="">Link</a>',
        { href: 'https://example.com', title: null, target: 'preview', rel: '', class: '' },
      ],
    ] as const) {
      it(`parses and reopens link attributes ${JSON.stringify(attrs)}`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs }] }],
            },
          ],
        }
        // When
        const result = parse(source)
        const saved = serialize(result.content)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(saved)).toEqual({ content: expected, issues: [] })
      })
    }
  })
})
