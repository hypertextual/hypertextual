import { describe, expect, it } from 'bun:test'
import { MediaService } from './mediaService'

// integration -----------------------------------------------------------------

describe('When resolving workspace media', () => {
  it('gets local and remote images through one public service', async () => {
    // Given
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'content-type': 'image/png' },
        }),
    })
    const localRequests: string[] = []
    const media = new MediaService({
      readImage: async (articlePath, source) => {
        localRequests.push(`${articlePath}:${source}`)
        return { source, url: 'data:image/png;base64,bG9jYWw=' }
      },
      importImage: async () => {
        throw new Error('No upload expected')
      },
    })
    try {
      const remote = new URL('photo.png', server.url).href
      // When
      const assets = await media.batchGet('Articles/one.md', ['.images/local.png', remote, remote])
      // Then
      expect(localRequests).toEqual(['Articles/one.md:.images/local.png'])
      expect(assets.map((asset) => asset.source)).toEqual(['.images/local.png', remote])
      expect(assets.every((asset) => asset.url.startsWith('blob:'))).toBe(true)
      expect(new Uint8Array(await (await fetch(assets[1]!.url)).arrayBuffer())).toEqual(
        new Uint8Array([137, 80, 78, 71]),
      )
      expect(media.portableSource('Articles/one.md', assets[0]!.url)).toBe('.images/local.png')
      expect(media.portableSource('Articles/one.md', assets[1]!.url)).toBe(remote)
    } finally {
      server.stop(true)
      media.dispose()
    }
  })

  it('retains origins for uploaded media before its first save and after an article rename', async () => {
    // Given
    let bytes: number[] = []
    const media = new MediaService({
      readImage: async () => {
        throw new Error('No read expected')
      },
      importImage: async (articlePath, uploaded) => {
        expect(articlePath).toBe('Before.md')
        bytes = uploaded
        return { source: '.images/new.png', url: 'data:image/png;base64,bmV3' }
      },
    })
    // When
    const uploaded = await media.upload('Before.md', new File(['new'], 'new.png'))
    media.relocateArticle('Before.md', 'After.md')
    media.relocateArticle('After.md', 'After.md')
    // Then
    expect(bytes).toEqual([110, 101, 119])
    expect(media.portableSource('After.md', uploaded.url)).toBe('.images/new.png')
    expect(media.portableSource('Before.md', uploaded.url)).toBe(uploaded.url)
    media.dispose()
    expect(media.portableSource('After.md', uploaded.url)).toBe(uploaded.url)
    await expect(fetch(uploaded.url)).rejects.toThrow()
  })

  it('keeps identical display URLs scoped to their article origins', async () => {
    // Given
    const media = new MediaService({
      readImage: async (_article, source) => ({ source, url: 'data:image/png;base64,c2FtZQ==' }),
      importImage: async () => {
        throw new Error('No upload expected')
      },
    })
    // When
    const first = await media.get('First/article.md', '.images/first.png')
    const second = await media.get('Second/article.md', '.images/second.png')
    // Then
    expect(first.url).not.toBe(second.url)
    expect(media.portableSource('First/article.md', first.url)).toBe('.images/first.png')
    expect(media.portableSource('Second/article.md', second.url)).toBe('.images/second.png')
  })

  it('keeps distinct local references when identical images appear in one article', async () => {
    // Given
    const media = new MediaService({
      readImage: async (_article, source) => ({ source, url: 'data:image/png;base64,c2FtZQ==' }),
      importImage: async () => {
        throw new Error('No upload expected')
      },
    })
    // When
    const first = await media.get('Article.md', '.images/first.png')
    const second = await media.get('Article.md', '.images/second.png')
    // Then
    expect(first.url).not.toBe(second.url)
    expect(media.portableSource('Article.md', first.url)).toBe('.images/first.png')
    expect(media.portableSource('Article.md', second.url)).toBe('.images/second.png')
    media.dispose()
  })

  it('reports HTTP and non-image responses through the media service', async () => {
    // Given
    const server = Bun.serve({
      port: 0,
      fetch: (request) =>
        new URL(request.url).pathname === '/missing'
          ? new Response('Not found', { status: 404 })
          : new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } }),
    })
    const media = new MediaService({
      readImage: async () => {
        throw new Error('No local read expected')
      },
      importImage: async () => {
        throw new Error('No upload expected')
      },
    })
    try {
      // When / Then
      await expect(media.get('Article.md', new URL('missing', server.url).href)).rejects.toThrow(
        'HTTP 404',
      )
      await expect(media.get('Article.md', new URL('html', server.url).href)).rejects.toThrow(
        'did not return an image',
      )
    } finally {
      server.stop(true)
      media.dispose()
    }
  })

  it('returns successful assets while preserving missing and blocked references for callers', async () => {
    // Given
    const media = new MediaService(
      {
        readImage: async (_article, source) => {
          if (source === '.images/missing.png') throw new Error('Missing image')
          return { source, url: 'data:image/png;base64,b2s=' }
        },
        importImage: async () => {
          throw new Error('No upload expected')
        },
      },
      async () => {
        throw new Error('Remote request blocked')
      },
    )
    // When
    const assets = await media.batchGet('Article.md', [
      '.images/ok.png',
      '.images/missing.png',
      'https://example.test/remote.png',
    ])
    // Then
    expect(assets.map((asset) => asset.source)).toEqual(['.images/ok.png'])
    expect(assets[0]!.url).toStartWith('blob:')
    expect(media.portableSource('Article.md', '.images/missing.png')).toBe('.images/missing.png')
    expect(media.portableSource('Article.md', 'https://example.test/remote.png')).toBe(
      'https://example.test/remote.png',
    )
  })
})
