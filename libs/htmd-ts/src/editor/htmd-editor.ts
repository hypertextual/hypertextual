import { Editor as TiptapEditor, getSchema, type EditorOptions } from '@tiptap/core'
import { NodeSelection, type EditorState } from '@tiptap/pm/state'
import {
  DefaultEmbeddedEditorRegistry,
  isUntitledFormatFile,
  matchesFormatExtension,
  stripFormatExtension,
  type Editor,
  type EditorCounts,
  type EditorHostServices,
  type EditorMode,
} from 'core-ts'
import { parse, serialize, validateDocument } from '../lib.js'
import type { JSONContent } from '../types.js'
import { buildExtensions, createDefaultHtmdDocument } from './build-extensions.js'
import type { EditorOverlaysStorage } from './extensions/editor-overlays.js'
import type { LinkPreviewStorage } from './extensions/link-preview.js'
import {
  dispatchModalTransaction,
  enterModalCompoundBlock,
  exitModalToNormal,
  focusModalCompoundBlockControl,
  getEditorModalTarget,
  isEditorInInsertMode,
  modalKeymapPluginKey,
  setModalEditable,
  syncModalDomRegistration,
  type ModalKeymapStorage,
} from './extensions/modal-editing.js'
import { HtmdDocument } from './htmd-document.js'
import type {
  HtmdCommandMap,
  HtmdEditorKeymap,
  HtmdEditorOptions,
  HtmdNodeViewFactory,
  HtmdOverlayBinding,
  HtmdOverlayOpenOptions,
  HtmdOverlaySurfaceOptions,
  HtmdSelectionState,
  HtmdSubtextCursor,
  LinkPreviewAttributes,
  NoticeAttributes,
  UrlMentionAttributes,
} from './types.js'

const dummyNodeView: HtmdNodeViewFactory = () => () => ({
  dom:
    typeof document !== 'undefined'
      ? document.createElement('span')
      : ({
          classList: { add() {}, remove() {} },
          querySelector: () => null,
        } as unknown as HTMLElement),
})

const htmdEditorSchema = getSchema(
  buildExtensions({
    enforceTitle: false,
    nodeViews: {
      image: dummyNodeView,
      urlMention: dummyNodeView,
      linkPreview: dummyNodeView,
      codeBlock: dummyNodeView,
      notice: dummyNodeView,
    },
  }),
)

export class HtmdEditor implements Editor<JSONContent, HtmdCommandMap> {
  static readonly kind = 'htmd'
  static readonly formats = ['htmd', 'md'] as const
  static readonly scopeId = 'editor:htmd'

  static supportsFile(filename: string): boolean {
    return matchesFormatExtension(filename, HtmdEditor.formats)
  }

  static stripExtension(filename: string): string {
    return stripFormatExtension(filename, HtmdEditor.formats)
  }

  static isUntitledFile(filename: string): boolean {
    return isUntitledFormatFile(filename, HtmdEditor.formats)
  }

  static isUnsupportedFileError(message: string): boolean {
    return /Only \.md and \.htmd articles can be edited\.|not UTF-8 text|contains binary data/i.test(
      message,
    )
  }

  static validateEditorDocument(content: JSONContent): JSONContent {
    const validated = validateDocument(content)
    const docNode = htmdEditorSchema.nodeFromJSON(validated)
    docNode.check()
    return docNode.toJSON()
  }

  static deserialize(source: string): HtmdDocument {
    try {
      const parsed = parse(source)
      const docNode = htmdEditorSchema.nodeFromJSON(parsed.content)
      docNode.check()
      return new HtmdDocument(source, parsed.content, parsed.issues)
    } catch {
      return new HtmdDocument(
        source,
        null,
        [],
        'This article could not be opened. The original source is shown read-only.',
      )
    }
  }

  static serialize(
    document: JSONContent,
    options?: { originalSource?: string; format?: string },
  ): string {
    const docNode = htmdEditorSchema.nodeFromJSON(document)
    docNode.check()
    return serialize(document, { originalSource: options?.originalSource })
  }

  static extractTitle(source: string): string {
    return HtmdEditor.deserialize(source).title
  }

  readonly kind = HtmdEditor.kind
  readonly formats = HtmdEditor.formats
  readonly scopeId = HtmdEditor.scopeId
  readonly services: EditorHostServices
  readonly keymap: HtmdEditorKeymap = {}

  private tiptap!: TiptapEditor
  private options: HtmdEditorOptions
  private mountElement: HTMLElement | null = null
  private surfaceElement: HTMLElement | null = null
  private clickToEdit: boolean
  private listeners = new Set<() => void>()

  constructor(options: HtmdEditorOptions = {}) {
    this.options = options
    this.clickToEdit = options.clickToEdit ?? true
    this.surfaceElement = options.surfaceElement ?? null
    this.mountElement = options.element ?? null

    this.services = {
      hotkeys: options.services?.hotkeys,
      notifications: options.services?.notifications,
      media: options.services?.media,
      embedRegistry: options.services?.embedRegistry ?? new DefaultEmbeddedEditorRegistry(),
    }

    this.initTiptap(this.mountElement ?? undefined)
  }

  private initTiptap(element?: HTMLElement) {
    const enforceTitle = this.options.enforceTitle ?? true
    const editable = this.options.editable ?? true

    const extensions = buildExtensions({
      nodeViews: this.options.nodeViews ?? {},
      getHostEditor: () => this,
      onNotification: (notification) => {
        this.services.notifications?.notify(notification)
      },
      overlays: this.options.overlays,
      onOverlayChange: this.options.onOverlayChange,
      placeholder: this.options.placeholder,
      mentionSource: this.options.mentionSource,
      hrefBuilder: this.options.hrefBuilder,
      fetchLinkPreview: this.options.fetchLinkPreview,
      mentionRender: this.options.mentionRender,
      slashRender: this.options.slashRender,
      enforceTitle,
      headingWithId: this.options.headingWithId,
      clickToEdit: this.clickToEdit,
      editable,
      onEdit: this.options.onedit,
      onExit: this.options.onexit,
      getHotkeys: () => this.services.hotkeys,
      getScopeElement: () => this.getScopeRootElement(),
    })

    this.tiptap = new TiptapEditor({
      ...(element ? { element } : {}),
      ...({ immediatelyRender: false } as unknown as Partial<EditorOptions>),
      extensions,
      content: this.options.content ?? createDefaultHtmdDocument(enforceTitle),
      editable,
      onBeforeCreate: ({ editor }) => {
        this.tiptap = editor
      },
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) {
          this.options.onchange?.(editor.getJSON() as JSONContent)
        }
      },
      ...(this.options.editorClass
        ? {
            editorProps: {
              attributes: {
                class: this.options.editorClass,
              },
            },
          }
        : {}),
    })

    if (
      !element &&
      this.tiptap.state.plugins.length === 0 &&
      this.tiptap.extensionManager?.plugins?.length
    ) {
      ;(this.tiptap as unknown as { editorState: EditorState }).editorState =
        this.tiptap.state.reconfigure({ plugins: this.tiptap.extensionManager.plugins })
    }

    this.tiptap.on('transaction', this.notifySubscribers)
    this.tiptap.on('selectionUpdate', this.notifySubscribers)
    this.notifyUnparsedNodes(this.options.content)
    this.notifySubscribers()
  }

  private notifyUnparsedNodes(doc: JSONContent | undefined): void {
    const notify = this.services.notifications?.notify
    if (!notify || !doc) return
    const visit = (node: JSONContent) => {
      if (node.type === 'unparsedBlock' || node.type === 'unparsedInline') {
        const message = String(node.attrs?.message ?? 'Unrecognized Markdown syntax')
        notify({ level: 'warning', message })
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) visit(child)
      }
    }
    visit(doc)
  }

  private get modalStorage(): ModalKeymapStorage | undefined {
    return (this.tiptap?.storage as unknown as { modalKeymap?: ModalKeymapStorage })?.modalKeymap
  }

  private get overlaysStorage(): EditorOverlaysStorage | undefined {
    return (this.tiptap?.storage as unknown as { editorOverlays?: EditorOverlaysStorage })
      ?.editorOverlays
  }

  private getScopeRootElement(): HTMLElement | null {
    if (this.surfaceElement) {
      const region = this.surfaceElement.closest?.('[role="region"]')
      if (typeof HTMLElement !== 'undefined' && region instanceof HTMLElement) return region
      return this.surfaceElement
    }
    if (this.mountElement) {
      const region = this.mountElement.closest?.('[role="region"]')
      if (typeof HTMLElement !== 'undefined' && region instanceof HTMLElement) return region
      return this.mountElement
    }
    try {
      const dom = this.tiptap?.view?.dom
      if (typeof HTMLElement !== 'undefined' && dom instanceof HTMLElement) {
        const region = dom.closest('[role="region"]')
        if (region instanceof HTMLElement) return region
        return dom
      }
    } catch {
      // Headless view
    }
    return null
  }

  private notifySubscribers = () => {
    for (const listener of this.listeners) {
      listener()
    }
  }

  focusCompoundBlockControl(pos: number, _type?: string, control?: string, offset?: number) {
    if (!this.tiptap) return
    focusModalCompoundBlockControl(this.tiptap, pos, { control, offset })
  }

  get isEditable(): boolean {
    return this.tiptap?.isEditable ?? false
  }

  get isInsertMode(): boolean {
    if (!this.tiptap?.state) return this.options.editable ?? true
    return isEditorInInsertMode(this.tiptap)
  }

  get mode(): EditorMode {
    if (!this.tiptap?.state) return (this.options.editable ?? true) ? 'insert' : 'normal'
    const pluginState = modalKeymapPluginKey.getState(this.tiptap.state)
    return (pluginState?.mode as EditorMode | undefined) ?? (this.isEditable ? 'insert' : 'normal')
  }

  mount(element: HTMLElement): void {
    this.mountElement = element
    if (this.tiptap) {
      const currentDoc = this.getDocument()
      this.tiptap.off('transaction', this.notifySubscribers)
      this.tiptap.off('selectionUpdate', this.notifySubscribers)
      this.tiptap.destroy()
      this.options = { ...this.options, content: currentDoc }
    }
    this.initTiptap(element)
  }

  setSurfaceElement(surfaceEl: HTMLElement | null): void {
    this.surfaceElement = surfaceEl
    if (this.tiptap) {
      syncModalDomRegistration(this.tiptap)
    }
  }

  setClickToEdit(clickToEdit: boolean): void {
    this.clickToEdit = clickToEdit
    const storage = this.modalStorage
    if (storage) {
      storage.clickToInsert = clickToEdit
    }
  }

  destroy(): void {
    this.listeners.clear()
    if (this.tiptap) {
      this.tiptap.off('transaction', this.notifySubscribers)
      this.tiptap.off('selectionUpdate', this.notifySubscribers)
      this.tiptap.destroy()
    }
  }

  getDocument(): JSONContent {
    return this.tiptap.getJSON() as JSONContent
  }

  setDocument(document: JSONContent, options?: { emitUpdate?: boolean }): void {
    if (!this.tiptap.schema.nodeFromJSON(document).eq(this.tiptap.state.doc)) {
      this.tiptap.commands.setContent(document, { emitUpdate: options?.emitUpdate ?? false })
      this.notifyUnparsedNodes(document)
    }
  }

  getModalTarget() {
    if (!this.tiptap) return undefined
    return getEditorModalTarget(this.tiptap)
  }

  serialize(options?: { originalSource?: string; format?: string }): string {
    return HtmdEditor.serialize(this.getDocument(), options)
  }

  deserialize(source: string): HtmdDocument {
    return HtmdEditor.deserialize(source)
  }

  setEditable(editable: boolean): void {
    if (!this.tiptap) return
    setModalEditable(this.tiptap, editable)
  }

  focus(position?: 'start' | 'end' | number): void {
    this.tiptap.commands.focus(position ?? 'start')
  }

  blur(): void {
    this.tiptap.commands.blur()
  }

  getCounts(): EditorCounts {
    const charStorage = (
      this.tiptap?.storage as unknown as {
        characterCount?: { words: () => number; characters: () => number }
      }
    )?.characterCount
    const wordCount = charStorage?.words() || 0
    const charCount = charStorage?.characters() || 0
    const pageCount = Math.max(1, Math.ceil(wordCount / 300))
    const readDuration = Math.max(1, Math.ceil(wordCount / 250))
    return { wordCount, charCount, pageCount, readDuration }
  }

  getSelectionState(): HtmdSelectionState {
    if (!this.tiptap?.state) {
      return { from: 0, to: 0, empty: true, isNodeSelection: false, isFocused: false }
    }
    const { from, to, empty } = this.tiptap.state.selection
    return {
      from,
      to,
      empty,
      isNodeSelection: this.tiptap.state.selection instanceof NodeSelection,
      isFocused: this.tiptap.isFocused,
    }
  }

  getSubtextCursor(): HtmdSubtextCursor | null {
    if (!this.tiptap?.state) return null
    return modalKeymapPluginKey.getState(this.tiptap.state)?.subtextCursor ?? null
  }

  isActive(name: string, attributes?: Record<string, unknown>): boolean {
    if (!this.tiptap?.state) return false
    return this.tiptap.isActive(name, attributes)
  }

  getAttributes(name: string): Record<string, unknown> {
    if (!this.tiptap?.state) return {}
    return this.tiptap.getAttributes(name)
  }

  attachOverlaySurface(
    surface: HTMLElement,
    options: HtmdOverlaySurfaceOptions,
  ): HtmdOverlayBinding {
    const controller = this.overlaysStorage
    if (!controller) {
      throw new Error('Overlay surfaces require EditorOverlays extension')
    }
    return controller.attach(surface, options)
  }

  openOverlay(name: string, options?: HtmdOverlayOpenOptions): boolean {
    const cmds = this.tiptap.commands as unknown as {
      openOverlay: (name: string, options?: HtmdOverlayOpenOptions) => boolean
    }
    return cmds.openOverlay(name, options)
  }

  closeOverlay(name?: string): boolean {
    const cmds = this.tiptap.commands as unknown as {
      closeOverlay: (name?: string) => boolean
    }
    return cmds.closeOverlay(name)
  }

  private chain() {
    const hasView = Boolean((this.tiptap as unknown as { editorView?: unknown })?.editorView)
    return hasView ? this.tiptap.chain().focus() : this.tiptap.chain()
  }

  insertOrReplaceBookmark(
    position: number,
    attrs: Omit<LinkPreviewAttributes, 'type'>,
    replace = false,
  ): boolean {
    if (replace) {
      const existing = this.tiptap.state.doc.nodeAt(position)
      if (existing && existing.type.name === 'linkPreview') {
        const tr = this.tiptap.state.tr.setNodeMarkup(position, undefined, {
          ...existing.attrs,
          ...attrs,
          type: 'bookmark',
        })
        dispatchModalTransaction(this.tiptap, tr)
        return true
      }
    }
    return this.chain()
      .setTextSelection(position)
      .insertContent({
        type: 'linkPreview',
        attrs: { ...attrs, type: 'bookmark' },
      })
      .run()
  }

  insertOrReplaceImage(
    position: number,
    attrs: { src: string; srcset?: string; alt?: string; caption?: string },
    replace = false,
  ): boolean {
    if (replace) {
      const existing = this.tiptap.state.doc.nodeAt(position)
      if (existing && (existing.type.name === 'image' || existing.type.name === 'imageNode')) {
        const tr = this.tiptap.state.tr.setNodeMarkup(position, undefined, {
          ...existing.attrs,
          src: attrs.src,
          srcset: attrs.srcset ?? null,
        })
        dispatchModalTransaction(this.tiptap, tr)
        return true
      }
    }
    return this.chain()
      .setTextSelection(position)
      .insertContent({
        type: 'imageNode',
        attrs: {
          src: attrs.src,
          srcset: attrs.srcset,
          alt: attrs.alt ?? '',
          caption: attrs.caption ?? '',
        },
      })
      .run()
  }

  insertYouTubeEmbed(position: number, url: string): boolean {
    return this.chain()
      .insertContentAt(position, {
        type: 'linkPreview',
        attrs: { url, description: '', image: '', type: 'embed' },
      })
      .run()
  }

  async fetchLinkPreview(url: string): Promise<Omit<LinkPreviewAttributes, 'url' | 'type'> | null> {
    const fetcher =
      this.options.fetchLinkPreview ??
      (this.tiptap.storage as unknown as { linkPreview?: LinkPreviewStorage }).linkPreview
        ?.fetchLinkPreview
    if (!fetcher) return null
    return fetcher(url)
  }

  enterCompoundBlock(): boolean {
    if (!this.tiptap) return false
    return enterModalCompoundBlock(this.tiptap)
  }

  exitToNormal(): boolean {
    if (!this.tiptap) return false
    return exitModalToNormal(this.tiptap)
  }

  execCommand<K extends keyof HtmdCommandMap & string>(
    name: K,
    ...args: Parameters<HtmdCommandMap[K]>
  ): boolean {
    const chain = () => this.chain()
    const customCmds = this.tiptap.commands as unknown as {
      insertNotice: (attrs?: NoticeAttributes) => boolean
      insertImage: (attrs: {
        src: string
        srcset?: string
        alt?: string
        caption?: string
      }) => boolean
      insertLinkPreview: (attrs: LinkPreviewAttributes) => boolean
      insertUrlMention: (attrs: UrlMentionAttributes) => boolean
    }
    switch (name) {
      case 'toggleBold':
        return chain().toggleBold().run()
      case 'toggleItalic':
        return chain().toggleItalic().run()
      case 'toggleUnderline':
        return chain().toggleUnderline().run()
      case 'toggleStrike':
        return chain().toggleStrike().run()
      case 'toggleCode':
        return chain().toggleCode().run()
      case 'toggleBlockquote':
        return chain().toggleBlockquote().run()
      case 'toggleBulletList':
        return chain().toggleBulletList().run()
      case 'toggleOrderedList':
        return chain().toggleOrderedList().run()
      case 'toggleTaskList':
        return chain().toggleTaskList().run()
      case 'setHorizontalRule':
        return chain().setHorizontalRule().run()
      case 'setHeading':
        return chain()
          .setNode('heading', { level: args[0] as 1 | 2 | 3 | 4 | 5 | 6 })
          .run()
      case 'setParagraph':
        return chain().setNode('paragraph').run()
      case 'setCodeBlock':
        return chain()
          .setCodeBlock({ language: (args[0] as string | undefined) ?? 'plaintext' })
          .run()
      case 'setColor':
        return chain()
          .setColor(args[0] as string)
          .run()
      case 'unsetColor':
        return chain().unsetColor().run()
      case 'toggleHighlight':
        return chain()
          .toggleHighlight({ color: args[0] as string })
          .run()
      case 'unsetHighlight':
        return chain().unsetHighlight().run()
      case 'setLink':
        return chain()
          .setLink({ href: args[0] as string })
          .run()
      case 'unsetLink':
        return chain().unsetLink().run()
      case 'insertNotice':
        return customCmds.insertNotice(args[0] as NoticeAttributes | undefined)
      case 'insertImage':
        return customCmds.insertImage(
          args[0] as { src: string; srcset?: string; alt?: string; caption?: string },
        )
      case 'insertLinkPreview':
        return customCmds.insertLinkPreview(args[0] as LinkPreviewAttributes)
      case 'insertUrlMention':
        return customCmds.insertUrlMention(args[0] as UrlMentionAttributes)
      case 'openOverlay':
        return this.openOverlay(args[0] as string, args[1] as HtmdOverlayOpenOptions | undefined)
      case 'closeOverlay':
        return this.closeOverlay(args[0] as string | undefined)
      case 'enterCompoundBlock':
        return this.enterCompoundBlock()
      case 'exitToNormal':
        return this.exitToNormal()
      default:
        return false
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
