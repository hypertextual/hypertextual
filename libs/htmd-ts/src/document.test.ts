import { describe, expect, test } from 'bun:test'
import { articleIdentity, decodeArticle, encodeArticle } from './document.js'

const examples = [
  '# Article\n\nA **bold** and *italic* [link](https://example.com).\n',
  '## Lists\n\n- First\n- Second\n\n1. One\n2. Two\n',
  '- [x] Done\n- [ ] Pending\n',
  '> Quoted text\n\n---\n\n```ts\nconst answer = 42\n```\n',
  '',
  '\uFEFF# Windows\r\n\r\nA paragraph.\r\n',
]

describe('portable article conversion', () => {
  for (const source of examples) {
    test(`unchanged source stays byte-for-byte: ${JSON.stringify(source.slice(0, 30))}`, () => {
      const article = decodeArticle(source)
      expect(article.editable).toBe(true)
      expect(encodeArticle(article, article.content)).toBe(source)
    })
  }

  test('edited Markdown and Markdown-compatible HTMD serialize as source', () => {
    const article = decodeArticle('# Original\n\nA paragraph.\n')
    const json = JSON.parse(article.content)
    json.content[0].content[0].text = 'Edited'
    json.content[0].attrs.textAlign = 'left' // Default added by the helical editor.
    const source = encodeArticle(article, JSON.stringify(json))
    expect(source).toBe('# Edited\n\nA paragraph.\n')
    expect(decodeArticle(source).editable).toBe(true)
  })

  for (const type of ['heading', 'paragraph']) {
    for (const text of ['Hello ', 'Hello  ', ' Hello', 'Hello\t', ' \t ']) {
      test(`preserves ${type} boundary whitespace: ${JSON.stringify(text)}`, () => {
        const original = decodeArticle('# Original\n\nBody.\n')
        const document = {
          type: 'doc',
          content: [
            {
              type,
              ...(type === 'heading' ? { attrs: { level: 1 } } : {}),
              content: [{ type: 'text', text }],
            },
          ],
        }
        const source = encodeArticle(original, JSON.stringify(document))
        const reopened = decodeArticle(source)
        expect(reopened.editable).toBe(true)
        expect(articleIdentity(JSON.parse(reopened.content))).toBe(articleIdentity(document))
      })
    }
  }

  test('preserves the reported empty H2 and paragraph editing state', () => {
    const document = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { textAlign: 'left', level: 1 },
          content: [{ type: 'text', text: 'Hello' }],
        },
        { type: 'heading', attrs: { textAlign: 'left', level: 2 } },
        { type: 'paragraph', attrs: { textAlign: 'left' } },
      ],
    }
    const source = encodeArticle(decodeArticle('# Original\n'), JSON.stringify(document))
    expect(source).toContain('## ')
    const reopened = decodeArticle(source)
    expect(reopened.editable).toBe(true)
    expect(articleIdentity(JSON.parse(reopened.content))).toBe(articleIdentity(document))
  })

  test('preserves repeated empty paragraphs alongside empty headings', () => {
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 } },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 } },
        { type: 'paragraph' },
      ],
    }
    const source = encodeArticle(decodeArticle('# Original\n'), JSON.stringify(document))
    expect(articleIdentity(JSON.parse(decodeArticle(source).content))).toBe(
      articleIdentity(document),
    )
  })

  test('preserves a newly inserted empty quote before typing', () => {
    const original = decodeArticle('# Article\n')
    const document = {
      type: 'doc',
      content: [
        ...JSON.parse(original.content).content,
        { type: 'blockquote', content: [{ type: 'paragraph' }] },
        { type: 'paragraph' },
      ],
    }
    const source = encodeArticle(original, JSON.stringify(document))
    expect(articleIdentity(JSON.parse(decodeArticle(source).content))).toBe(
      articleIdentity(document),
    )
  })

  for (const type of ['bulletList', 'orderedList']) {
    test(`preserves newly inserted empty ${type} and default list attributes`, () => {
      const original = decodeArticle('# Article\n')
      const document = {
        type: 'doc',
        content: [
          ...JSON.parse(original.content).content,
          {
            type,
            ...(type === 'orderedList' ? { attrs: { start: 1 } } : {}),
            content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
          },
          { type: 'paragraph' },
        ],
      }
      const source = encodeArticle(original, JSON.stringify(document))
      expect(articleIdentity(JSON.parse(decodeArticle(source).content))).toBe(
        articleIdentity(document),
      )
    })
  }

  test('preserves the reported newly inserted empty Note', () => {
    const document = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { textAlign: 'left', level: 1 },
          content: [{ type: 'text', text: 'Floogle horn!' }],
        },
        {
          type: 'notice',
          attrs: { variant: 'info', title: 'Note' },
          content: [{ type: 'paragraph', attrs: { textAlign: 'left' } }],
        },
        { type: 'paragraph', attrs: { textAlign: 'left' } },
      ],
    }
    const source = encodeArticle(decodeArticle('# Original\n'), JSON.stringify(document))
    expect(source).toContain('> [!NOTE] Note')
    const reopened = decodeArticle(source)
    expect(reopened.editable).toBe(true)
    expect(articleIdentity(JSON.parse(reopened.content))).toBe(articleIdentity(document))
  })

  for (const variant of ['info', 'success', 'warning', 'error']) {
    test(`preserves ${variant} notices with titles and formatted body content`, () => {
      const document = {
        type: 'doc',
        content: [
          {
            type: 'notice',
            attrs: { variant, title: ' Custom & <title>\n ' },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Important', marks: [{ type: 'bold' }] },
                  { type: 'text', text: ' details ' },
                ],
              },
              { type: 'paragraph' },
              { type: 'heading', attrs: { level: 2 } },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }
      const source = encodeArticle(decodeArticle('# Original\n'), JSON.stringify(document))
      const reopened = decodeArticle(source)
      expect(reopened.editable).toBe(true)
      expect(articleIdentity(JSON.parse(reopened.content))).toBe(articleIdentity(document))
      expect(encodeArticle(reopened, reopened.content)).toBe(source)
    })
  }

  test('keeps ordinary quotes as quotes and preserves nested notices', () => {
    expect(JSON.parse(decodeArticle('> Ordinary quote\n').content).content[0].type).toBe(
      'blockquote',
    )
    const document = {
      type: 'doc',
      content: [
        {
          type: 'notice',
          attrs: { variant: 'info', title: 'Outer' },
          content: [
            {
              type: 'notice',
              attrs: { variant: 'warning', title: 'Inner' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
            },
          ],
        },
      ],
    }
    const source = encodeArticle(decodeArticle('# Original\n'), JSON.stringify(document))
    expect(articleIdentity(JSON.parse(decodeArticle(source).content))).toBe(
      articleIdentity(document),
    )
  })

  test('keeps CRLF and BOM on edited articles', () => {
    const article = decodeArticle('\uFEFF# Original\r\n')
    const json = JSON.parse(article.content)
    json.content[0].content[0].text = 'Edited'
    expect(encodeArticle(article, JSON.stringify(json))).toBe('\uFEFF# Edited\r\n')
  })

  for (const source of [
    '---\ntitle: Metadata\n---\n\nBody',
    '<div>Keep this HTML</div>',
    '| A | B |\n|---|---|\n|1|2|',
    ':::chart\n{"unknown":"data"}\n:::',
    '```chart\n{"series":[1,2]}\n```',
    '[ref]: https://example.com\n\n[Link][ref]',
  ]) {
    test(`unsupported content remains read-only: ${source.slice(0, 30)}`, () => {
      const article = decodeArticle(source)
      expect(article.editable).toBe(false)
      expect(article.source).toBe(source)
      expect(() => encodeArticle(article, '{}')).toThrow()
    })
  }

  test('never silently drops unsupported editor blocks or marks', () => {
    const article = decodeArticle('Hello')
    const json = JSON.parse(article.content)
    json.content.push({ type: 'image', attrs: { src: 'image.png' } })
    expect(() => encodeArticle(article, JSON.stringify(json))).toThrow('cannot be saved')
    json.content.pop()
    json.content[0].content[0].marks = [{ type: 'highlight', attrs: { color: 'red' } }]
    expect(() => encodeArticle(article, JSON.stringify(json))).toThrow('cannot be saved')
  })
})

// Helical image nodes remain editable, including an empty image placeholder.
for (const attrs of [
  { src: null, alt: '', caption: '', srcset: null },
  { src: '.images/photo.png', alt: 'A picture', caption: 'A caption', srcset: null },
  { src: 'https://example.com/photo.png', alt: 'Picture', caption: '', srcset: null },
  {
    src: 'https://example.com/a%20photo.png',
    alt: 'A [photo]',
    caption: 'A "quoted" caption',
    srcset: null,
  },
]) {
  test(`round-trips image nodes ${JSON.stringify(attrs)}`, () => {
    const before = decodeArticle('# Article\n\n')
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Article' }] },
        { type: 'imageNode', attrs },
        { type: 'paragraph' },
      ],
    }
    const saved = encodeArticle(before, JSON.stringify(doc))
    const reopened = decodeArticle(saved)
    expect(reopened.editable).toBe(true)
    expect(articleIdentity(JSON.parse(reopened.content))).toBe(articleIdentity(doc))
  })
}
