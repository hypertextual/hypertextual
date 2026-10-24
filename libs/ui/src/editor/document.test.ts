import { describe, expect, test } from 'bun:test'
import { EditorDocument, documentTitle } from './document'
import type { EditorAssets } from './types'

describe('portable editor document API', () => {
  test('provides titles and serialized changes without exposing editor JSON to hosts', async () => {
    const source = '\uFEFF# Original\r\n\r\nBody.\r\n'
    const document = await EditorDocument.open(source)
    expect(document.editable).toBe(true)
    expect(document.title).toBe('Original')
    expect(document.serialize()).toBe(source)
    const change = document.update(document.content.replace('Original', 'Updated'))
    expect(change).toEqual({ title: 'Updated', source: '\uFEFF# Updated\r\n\r\nBody.\r\n' })
    expect(documentTitle(change.source)).toBe('Updated')
  })

  test('resolves image assets for display and restores portable references on save', async () => {
    const source = '# Picture\n\n![Photo](.images/photo.png "Caption")\n'
    const assets: EditorAssets = {
      resolve: async (path) => `blob:test-${path}`,
      upload: async () => ({ src: 'blob:new', source: '.images/new.png' }),
    }
    const document = await EditorDocument.open(source, assets)
    expect(document.content).toContain('blob:test-.images/photo.png')
    expect(document.update(document.content.replace('Picture', 'Edited')).source).toContain(
      '.images/photo.png',
    )
    expect(document.serialize()).not.toContain('blob:')
    expect(await document.upload(new File(['image'], 'new.png'))).toEqual({
      src: 'blob:new',
      srcset: undefined,
    })
    const content = JSON.parse(document.content)
    content.content.push({ type: 'imageNode', attrs: { src: 'blob:new', alt: 'Uploaded' } })
    const change = document.update(JSON.stringify(content))
    expect(change.source).toContain('.images/new.png')
    expect(change.source).not.toContain('blob:')
  })

  test('retains missing image references and unsupported drafts for recovery', async () => {
    const document = await EditorDocument.open('# Article\n\n![Missing](.images/missing.png)\n', {
      resolve: async () => {
        throw new Error('Missing asset')
      },
      upload: async () => {
        throw new Error('Offline')
      },
    })
    expect(document.content).toContain('.images/missing.png')
    const json = JSON.parse(document.content)
    json.content.push({ type: 'unknownWidget' })
    const draft = JSON.stringify(json)
    expect(() => document.update(draft)).toThrow('cannot be saved')
    expect(document.copyDraft()).toBe(draft)
    const rich = await EditorDocument.open(':::unknown\nKeep original\n:::')
    expect(rich.editable).toBe(false)
    expect(rich.source).toBe(':::unknown\nKeep original\n:::')
  })
})
