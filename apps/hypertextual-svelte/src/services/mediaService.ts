import type { ImageAsset, WorkspaceClient } from '../clients/workspaceClient'

/** Resolve media within one workspace window and retain portable asset origins. */
export class MediaService {
  // Origin records let newly uploaded display URLs be restored before their first save.
  // The workspace window owns this service and clears the records when it closes.
  private assets = new Map<string, { articlePath: string; asset: ImageAsset }>()

  constructor(
    private client: Pick<WorkspaceClient, 'readImage' | 'importImage'>,
    private fetchImage: (url: string) => Promise<Response> = fetch,
  ) {}

  async get(articlePath: string, source: string): Promise<ImageAsset> {
    let asset: ImageAsset
    if (/^https?:/i.test(source)) {
      const response = await this.fetchImage(source)
      if (!response.ok) throw new Error(`Could not load image: HTTP ${response.status}.`)
      const mime = response.headers.get('content-type')?.split(';')[0] ?? ''
      if (!mime.startsWith('image/')) throw new Error('The remote URL did not return an image.')
      asset = { source, url: URL.createObjectURL(await response.blob()) }
    } else if (/^(data:image\/|blob:)/i.test(source)) {
      asset = { source, url: source }
    } else {
      asset = await this.client.readImage(articlePath, source)
      if (asset.url.startsWith('data:'))
        asset = { ...asset, url: URL.createObjectURL(await (await fetch(asset.url)).blob()) }
    }
    this.remember(articlePath, asset)
    return asset
  }

  async batchGet(articlePath: string, sources: readonly string[]): Promise<ImageAsset[]> {
    const results = await Promise.allSettled(
      [...new Set(sources)].map((source) => this.get(articlePath, source)),
    )
    // Missing local files and blocked remote requests leave their original reference visible.
    return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
  }

  async upload(articlePath: string, file: File): Promise<ImageAsset> {
    const asset = await this.client.importImage(
      articlePath,
      Array.from(new Uint8Array(await file.arrayBuffer())),
    )
    const display = asset.url.startsWith('data:')
      ? { ...asset, url: URL.createObjectURL(await (await fetch(asset.url)).blob()) }
      : asset
    this.remember(articlePath, display)
    return display
  }

  portableSource(articlePath: string, displayUrl: string): string {
    const sources = new Map(
      [...this.assets.values()]
        .filter((entry) => entry.articlePath === articlePath)
        .map(({ asset }) => [asset.url, asset.source]),
    )
    return sources.get(displayUrl) ?? displayUrl
  }

  relocateArticle(oldPath: string, newPath: string) {
    if (oldPath === newPath) return
    for (const [key, entry] of this.assets) {
      if (entry.articlePath !== oldPath) continue
      this.assets.delete(key)
      this.remember(newPath, entry.asset)
    }
  }

  dispose() {
    for (const { asset } of this.assets.values()) {
      if (asset.url.startsWith('blob:') && asset.url !== asset.source)
        URL.revokeObjectURL(asset.url)
    }
    this.assets.clear()
  }

  private remember(articlePath: string, asset: ImageAsset) {
    this.assets.set(`${articlePath}\0${asset.url}`, { articlePath, asset })
  }
}
