import type { EditorDocument, EditorDocumentChange } from 'core-ts'
import { serialize } from '../lib.js'
import type { JSONContent, ParseIssue } from '../types.js'

/** In-memory source, draft, and display state for one HTMD/Markdown document. */
export class HtmdDocument implements EditorDocument<JSONContent> {
  content: JSONContent | null
  private draft: JSONContent | null

  constructor(
    readonly source: string,
    content: JSONContent | null,
    readonly issues: readonly ParseIssue[] = [],
    readonly reason?: string,
  ) {
    this.content = content
    this.draft = content
  }

  get editable(): boolean {
    return this.draft !== null
  }

  get title(): string {
    return HtmdDocument.extractTitleFromContent(this.draft)
  }

  static extractTitleFromContent(content: JSONContent | null | undefined): string {
    const heading = content?.content?.find(
      (node) => node.type === 'heading' && node.attrs?.level === 1,
    )
    const text = (node: JSONContent): string => node.text ?? node.content?.map(text).join('') ?? ''
    return heading ? text(heading).trim() : ''
  }

  get imageSources(): string[] {
    const sources = new Set<string>()
    if (this.draft) {
      this.transformImages(this.draft, (source) => {
        sources.add(source)
        return source
      })
    }
    return [...sources]
  }

  displayImages(resolve: (source: string) => string): void {
    if (this.draft) this.content = this.transformImages(this.draft, resolve)
  }

  update(content: JSONContent): EditorDocumentChange {
    // Keep invalid drafts available for recovery before serialization can fail.
    this.draft = content
    return { source: this.serialize(), title: this.title }
  }

  serialize(): string {
    if (!this.draft) throw new Error(this.reason ?? 'This article is read-only.')
    return serialize(this.draft, { originalSource: this.source })
  }

  copyDraft(): string {
    try {
      return this.serialize()
    } catch {
      return this.draft ? JSON.stringify(this.draft) : this.source
    }
  }

  transformImages(document: JSONContent, transform: (source: string) => string): JSONContent {
    const walk = (node: JSONContent): JSONContent => ({
      ...node,
      ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
      ...(node.content ? { content: node.content.map(walk) } : {}),
    })
    const cloned = walk(document)
    const visit = (node: JSONContent) => {
      if (node.type === 'imageNode' && node.attrs?.src) {
        node.attrs.src = transform(String(node.attrs.src))
      }
      node.content?.forEach(visit)
    }
    visit(cloned)
    return cloned
  }
}
