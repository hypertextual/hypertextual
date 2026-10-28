import { describe, expect, it } from 'bun:test'
import { parse, serialize, type JSONContent } from './index.js'

// integration -----------------------------------------------------------------

describe('When handling blockquote', () => {
  describe('When parsing an ordinary quote', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '> A **bold** quote.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'A ',
                  },
                  {
                    type: 'text',
                    text: 'bold',
                    marks: [
                      {
                        type: 'bold',
                      },
                    ],
                  },
                  {
                    type: 'text',
                    text: ' quote.',
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling bullet-list', () => {
  describe('When saving adjacent bullet lists', () => {
    it('preserves separate lists using standard alternating bullet markers', () => {
      // Given
      const source = '- First\n\n* Second\n\n- Third'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }],
              },
            ],
          },
        ],
      }
      // When
      const result = parse(source)
      const saved = serialize(expected)
      // Then
      expect(result).toEqual({ content: expected, issues: [] })
      expect(saved).toBe(source + '\n')
      expect(parse(saved)).toEqual({ content: expected, issues: [] })
    })
  })

  describe('When parsing a nested bullet list', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '- First\n  - Nested'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'First',
                      },
                    ],
                  },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [
                              {
                                type: 'text',
                                text: 'Nested',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling code-block', () => {
  describe('When parsing a fenced code block', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '```rust\nfn main() {}\n```'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: {
              language: 'rust',
            },
            content: [
              {
                type: 'text',
                text: 'fn main() {}',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling code-block language variants', () => {
    for (const [source, language, text] of [
      ['```javascript\nconst value = 1\n```', 'javascript', 'const value = 1'],
      ['```typescript\nconst value: number = 1\n```', 'typescript', 'const value: number = 1'],
      ['```python\nprint("hello")\n```', 'python', 'print("hello")'],
      ['```\nplain content\n```', 'javascript', 'plain content'],
      ['```text\n\t tabs & <markup>\n```', 'text', '\t tabs & <markup>'],
    ] as const) {
      it(`parses and reopens ${language} code without changing its content`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [{ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] }],
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

describe('When handling document', () => {
  describe('When parsing a document with multiple blocks', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '# Title\n\nBody.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: {
              level: 1,
            },
            content: [
              {
                type: 'text',
                text: 'Title',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Body.',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling hard-break', () => {
  describe('When parsing an explicit line break', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = 'First\\\nSecond'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'First',
              },
              {
                type: 'hardBreak',
              },
              {
                type: 'text',
                text: 'Second',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling heading', () => {
  describe('When parsing a standard heading', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '## Heading'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: {
              level: 2,
            },
            content: [
              {
                type: 'text',
                text: 'Heading',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling heading variants', () => {
    for (const [source, level, text] of [
      ['# Heading 1', 1, 'Heading 1'],
      ['## Heading 2', 2, 'Heading 2'],
      ['### Heading 3', 3, 'Heading 3'],
      ['#### Heading 4', 4, 'Heading 4'],
      ['##### Heading 5', 5, 'Heading 5'],
      ['###### Heading 6', 6, 'Heading 6'],
      ['# &#32;Title&#32;', 1, ' Title '],
      ['# Literal * title&#32;', 1, 'Literal * title '],
    ] as const) {
      it(`parses and reopens ${JSON.stringify(source)} with its exact level and text`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }],
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

describe('When handling horizontal-rule', () => {
  describe('When parsing a horizontal rule', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '---'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'horizontalRule',
          },
        ],
      }

      // When
      const document = parse(source).content
      const saved = serialize(document)

      // Then
      expect(document).toEqual(expected)
      expect(parse(saved).content).toEqual(expected)
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling image', () => {
  describe('When parsing image metadata', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '![Photo](.images/photo.png "A caption")'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'imageNode',
            attrs: {
              src: '.images/photo.png',
              srcset: null,
              alt: 'Photo',
              caption: 'A caption',
            },
          },
        ],
      }

      // When
      const document = parse(source).content
      const saved = serialize(document)

      // Then
      expect(document).toEqual(expected)
      expect(parse(saved).content).toEqual(expected)
      expect(saved).toBe(source + '\n')
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling local and remote image variants', () => {
    for (const [source, src, alt, caption] of [
      ['![](.images/local.png)', '.images/local.png', '', ''],
      ['![&amp;quot;](.images/local.png)', '.images/local.png', '&quot;', ''],
      ['![Local](.images/local.png "Caption")', '.images/local.png', 'Local', 'Caption'],
      [
        '![Remote](https://example.com/image.png "Remote caption")',
        'https://example.com/image.png',
        'Remote',
        'Remote caption',
      ],
      [
        '![Space](<.images/a b.png> "A &quot;quoted&quot; caption")',
        '.images/a b.png',
        'Space',
        'A "quoted" caption',
      ],
      [
        '![Unicode](.images/日本語.png "&#32;caption&#32;")',
        '.images/日本語.png',
        'Unicode',
        ' caption ',
      ],
      [
        '![A &amp; B](https://example.com/a.png?x=1&amp;y=2 "&amp;quot;")',
        'https://example.com/a.png?x=1&y=2',
        'A & B',
        '&quot;',
      ],
    ] as const) {
      it(`parses and reopens image ${JSON.stringify(src)} with all persisted attributes`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [{ type: 'imageNode', attrs: { src, srcset: null, alt, caption } }],
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

describe('When handling internal-mention', () => {
  describe('When parsing an internal article mention', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '[mention id="post-1" label="A post" type="post" seriesId="series-1"]'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'internalMention',
                attrs: {
                  id: 'post-1',
                  label: 'A post',
                  type: 'post',
                  seriesId: 'series-1',
                },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling custom mention variants', () => {
    for (const [source, attrs] of [
      [
        '[mention id="post-1" label="Post" type="post"]',
        { id: 'post-1', label: 'Post', type: 'post', seriesId: null },
      ],
      [
        '[mention id="series-1" label="Series" type="series" seriesId="series-1"]',
        { id: 'series-1', label: 'Series', type: 'series', seriesId: 'series-1' },
      ],
      [
        '[mention id="post-2" label="A &quot;quoted&quot; &amp; title"]',
        { id: 'post-2', label: 'A "quoted" & title', type: 'post', seriesId: null },
      ],
      ['[mention id="post-3" label=""]', { id: 'post-3', label: '', type: 'post', seriesId: null }],
    ] as const) {
      it(`parses and reopens mention ${attrs.id} with its exact metadata`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'internalMention', attrs }] }],
        }
        // When
        const result = parse(source)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(serialize(result.content))).toEqual({ content: expected, issues: [] })
      })
    }
  })
})

describe('When handling link-preview', () => {
  describe('When parsing a bookmark card', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source =
        ':::bookmark {url="https://example.com" title="Example" description="A saved link" image="cover.png" favicon="icon.png" provider="Example" type="bookmark"} :::'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'linkPreview',
            attrs: {
              url: 'https://example.com',
              title: 'Example',
              description: 'A saved link',
              image: 'cover.png',
              favicon: 'icon.png',
              provider: 'Example',
              type: 'bookmark',
            },
          },
        ],
      }

      // When
      const document = parse(source).content
      const saved = serialize(document)

      // Then
      expect(document).toEqual(expected)
      expect(parse(saved).content).toEqual(expected)
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling bookmark and YouTube variants', () => {
    for (const [source, attrs] of [
      [
        ':::bookmark {url="https://example.com" title="A title" description="Description" image="cover.png" favicon="icon.png" provider="Example"} :::',
        {
          url: 'https://example.com',
          title: 'A title',
          description: 'Description',
          image: 'cover.png',
          favicon: 'icon.png',
          provider: 'Example',
          type: 'bookmark',
        },
      ],
      [
        ':::bookmark {url="https://example.com" title=""} :::',
        {
          url: 'https://example.com',
          title: '',
          description: null,
          image: null,
          favicon: null,
          provider: null,
          type: 'bookmark',
        },
      ],
      [
        ':::youtube {url="https://youtu.be/example?t=90" title="Video"} :::',
        {
          url: 'https://youtu.be/example?t=90',
          title: 'Video',
          description: null,
          image: null,
          favicon: null,
          provider: null,
          type: 'embed',
        },
      ],
      [
        ':::youtube {url="https://www.youtube.com/watch?v=example&amp;start=90" title="Video"} :::',
        {
          url: 'https://www.youtube.com/watch?v=example&start=90',
          title: 'Video',
          description: null,
          image: null,
          favicon: null,
          provider: null,
          type: 'embed',
        },
      ],
      [
        ':::youtube {url="https://youtu.be/example#t=1m30s"} :::',
        {
          url: 'https://youtu.be/example#t=1m30s',
          title: null,
          description: null,
          image: null,
          favicon: null,
          provider: null,
          type: 'embed',
        },
      ],
    ] as const) {
      it(`parses and reopens ${attrs.type} ${attrs.url} with its metadata`, () => {
        // Given
        const expected = { type: 'doc', content: [{ type: 'linkPreview', attrs }] }
        // When
        const result = parse(source)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(serialize(result.content))).toEqual({ content: expected, issues: [] })
      })
    }
  })
})

describe('When handling list-item', () => {
  describe('When parsing a list item with multiple paragraphs', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '- First paragraph.\n\n  Second paragraph.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'First paragraph.',
                      },
                    ],
                  },
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Second paragraph.',
                      },
                    ],
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling notice', () => {
  describe('When parsing a notice with a formatted body', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '> [!WARNING] Take care\n> Some **important** text.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'notice',
            attrs: {
              variant: 'warning',
              title: 'Take care',
            },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Some ',
                  },
                  {
                    type: 'text',
                    text: 'important',
                    marks: [
                      {
                        type: 'bold',
                      },
                    ],
                  },
                  {
                    type: 'text',
                    text: ' text.',
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling notice variants', () => {
    for (const [source, variant, title] of [
      ['> [!NOTE] Information\n> Body', 'info', 'Information'],
      ['> [!TIP] Success\n> Body', 'success', 'Success'],
      ['> [!WARNING] Caution\n> Body', 'warning', 'Caution'],
      ['> [!CAUTION] Failure\n> Body', 'error', 'Failure'],
    ] as const) {
      it(`parses and reopens the ${variant} notice with its title and body`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'notice',
              attrs: { variant, title },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
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

describe('When handling ordered-list', () => {
  describe('When parsing an ordered list with a starting number', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '3. Third\n4. Fourth'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: {
              start: 3,
              type: null,
            },
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Third',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Fourth',
                      },
                    ],
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When saving adjacent ordered lists', () => {
    it('keeps a separate empty list between populated lists', () => {
      // Given
      const source = '1. First&#32;\n\n1) <p></p>\n\n3. Third'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { start: 1, type: null },
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First ' }] }],
              },
            ],
          },
          {
            type: 'orderedList',
            attrs: { start: 1, type: null },
            content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
          },
          {
            type: 'orderedList',
            attrs: { start: 3, type: null },
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }],
              },
            ],
          },
        ],
      }
      // When
      const result = parse(source)
      const saved = serialize(expected)
      // Then
      expect(result).toEqual({ content: expected, issues: [] })
      expect(saved).toBe(source + '\n')
      expect(parse(saved)).toEqual({ content: expected, issues: [] })
    })
  })

  describe('When parsing inline content in tight numbered lists', () => {
    it('decodes entities and retains marks and boundary whitespace through save/reopen', () => {
      // Given
      const source = '1. **Bold** &amp; text&#32;'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { start: 1, type: null },
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', marks: [{ type: 'bold' }], text: 'Bold' },
                      { type: 'text', text: ' & text ' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }
      // When
      const result = parse(source)
      const saved = serialize(expected)
      // Then
      expect(result).toEqual({ content: expected, issues: [] })
      expect(parse(saved)).toEqual({ content: expected, issues: [] })
    })
  })

  describe('When handling ordered-list start variants', () => {
    for (const [source, start] of [
      ['0. Item', 0],
      ['1. Item', 1],
      ['3. Item', 3],
    ] as const) {
      it(`preserves list start ${start} through parsing and reopening`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'orderedList',
              attrs: { start, type: null },
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }],
                },
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
})

describe('When handling paragraph', () => {
  describe('When parsing an ordinary paragraph', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = 'Ordinary paragraph.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Ordinary paragraph.',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling task-item', () => {
  describe('When parsing an empty checked task', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '- [x] <p></p>'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: {
                  checked: true,
                },
                content: [
                  {
                    type: 'paragraph',
                  },
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
      expect(saved).toBe(source + '\n')
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling task-list', () => {
  describe('When parsing tasks with different completion states', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = '- [x] Done\n- [ ] Pending'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: {
                  checked: true,
                },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Done',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: {
                  checked: false,
                },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Pending',
                      },
                    ],
                  },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling task completion and empty-body variants', () => {
    for (const [source, checked, text] of [
      ['- [x] Done', true, 'Done'],
      ['- [ ] Pending', false, 'Pending'],
      ['- [x] <p></p>', true, ''],
      ['- [ ] <p></p>', false, ''],
    ] as const) {
      it(`parses and reopens ${JSON.stringify(source)} without losing its checkbox or body`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked },
                  content: [
                    { type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) },
                  ],
                },
              ],
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
    it('preserves a nested task list with independently checked items', () => {
      // Given
      const source = '- [x] Parent\n  - [ ] Child'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
                  {
                    type: 'taskList',
                    content: [
                      {
                        type: 'taskItem',
                        attrs: { checked: false },
                        content: [
                          { type: 'paragraph', content: [{ type: 'text', text: 'Child' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
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
  })
})

describe('When handling text', () => {
  describe('When parsing escaped literal text', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source = 'Escaped \\*text\\* &amp; symbols.'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Escaped *text* & symbols.',
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })
})

describe('When handling unparsed-block', () => {
  describe('When a block cannot be parsed', () => {
    it('preserves its source and diagnostic while keeping neighboring blocks editable', () => {
      // Given
      const source = '# Known\n\n:::chart\n{"series":[1,2]}\n:::\n\n**After**'
      const expected: JSONContent = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Known' }] },
          {
            type: 'unparsedBlock',
            attrs: { kind: 'containerDirective', reason: 'Unsupported chart directive.' },
            content: [{ type: 'text', text: ':::chart\n{"series":[1,2]}\n:::' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After', marks: [{ type: 'bold' }] }],
          },
        ],
      }
      // When
      const document = parse(source).content
      // Then
      expect(document).toEqual(expected)
      expect(serialize(document, { originalSource: source })).toBe(source)
      // When
      document.content![0]!.content![0]!.text = 'Edited'
      const saved = serialize(document, { originalSource: source })
      // Then
      expect(saved).toContain(':::chart\n{"series":[1,2]}\n:::')
      expect(parse(saved).content).toEqual(document)
    })

    for (const source of [
      '> Before\n>\n> :::chart\n> raw\n> :::\n>\n> After',
      '- Before\n\n  :::chart\n  raw\n  :::\n\n- After',
      '---\ntitle: Metadata\n---\n\n# Body',
      '| A | B |\n|---|---|\n|1|2|\n\nAfter',
      '+++\ntitle = "Metadata"\n+++\n\nBody',
    ]) {
      it(`preserves nested or unsupported block source ${JSON.stringify(source)} when reopened`, () => {
        // Given
        const document = parse(source).content
        // When
        const saved = serialize(document)
        // Then
        expect(parse(saved).content).toEqual(document)
        expect(serialize(document, { originalSource: source })).toBe(source)
      })
    }

    it('recognizes a repaired block on saving and reopening', () => {
      // Given
      const document = parse(':::chart\nraw\n:::').content
      // When
      document.content![0]!.content![0]!.text = '# Repaired heading'
      const saved = serialize(document)
      // Then
      expect(saved).toBe('# Repaired heading\n')
      expect(parse(saved).content).toEqual({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Repaired heading' }],
          },
        ],
      })
    })
  })
})

describe('When handling unparsed-inline', () => {
  describe('When inline syntax cannot be parsed', () => {
    it('wraps only the failed node and retains surrounding formatting', () => {
      // Given
      const source = 'Before **bold** :future[raw]{value="kept"} after.'
      // When
      const document = parse(source).content
      const saved = serialize(document)
      // Then
      expect(document.content![0]!.content).toEqual([
        { type: 'text', text: 'Before ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' ' },
        {
          type: 'unparsedInline',
          attrs: { kind: 'textDirective', reason: 'Unsupported future directive.' },
          content: [{ type: 'text', text: ':future[raw]{value="kept"}' }],
        },
        { type: 'text', text: ' after.' },
      ])
      expect(saved).toContain(':future[raw]{value="kept"}')
      expect(parse(saved).content).toEqual(document)
    })

    for (const source of [
      'Before **bold** <u>unclosed *italic* after.',
      'Before <u future="value">raw</u> **after**.',
      'Before <u>known <unknown>raw</unknown> known</u> after.',
      'Before **known :future[raw] known** after.',
      'Before </u> after.',
      'Before :color[text]{colour="red"} after.',
      '> Before :future[one\n> two] after.',
      '[ref]: https://example.com\n\n[Known][ref] and ![Picture][ref]',
    ]) {
      it(`preserves malformed inline source ${JSON.stringify(source)} without disabling the document`, () => {
        // Given
        const document = parse(source).content
        // When
        const saved = serialize(document)
        // Then
        expect(parse(saved).content).toEqual(document)
        expect(serialize(document, { originalSource: source })).toBe(source)
      })
    }

    it('retains every character on an unindented continuation inside a quote', () => {
      // Given
      const source = '> Before :future[one\nsecond] after.'
      // When
      const document = parse(source).content
      const saved = serialize(document)
      // Then
      expect(document.content![0]!.content![0]!.content![1]).toEqual({
        type: 'unparsedInline',
        attrs: { kind: 'textDirective', reason: 'Unsupported future directive.' },
        content: [{ type: 'text', text: ':future[one\nsecond]' }],
      })
      expect(parse(saved).content).toEqual(document)
      expect(serialize(document, { originalSource: source })).toBe(source)
    })

    it('recognizes repaired inline source while retaining its neighbors', () => {
      // Given
      const document = parse('Before :future[raw] after.').content
      // When
      document.content![0]!.content![1]!.content![0]!.text = '*fixed*'
      const saved = serialize(document)
      // Then
      expect(saved).toBe('Before *fixed* after.\n')
      expect(parse(saved).content.content![0]!.content).toEqual([
        { type: 'text', text: 'Before ' },
        { type: 'text', text: 'fixed', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' after.' },
      ])
    })
  })
})

describe('When handling url-mention', () => {
  describe('When parsing a URL mention', () => {
    it('produces the documented ProseMirror JSON and preserves it when written again', () => {
      // Given
      const source =
        '[url-mention url="https://example.com" title="Example" favicon="https://example.com/icon.png"]'
      const expected = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'urlMention',
                attrs: {
                  url: 'https://example.com',
                  title: 'Example',
                  favicon: 'https://example.com/icon.png',
                },
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
      expect(saved).not.toContain('data-hypertextual-block')
    })
  })

  describe('When handling URL-mention metadata variants', () => {
    for (const [source, attrs] of [
      [
        '[url-mention url="https://example.com"]',
        { url: 'https://example.com', title: null, favicon: null },
      ],
      [
        '[url-mention url="http://example.com" title="" favicon=""]',
        { url: 'http://example.com', title: '', favicon: '' },
      ],
      [
        '[url-mention url="https://example.com?x=1&amp;y=2" title="A &quot;title&quot;" favicon="icon.png"]',
        { url: 'https://example.com?x=1&y=2', title: 'A "title"', favicon: 'icon.png' },
      ],
    ] as const) {
      it(`preserves URL mention attributes ${JSON.stringify(attrs)}`, () => {
        // Given
        const expected = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'urlMention', attrs }] }],
        }
        // When
        const result = parse(source)
        // Then
        expect(result).toEqual({ content: expected, issues: [] })
        expect(parse(serialize(result.content))).toEqual({ content: expected, issues: [] })
      })
    }
  })
})
