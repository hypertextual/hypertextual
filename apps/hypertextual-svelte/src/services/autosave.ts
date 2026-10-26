import { errorMessage } from '../clients/workspaceClient'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'
export interface SaveState {
  status: SaveStatus
  error: string | null
}

/** One instance per open document. Saves are serialized and each acknowledgement is revision-scoped. */
export class Autosave {
  private source: string
  private persisted: string
  private revision: string
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<boolean> | undefined
  private state: SaveState = { status: 'saved', error: null }
  private disposed = false
  private discarding = false
  private needsSave = false

  constructor(
    source: string,
    revision: string,
    private write: (source: string, revision: string) => Promise<string>,
    private changed: (state: SaveState) => void,
    private delay = 500,
  ) {
    this.source = this.persisted = source
    this.revision = revision
  }

  private notify(status: SaveStatus, error: string | null = null) {
    this.state = { status, error }
    if (!this.disposed) this.changed(this.state)
  }

  update(source: string) {
    if (this.disposed) return
    this.source = source
    clearTimeout(this.timer)
    this.notify(this.running ? 'saving' : this.dirty ? 'pending' : 'saved')
    if (!this.running && this.dirty) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.delay)
    }
  }

  get dirty() {
    return this.needsSave || this.source !== this.persisted || Boolean(this.running)
  }

  /** Persist filename metadata even when the article's source bytes are unchanged. */
  requestSave(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(true)
    this.needsSave = true
    return this.flush()
  }

  flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.running) return this.running
    if (!this.dirty) {
      this.notify('saved')
      return Promise.resolve(true)
    }
    this.running = this.drain().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  private async drain(): Promise<boolean> {
    this.notify('saving')
    while (!this.discarding && (this.needsSave || this.source !== this.persisted)) {
      const snapshot = this.source
      try {
        this.revision = await this.write(snapshot, this.revision)
        this.persisted = snapshot
        this.needsSave = false
      } catch (error) {
        this.notify('error', errorMessage(error))
        return false
      }
    }
    this.notify('saved')
    return true
  }

  /** Cancel unstarted edits and wait for the current write before a deliberate reload. */
  async discard() {
    clearTimeout(this.timer)
    this.discarding = true
    this.disposed = true
    await this.running
    this.source = this.persisted
    this.needsSave = false
  }

  dispose() {
    clearTimeout(this.timer)
    this.disposed = true
  }
}
