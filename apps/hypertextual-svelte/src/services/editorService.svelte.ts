import type { EditorDocument, EditorMediaService } from 'core-ts'
import { HtmdEditor, type JSONContent } from 'htmd-ts'
import type { EditorImageUploadResult } from '@hypertextual/ui'
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
  document = $state.raw<EditorDocument<JSONContent> | null>(null)
  editable = $state(false)
  image = $state<string | null>(null)
  unsupported = $state(false)
  loading = $state(false)
  openingError = $state<string | null>(null)
  codecError = $state<string | null>(null)
  save = $state<SaveState>({ status: 'saved', error: null })
  busy = $state(false)
  closing = $state(false)
  recoveryOpen = $state(false)
  copyStatus = $state('')
  version = $state(0)
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

  get mediaService(): EditorMediaService {
    return this.media.forArticle(() => this.selected?.path ?? '')
  }

  supportsFile(filename: string): boolean {
    return HtmdEditor.supportsFile(filename)
  }

  extractTitle(source: string): string {
    return HtmdEditor.extractTitle(source)
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
    if (this.unsupported) return 'Unsupported'
    return this.image ? 'Image' : this.document ? 'Read-only' : 'Local files'
  }

  setEditable(editable: boolean): boolean {
    this.editable = editable && Boolean(this.document?.editable) && !this.busy && !this.closing
    return this.editable
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
    this.editable = false
    this.document = null
    this.image = null
    this.unsupported = false
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
      if (!HtmdEditor.supportsFile(entry.name)) {
        if (this.isCurrent(id)) this.unsupported = true
        return
      }
      const read = await this.client.read(entry.path)
      if (!this.isCurrent(id)) return
      const document = HtmdEditor.deserialize(read.content)
      await this.resolveImages(entry.path, document)
      if (!this.isCurrent(id)) return
      this.document = document
      this.version++
      this.observer.titleChanged(entry.path, document.title)
      this.save = { status: 'saved', error: null }
      if (!document.editable) return
      let currentPath = entry.path
      const synchronizeFilename =
        HtmdEditor.isUntitledFile(entry.name) &&
        Boolean(document.title) &&
        document.title !== HtmdEditor.stripExtension(entry.name)
      let persistedTitle = synchronizeFilename ? '' : document.title
      this.saver = new Autosave(
        read.content,
        read.revision,
        async (source, revision) => {
          const title = HtmdEditor.extractTitle(source) || document.title
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
      if (this.isCurrent(id)) {
        const message = errorMessage(error)
        if (HtmdEditor.isUnsupportedFileError(message)) {
          this.unsupported = true
        } else {
          this.openingError = message
        }
      }
    } finally {
      if (this.isCurrent(id)) this.loading = false
    }
  }

  async openInDefaultApp() {
    if (!this.selected) return
    try {
      await this.client.openDefaultApp(this.selected.path)
    } catch (error) {
      this.openingError = errorMessage(error)
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
    return HtmdEditor.validateEditorDocument(content)
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
    this.editable = false
    this.document = null
    this.image = null
    this.unsupported = false
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

  private async resolveImages(articlePath: string, document: EditorDocument<JSONContent>) {
    const assets = await this.media.batchGet(articlePath, document.imageSources)
    const displayUrls = new Map(assets.map((asset) => [asset.source, asset.url]))
    document.displayImages((source) => displayUrls.get(source) ?? source)
  }

  private isCurrent(id: number) {
    return this.active && id === this.requestId
  }
}
