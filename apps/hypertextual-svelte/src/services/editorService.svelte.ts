import {
  EditorDocument,
  documentTitle,
  type EditorChange,
  type EditorFailure,
} from '@hypertextual/ui'
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
  document = $state.raw<EditorDocument | null>(null)
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
  private requestId = 0
  private active = true

  constructor(
    private client: WorkspaceClient,
    private observer: EditorObserver,
  ) {}

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
        const asset = await this.client.readImage('', entry.path)
        if (this.isCurrent(id)) this.image = asset.url
        return
      }
      const read = await this.client.read(entry.path)
      if (!this.isCurrent(id)) return
      const document = await EditorDocument.open(read.content, {
        resolve: async (source) => (await this.client.readImage(entry.path, source)).url,
        upload: async (file) => {
          const asset = await this.client.importImage(
            entry.path,
            Array.from(new Uint8Array(await file.arrayBuffer())),
          )
          return { source: asset.source, src: asset.url }
        },
      })
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
          const title = documentTitle(source) || document.title
          const saved = await this.client.saveArticle(
            currentPath,
            source,
            revision,
            title === persistedTitle ? '' : title,
          )
          persistedTitle = title
          const oldPath = currentPath
          currentPath = saved.path
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

  change(change: EditorChange) {
    this.copyStatus = ''
    if (!this.document?.editable || this.busy || this.closing) return
    if (this.selected) this.observer.titleChanged(this.selected.path, change.title)
    this.codecError = null
    this.saver?.update(change.source)
  }

  fail(failure: EditorFailure) {
    this.copyStatus = ''
    if (this.selected) this.observer.titleChanged(this.selected.path, failure.title)
    if (this.codecError !== failure.message) this.recoveryOpen = true
    this.codecError = failure.message
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
  }
  private isCurrent(id: number) {
    return this.active && id === this.requestId
  }
}
