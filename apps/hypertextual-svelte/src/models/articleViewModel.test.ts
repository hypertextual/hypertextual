import { describe, expect, it } from 'bun:test'
import { parse } from 'htmd-ts'
import { ArticleViewModel } from './articleViewModel'

// integration -----------------------------------------------------------------

describe('When opening an article for the editor', () => {
  it('keeps the original source while exposing native document JSON', async () => {
    // Given
    const source = '\uFEFF# Original\r\n\r\nBody.\r\n'

    // When
    const document = new ArticleViewModel(source, parse(source).content, parse(source).issues)

    // Then
    expect(document.editable).toBe(true)
    expect(document.content).toEqual(parse(source).content)
    expect(document.title).toBe('Original')
    expect(document.serialize()).toBe(source)
  })

  it('opens unsupported source as editable unparsed content', async () => {
    // Given
    const source = ':::unknown\nKeep original\n:::'

    // When
    const document = new ArticleViewModel(source, parse(source).content, parse(source).issues)

    // Then
    expect(document.editable).toBe(true)
    expect(document.content!.content![0]!.type).toBe('unparsedBlock')
    expect(document.source).toBe(source)
    expect(document.reason).toBeUndefined()
    expect(document.issues).toEqual(parse(source).issues)
    expect(document.issues.length).toBeGreaterThan(0)
    expect(document.copyDraft()).toBe(source)
  })
})

describe('When editing an article view model', () => {
  it('writes synchronous SDK output with the current heading and source conventions', async () => {
    // Given
    const document = new ArticleViewModel(
      '\uFEFF# Original\r\n\r\nBody.\r\n',
      parse('\uFEFF# Original\r\n\r\nBody.\r\n').content,
    )
    const changed = structuredClone(document.content!)
    changed.content![0]!.content![0]!.text = 'Updated'

    // When
    const change = document.update(changed)

    // Then
    expect(change.title).toBe('Updated')
    expect(new ArticleViewModel(change.source, parse(change.source).content).title).toBe('Updated')
    expect(change.source.startsWith('\uFEFF')).toBe(true)
    expect(change.source).toContain('\r\n')
    expect(parse(change.source).content).toEqual(changed)
  })

  it('retains the latest JSON draft when format validation rejects the edit', async () => {
    // Given
    const document = new ArticleViewModel('# Article\n', parse('# Article\n').content)
    const draft = structuredClone(document.content!)
    draft.content!.push({ type: 'unknownWidget' })

    // When / Then
    expect(() => document.update(draft)).toThrow()
    expect(JSON.parse(document.copyDraft())).toEqual(draft)
    expect(document.source).toBe('# Article\n')
  })
})

describe('When transforming article image references', () => {
  it('keeps display URLs separate from the portable draft and original source', () => {
    // Given
    const source = '# Picture\n\n![Photo](.images/photo.png "Caption")\n'
    const document = new ArticleViewModel(source, parse(source).content)
    // When
    document.displayImages((path) => `blob:test-${path}`)
    const portable = document.transformImages(document.content!, (url) =>
      url.replace('blob:test-', ''),
    )
    // Then
    expect(document.imageSources).toEqual(['.images/photo.png'])
    expect(JSON.stringify(document.content)).toContain('blob:test-.images/photo.png')
    expect(JSON.stringify(portable)).not.toContain('blob:')
    expect(document.serialize()).toBe(source)
  })
})
