import type { JSONContent } from '@tiptap/core'
import { decodeArticle, encodeArticle, type Article } from './codec'
import type { EditorAssets, EditorChange } from './types'

/** A portable document session; hosts supply assets and persist serialized changes. */
export class EditorDocument {
  private draft: string
  private urls = new Map<string, string>()
  content: string

  private constructor(
    private article: Article,
    private assets?: EditorAssets,
  ) {
    this.content = this.draft = article.content
  }

  static async open(source: string, assets?: EditorAssets): Promise<EditorDocument> {
    const document = new EditorDocument(decodeArticle(source), assets)
    if (!document.content || !assets) return document
    const sources = new Set<string>()
    transformImages(document.content, (src) => {
      if (!/^(https?:|data:|blob:)/i.test(src)) sources.add(src)
      return src
    })
    const resolved = new Map<string, string>()
    await Promise.all(
      [...sources].map(async (source) => {
        try {
          const url = await assets.resolve(source)
          document.urls.set(url, source)
          resolved.set(source, url)
        } catch {
          // An unavailable asset must not remove its persisted reference.
        }
      }),
    )
    document.content = transformImages(document.content, (src) => resolved.get(src) ?? src)
    return document
  }

  get source() {
    return this.article.source
  }
  get editable() {
    return this.article.editable
  }
  get reason() {
    return this.article.reason
  }
  get title() {
    return extractTitle(this.draft)
  }

  update(content: string): EditorChange {
    this.draft = transformImages(content, (src) => this.urls.get(src) ?? src)
    return { source: this.serialize(), title: this.title }
  }

  serialize(): string {
    return encodeArticle(this.article, this.draft)
  }

  copyDraft(): string {
    try {
      return this.serialize()
    } catch {
      return this.draft
    }
  }

  async upload(file: File) {
    if (!this.assets) throw new Error('Image upload is unavailable.')
    const asset = await this.assets.upload(file)
    this.urls.set(asset.src, asset.source)
    return { src: asset.src, srcset: asset.srcset }
  }
}

export function documentTitle(source: string): string {
  return extractTitle(decodeArticle(source).content)
}

function extractTitle(content: string): string {
  if (!content) return ''
  const doc = JSON.parse(content) as JSONContent
  const heading = doc.content?.find((node) => node.type === 'heading' && node.attrs?.level === 1)
  return (
    heading?.content
      ?.map((node) => node.text ?? '')
      .join('')
      .trim() ?? ''
  )
}

function transformImages(content: string, transform: (src: string) => string): string {
  const doc = JSON.parse(content) as JSONContent
  function walk(node: JSONContent) {
    if (node.type === 'imageNode' && node.attrs?.src)
      node.attrs.src = transform(String(node.attrs.src))
    node.content?.forEach(walk)
  }
  walk(doc)
  return JSON.stringify(doc)
}
