export type EditorMode = 'normal' | 'select' | 'insert' | 'jump'
export type EditorPreset = 'helix' | 'vim' | 'kakoune'
export type KeyScopePriority = 'overlay' | 'widget' | 'extension' | 'editor' | 'pane' | 'global'

export interface EditorCounts {
  wordCount: number
  charCount: number
  pageCount: number
  readDuration: number
}

export interface EditorNotification {
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  code?: string
  detail?: unknown
}

export interface EditorNotificationService {
  notify(notification: EditorNotification): void
}

export interface EditorMediaAsset {
  source: string
  url: string
  srcset?: string
  alt?: string
}

export interface EditorMediaService {
  get(source: string): Promise<EditorMediaAsset>
  batchGet(sources: readonly string[]): Promise<EditorMediaAsset[]>
  write(file: File): Promise<EditorMediaAsset>
  toPortableSource(displayUrl: string): string
}

export interface KeyBinding<TCtx = unknown> {
  id: string
  key: string
  label: string
  description?: string
  category?: string
  mode?: EditorMode | readonly EditorMode[]
  when?: (ctx: TCtx, event: KeyboardEvent) => boolean
  run: (ctx: TCtx, event: KeyboardEvent) => boolean
}

export type Keymap<TCtx = unknown> = Record<string, KeyBinding<TCtx>>

export interface KeyScopeOptions<TCtx = unknown> {
  id: string
  priority: KeyScopePriority
  element?: () => HTMLElement | null
  matchesTarget?: (target: EventTarget | null, activeElement: Element | null) => boolean
  enabled?: () => boolean
  getContext: () => TCtx
  keymap: Keymap<TCtx> | (() => Keymap<TCtx>)
}

export interface EditorHotkeyService {
  getMode(): EditorMode
  setMode(mode: EditorMode): void
  getPreset(): EditorPreset
  setPreset(preset: EditorPreset): void
  isOverlayOpen(): boolean
  subscribe(
    listener: (state: { mode: EditorMode; preset: EditorPreset; overlayOpen: boolean }) => void,
  ): () => void
  registerKeyScope<TCtx>(options: KeyScopeOptions<TCtx>): () => void
}

export interface EmbeddedEditorMountOptions<TDoc = unknown> {
  kind: string
  element: HTMLElement
  document: TDoc
  editable?: boolean
  services?: EditorHostServices
  onchange?: (document: TDoc) => void
  onExitToParent?: () => void
}

export interface EmbeddedEditorRegistry {
  register<
    TDoc = unknown,
    TCommands extends Record<string, (...args: never[]) => boolean> = Record<
      string,
      (...args: never[]) => boolean
    >,
  >(
    kind: string,
    factory: (options: EmbeddedEditorMountOptions<TDoc>) => Editor<TDoc, TCommands>,
  ): () => void
  create<TDoc = unknown>(options: EmbeddedEditorMountOptions<TDoc>): Editor<TDoc>
  supports(kind: string): boolean
}

export interface EditorParseIssue {
  code: 'unsupported-syntax' | 'invalid-syntax'
  kind: string
  message: string
  source: string
}

export interface EditorDocumentChange {
  source: string
  title: string
}

export interface EditorDocument<TDoc = unknown> {
  readonly source: string
  readonly content: TDoc | null
  readonly editable: boolean
  readonly title: string
  readonly issues: readonly EditorParseIssue[]
  readonly reason?: string
  readonly imageSources: readonly string[]
  displayImages(resolve: (source: string) => string): void
  transformImages(content: TDoc, transform: (source: string) => string): TDoc
  update(content: TDoc): EditorDocumentChange
  serialize(): string
  copyDraft(): string
}

export interface EditorFormatAdapter<TDoc = unknown> {
  readonly kind: string
  readonly formats: readonly string[]
  supportsFile(filename: string): boolean
  stripExtension(filename: string): string
  isUntitledFile(filename: string): boolean
  isUnsupportedFileError(message: string): boolean
  deserialize(source: string, format?: string): EditorDocument<TDoc>
  serialize(document: TDoc, options?: { originalSource?: string; format?: string }): string
  extractTitle(source: string): string
}

export interface EditorHostServices {
  hotkeys?: EditorHotkeyService
  notifications?: EditorNotificationService
  media?: EditorMediaService
  embedRegistry?: EmbeddedEditorRegistry
}

export interface Editor<
  TDoc = unknown,
  TCommandMap extends Record<string, (...args: never[]) => boolean> = Record<
    string,
    (...args: never[]) => boolean
  >,
> {
  readonly kind: string
  readonly formats: readonly string[]
  readonly scopeId: string
  readonly isEditable: boolean
  readonly mode: EditorMode
  readonly services: EditorHostServices
  readonly keymap: Keymap<Editor<TDoc, TCommandMap>>
  mount(element: HTMLElement): void
  destroy(): void
  getDocument(): TDoc
  setDocument(document: TDoc, options?: { emitUpdate?: boolean }): void
  serialize(options?: { originalSource?: string; format?: string }): string
  deserialize(source: string, format?: string): EditorDocument<TDoc>
  setEditable(editable: boolean): void
  focus(position?: 'start' | 'end' | number): void
  blur(): void
  getCounts(): EditorCounts
  execCommand<K extends keyof TCommandMap & string>(
    name: K,
    ...args: Parameters<TCommandMap[K]>
  ): boolean
  subscribe(listener: () => void): () => void
}
