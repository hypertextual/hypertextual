import { parse, type JSONContent } from 'htmd-ts'
import { editorSchema } from '@hypertextual/ui/editor-schema'
import type { EditorImageUploadResult } from '@hypertextual/ui'
import { ArticleViewModel } from '../models/articleViewModel'
import { MediaService } from './mediaService'
import {
  errorMessage,
  type WorkspaceClient,
  type WorkspaceNode,
  type ArticleMetadata,
} from '../clients/workspaceClient'
import { Autosave, type SaveState } from './autosave'

export interface EditorObserver {
  titleChanged: (path: string, title: string) => void
  saved: (oldPath: string, saved: ArticleMetadata, title: string) => void
}

/** One selection and autosave lifecycle per workspace window. */
export class EditorService {
  selected = $state<WorkspaceNode | null>(null)
  document = $state.raw<ArticleViewModel | null>(null)
  image = $state<string | null>(null)
  loading = $state(false)
  openingError = $state<string | null>(null)
  codecError = $state<string | null>(null)
  save = $state<SaveState>({ status: 'saved', error: null })
  busy = $state(false)
  closing = $state(false)
  recoveryOpen = $state(false)
  copyStatus = $state('')
  version = $state(0)
  focusRequest = $state(0)
  private saver: Autosave | undefined
  private readonly media: MediaService
  private requestId = 0
  private active = true

  constructor(
    private client: WorkspaceClient,
    private observer: EditorObserver,
  ) {
    this.media = new MediaService(client)
  }

  get dirty() {
    return Boolean(this.saver?.dirty || this.codecError)
  }
  get status() {
    if (this.document?.editable) {
      if (this.codecError || this.save.error) return 'Unsaved changes'
      return this.save.status === 'saved'
        ? 'Saved'
        : this.save.status === 'saving'
          ? 'Saving…'
          : 'Changes pending…'
    }
    return this.image ? 'Image' : this.document ? 'Read-only' : 'Local files'
  }

  async flush(): Promise<boolean> {
    if (this.codecError || this.save.error) {
      this.recoveryOpen = true
      return false
    }
    return (await this.saver?.flush()) ?? true
  }

  async close(finish: () => Promise<void>): Promise<boolean> {
    if (this.closing) return false
    this.closing = true
    try {
      if (await this.flush()) {
        await finish()
        return true
      }
    } catch (error) {
      this.openingError = errorMessage(error)
    }
    this.closing = false
    return false
  }

  async open(entry: WorkspaceNode) {
    if (this.busy || this.closing || (this.selected?.path === entry.path && !this.openingError))
      return
    this.busy = true
    if (!(await this.flush())) {
      this.busy = false
      return
    }
    const id = ++this.requestId
    this.saver?.dispose()
    this.saver = undefined
    this.selected = entry
    this.document = null
    this.image = null
    this.codecError = null
    this.openingError = null
    this.copyStatus = ''
    this.loading = true
    this.busy = false
    try {
      if (entry.kind === 'unavailable')
        throw new Error('This file is unavailable or links outside the workspace.')
      if (/\.(png|jpe?g|gif|webp)$/i.test(entry.name)) {
        const asset = await this.media.get('', entry.path)
        if (this.isCurrent(id)) this.image = asset.url
        return
      }
      const read = await this.client.read(entry.path)
      if (!this.isCurrent(id)) return
      const document = this.parseDocument(read.content)
      await this.resolveImages(entry.path, document)
      if (!this.isCurrent(id)) return
      this.document = document
      this.version++
      this.observer.titleChanged(entry.path, document.title)
      this.save = { status: 'saved', error: null }
      if (!document.editable) return
      let currentPath = entry.path
      const synchronizeFilename =
        /^untitled(?:[ -]?\d+)?\.(md|htmd)$/i.test(entry.name) &&
        Boolean(document.title) &&
        document.title !== entry.name.replace(/\.(md|htmd)$/i, '')
      let persistedTitle = synchronizeFilename ? '' : document.title
      this.saver = new Autosave(
        read.content,
        read.revision,
        async (source, revision) => {
          const title = this.parseDocument(source).title || document.title
          const saved = await this.client.saveArticle(
            currentPath,
            source,
            revision,
            title === persistedTitle ? '' : title,
          )
          persistedTitle = title
          const oldPath = currentPath
          currentPath = saved.path
          this.media.relocateArticle(oldPath, saved.path)
          if (this.isCurrent(id) && this.selected) {
            this.selected = { ...this.selected, path: saved.path, name: saved.name }
            this.observer.saved(oldPath, saved, title)
          }
          return saved.revision
        },
        (state) => {
          if (this.isCurrent(id)) {
            this.save = state
            if (state.error) this.recoveryOpen = true
          }
        },
      )
      if (synchronizeFilename) await this.saver.requestSave()
    } catch (error) {
      if (this.isCurrent(id)) this.openingError = errorMessage(error)
    } finally {
      if (this.isCurrent(id)) this.loading = false
    }
  }

  change(content: JSONContent) {
    this.copyStatus = ''
    if (!this.document?.editable || this.busy || this.closing) return
    try {
      const portable = this.document.transformImages(content, (url) =>
        this.media.portableSource(this.selected?.path ?? '', url),
      )
      const change = this.document.update(portable)
      EditorService.validateDocument(portable)
      if (this.selected) this.observer.titleChanged(this.selected.path, change.title)
      this.codecError = null
      this.saver?.update(change.source)
    } catch (error) {
      if (this.selected) this.observer.titleChanged(this.selected.path, this.document.title)
      const message = errorMessage(error)
      if (this.codecError !== message) this.recoveryOpen = true
      this.codecError = message
    }
  }

  async upload(file: File): Promise<EditorImageUploadResult> {
    if (!this.selected || !this.document)
      throw new Error('Open an article before uploading images.')
    const document = this.document
    const articlePath = this.selected.path
    const asset = await this.media.upload(articlePath, file)
    if (this.document === document && this.selected && this.selected.path !== articlePath)
      this.media.relocateArticle(articlePath, this.selected.path)
    return { src: asset.url }
  }

  static validateDocument(content: JSONContent): JSONContent {
    const document = editorSchema.nodeFromJSON(content)
    document.check()
    return document.toJSON()
  }

  async copyDraft() {
    if (!this.document) return
    try {
      await navigator.clipboard.writeText(this.document.copyDraft())
      this.copyStatus = 'Draft copied'
    } catch (error) {
      this.copyStatus = errorMessage(error)
    }
  }

  async reload() {
    if (!this.selected) return
    const entry = this.selected
    this.recoveryOpen = false
    this.busy = true
    await this.saver?.discard()
    this.clear()
    this.busy = false
    await this.open(entry)
  }

  async retry() {
    if (this.codecError) return
    if ((await this.saver?.flush()) ?? true) this.recoveryOpen = false
  }

  clear() {
    ++this.requestId
    this.saver?.dispose()
    this.saver = undefined
    this.selected = null
    this.document = null
    this.image = null
    this.codecError = null
    this.save = { status: 'saved', error: null }
  }

  beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  dispose() {
    this.active = false
    this.clear()
    this.media.dispose()
  }
  private parseDocument(source: string): ArticleViewModel {
    try {
      const parsed = parse(source)
      EditorService.validateDocument(parsed.content)
      return new ArticleViewModel(source, parsed.content, parsed.issues)
    } catch {
      return new ArticleViewModel(
        source,
        null,
        [],
        'This article could not be opened. The original source is shown read-only.',
      )
    }
  }

  private async resolveImages(articlePath: string, document: ArticleViewModel) {
    const assets = await this.media.batchGet(articlePath, document.imageSources)
    const displayUrls = new Map(assets.map((asset) => [asset.source, asset.url]))
    document.displayImages((source) => displayUrls.get(source) ?? source)
  }

  private isCurrent(id: number) {
    return this.active && id === this.requestId
  }
}
