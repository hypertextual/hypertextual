import { Editor as TiptapEditor, getSchema, type EditorOptions } from '@tiptap/core'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import { registerModalEditor } from '@cloudvoyant/helical-ui'
import {
  createStandaloneHotkeyService,
  DefaultEmbeddedEditorRegistry,
  getDocumentHotkeyService,
  isUntitledFormatFile,
  matchesFormatExtension,
  stripFormatExtension,
  type Editor,
  type EditorCounts,
  type EditorHostServices,
  type EditorMode,
  type EditorPreset,
} from 'core-ts'
import type { SuggestionProps } from '@tiptap/suggestion'
import { parse, serialize, validateDocument } from '../lib.js'
import type { JSONContent } from '../types.js'
import { buildExtensions, type CompiledExtensionKeymap } from './build-extensions.js'
import type { HtmdCommandContext, HtmdInternalEditor } from './define-htmd-extension.js'
import { editorOverlaysKey, type EditorOverlaysStorage } from './extensions/editor-overlays.js'
import type { LinkPreviewStorage } from './extensions/link-preview.js'
import {
  getEditorModalTarget,
  isEditorInInsertMode,
  modalKeymapPluginKey,
  type ModalKeymapStorage,
} from './extensions/modal-keymap.js'
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
  MentionItem,
  NoticeAttributes,
  SlashCommandItem,
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

export function createHtmdEditorKeymap(): HtmdEditorKeymap {
  return {
    Enter: {
      id: 'htmd.enterCompoundBlock',
      key: 'Enter',
      label: 'Enter Compound Block',
      category: 'Editor',
      mode: 'normal',
      when: (editor, event) => {
        if (editor.isEditable) return false
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
        return true
      },
      run: (editor) => editor.execCommand('enterCompoundBlock'),
    },
    Escape: {
      id: 'htmd.exitToNormal',
      key: 'Escape',
      label: 'Exit Insert Mode',
      category: 'Editor',
      mode: 'insert',
      when: (editor) => editor.isEditable,
      run: (editor) => editor.execCommand('exitToNormal'),
    },
    'Mod-b': {
      id: 'htmd.toggleBold',
      key: 'Mod-b',
      label: 'Toggle Bold',
      category: 'Formatting',
      mode: 'insert',
      when: (editor) => editor.isEditable,
      run: (editor) => editor.execCommand('toggleBold'),
    },
    'Mod-i': {
      id: 'htmd.toggleItalic',
      key: 'Mod-i',
      label: 'Toggle Italic',
      category: 'Formatting',
      mode: 'insert',
      when: (editor) => editor.isEditable,
      run: (editor) => editor.execCommand('toggleItalic'),
    },
    'Mod-u': {
      id: 'htmd.toggleUnderline',
      key: 'Mod-u',
      label: 'Toggle Underline',
      category: 'Formatting',
      mode: 'insert',
      when: (editor) => editor.isEditable,
      run: (editor) => editor.execCommand('toggleUnderline'),
    },
  }
}

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
  readonly keymap: HtmdEditorKeymap = createHtmdEditorKeymap()

  private tiptap!: TiptapEditor
  private options: HtmdEditorOptions
  private mountElement: HTMLElement | null = null
  private surfaceElement: HTMLElement | null = null
  private clickToEdit: boolean
  private standaloneHotkeys: ReturnType<typeof createStandaloneHotkeyService> | null = null
  private scopeCleanups: Array<() => void> = []
  private modalDomCleanups: Array<() => void> = []
  private compiledExtensionKeymaps: CompiledExtensionKeymap[] = []
  private listeners = new Set<() => void>()

  constructor(options: HtmdEditorOptions = {}) {
    this.options = options
    this.clickToEdit = options.clickToEdit ?? true
    this.surfaceElement = options.surfaceElement ?? null
    this.mountElement = options.element ?? null

    const initialEditable = options.editable ?? true
    const resolvedHotkeys =
      options.services?.hotkeys ?? getDocumentHotkeyService(this.mountElement?.ownerDocument)
    if (!resolvedHotkeys) {
      this.standaloneHotkeys = createStandaloneHotkeyService({
        initialMode: initialEditable ? 'insert' : 'normal',
        initialPreset: 'helix',
        attachWindowListener: typeof window !== 'undefined',
      })
    }

    this.services = {
      hotkeys: resolvedHotkeys ?? this.standaloneHotkeys ?? undefined,
      notifications: options.services?.notifications,
      media: options.services?.media,
      embedRegistry: options.services?.embedRegistry ?? new DefaultEmbeddedEditorRegistry(),
    }

    this.initTiptap(this.mountElement ?? undefined)
  }

  private initTiptap(element?: HTMLElement) {
    const enforceTitle = this.options.enforceTitle ?? true
    const editable = this.options.editable ?? true
    this.compiledExtensionKeymaps = []

    const extensions = buildExtensions({
      nodeViews: this.options.nodeViews ?? {},
      getHostEditor: () => this,
      onExtensionKeymap: (compiled) => {
        this.compiledExtensionKeymaps.push(compiled)
      },
      onNotification: (notification) => {
        this.services.notifications?.notify(notification)
      },
      overlays: this.options.overlays,
      onOverlayChange: this.options.onOverlayChange,
      placeholder: this.options.placeholder,
      mentionSource: this.options.mentionSource,
      hrefBuilder: this.options.hrefBuilder,
      fetchLinkPreview: this.options.fetchLinkPreview,
      mentionRender: this.options.mentionRender
        ? () => {
            const renderer = this.options.mentionRender!()
            return {
              onStart: (props: SuggestionProps<MentionItem>) => {
                renderer.onStart?.({
                  items: props.items,
                  query: props.query,
                  range: props.range,
                  command: (item) => props.command(item),
                  clientRect: props.clientRect,
                })
              },
              onUpdate: (props: SuggestionProps<MentionItem>) => {
                renderer.onUpdate?.({
                  items: props.items,
                  query: props.query,
                  range: props.range,
                  command: (item) => props.command(item),
                  clientRect: props.clientRect,
                })
              },
              onKeyDown: (props: { event: KeyboardEvent }) => renderer.onKeyDown?.(props) ?? false,
              onExit: () => {
                renderer.onExit?.()
              },
            }
          }
        : undefined,
      slashRender: this.options.slashRender
        ? () => {
            const renderer = this.options.slashRender!()
            return {
              onStart: (props: SuggestionProps<SlashCommandItem>) => {
                renderer.onStart?.({
                  items: props.items,
                  query: props.query,
                  range: props.range,
                  command: (item) => props.command(item),
                  clientRect: props.clientRect,
                })
              },
              onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
                renderer.onUpdate?.({
                  items: props.items,
                  query: props.query,
                  range: props.range,
                  command: (item) => props.command(item),
                  clientRect: props.clientRect,
                })
              },
              onKeyDown: (props: { event: KeyboardEvent }) => renderer.onKeyDown?.(props) ?? false,
              onExit: () => {
                renderer.onExit?.()
              },
            }
          }
        : undefined,
      enforceTitle,
      headingWithId: this.options.headingWithId,
    })

    const defaultDoc: JSONContent = {
      type: 'doc',
      content: enforceTitle
        ? [
            { type: 'heading', attrs: { level: 1 }, content: [] },
            { type: 'paragraph', content: [] },
          ]
        : [{ type: 'paragraph', content: [] }],
    }

    this.tiptap = new TiptapEditor({
      ...(element ? { element } : {}),
      ...({ immediatelyRender: false } as unknown as Partial<EditorOptions>),
      extensions,
      content: this.options.content ?? defaultDoc,
      editable,
      onBeforeCreate: ({ editor }) => {
        this.tiptap = editor
      },
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) {
          this.options.onchange?.(editor.getJSON() as JSONContent)
        }
      },
      editorProps: {
        handleClick: (view, position, event) => {
          if (view.editable || !this.options.onedit) return false
          const target = event.target
          const bookmarkEdit =
            target instanceof Element ? target.closest<HTMLElement>('[data-bookmark-edit]') : null
          if (
            target instanceof Element &&
            !bookmarkEdit &&
            target.closest(
              'a, button, input, select, summary, iframe, [role="button"], [role="combobox"], [data-modal-ignore-pointer]',
            )
          ) {
            return false
          }
          if (!this.clickToEdit) {
            let compoundPos: number | null = null
            if (target instanceof Element) {
              view.state.doc.descendants((node, pos) => {
                if (
                  node.type.name === 'notice' ||
                  node.type.name === 'codeBlock' ||
                  node.type.name === 'image' ||
                  node.type.name === 'imageNode' ||
                  node.type.name === 'linkPreview'
                ) {
                  const nodeDom = view.nodeDOM(pos)
                  if (nodeDom instanceof HTMLElement && nodeDom.contains(target)) {
                    compoundPos = pos
                  }
                  return false
                }
                return true
              })
            }
            if (compoundPos !== null) {
              const node = view.state.doc.nodeAt(compoundPos)
              if (node && NodeSelection.isSelectable(node)) {
                view.dispatch(
                  view.state.tr.setSelection(NodeSelection.create(view.state.doc, compoundPos)),
                )
              }
            } else {
              this.tiptap.commands.setTextSelection(position)
            }
            const region = this.getScopeRootElement()
            region?.focus({ preventScroll: true })
            return true
          }
          if (!this.options.onedit()) return false
          this.tiptap.setEditable(true)
          try {
            this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta('editableChanged', true))
          } catch {
            // Ignore
          }
          const preset = this.services.hotkeys?.getPreset() ?? 'helix'
          getEditorModalTarget(this.internalEditor)?.setModalState({
            mode: 'insert',
            preset,
          })
          this.services.hotkeys?.setMode('insert')
          if (bookmarkEdit) {
            queueMicrotask(() => bookmarkEdit.click())
            return true
          }
          this.tiptap.commands.setTextSelection(position)
          view.focus()
          return true
        },
        ...(this.options.editorClass
          ? {
              attributes: {
                class: this.options.editorClass,
              },
            }
          : {}),
      },
    })

    const storage = this.modalStorage
    if (storage) {
      storage.clickToInsert = this.clickToEdit
    }

    const target = getEditorModalTarget(this.internalEditor)
    if (target) {
      const preset = this.services.hotkeys?.getPreset() ?? 'helix'
      target.setModalState({
        mode: editable ? 'insert' : 'normal',
        preset,
      })
    }

    this.tiptap.on('transaction', this.handleTransaction)
    this.tiptap.on('selectionUpdate', this.notifySubscribers)
    this.registerScopes()
    this.syncModalDomRegistration()
    this.notifySubscribers()
  }

  private get internalEditor(): HtmdInternalEditor {
    return this.tiptap as unknown as HtmdInternalEditor
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
      const region = this.surfaceElement.closest('[role="region"]')
      if (region instanceof HTMLElement) return region
      return this.surfaceElement
    }
    if (this.mountElement) {
      const region = this.mountElement.closest('[role="region"]')
      if (region instanceof HTMLElement) return region
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

  private registerScopes() {
    for (const cleanup of this.scopeCleanups) cleanup()
    this.scopeCleanups = []

    const hotkeys = this.services.hotkeys
    if (!hotkeys) return

    this.scopeCleanups.push(
      hotkeys.registerKeyScope({
        id: this.scopeId,
        priority: 'editor',
        element: () => this.getScopeRootElement(),
        matchesTarget: (target) =>
          typeof Element !== 'undefined' &&
          target instanceof Element &&
          Boolean(target.closest('[data-editor-controls]')),
        getContext: () => this as Editor<JSONContent, HtmdCommandMap>,
        keymap: () => this.keymap,
      }),
    )

    for (const extKeymap of this.compiledExtensionKeymaps) {
      this.scopeCleanups.push(
        hotkeys.registerKeyScope<HtmdCommandContext>({
          id: `extension:${extKeymap.name}`,
          priority: 'extension',
          element: () => this.getScopeRootElement(),
          enabled: () => Boolean(extKeymap.getContext()),
          getContext: () => extKeymap.getContext()!,
          keymap: () => extKeymap.getKeymap(),
        }),
      )
    }

    this.scopeCleanups.push(
      hotkeys.subscribe(({ preset }) => {
        const target = getEditorModalTarget(this.internalEditor)
        const currentMode = this.mode
        if (target) {
          target.setModalState({ mode: currentMode, preset: preset as EditorPreset })
        }
      }),
    )
  }

  private syncModalDomRegistration() {
    for (const cleanup of this.modalDomCleanups) cleanup()
    this.modalDomCleanups = []

    const target = getEditorModalTarget(this.internalEditor)
    if (!target) return

    const registerEl = (el: HTMLElement) => {
      this.modalDomCleanups.push(registerModalEditor(el, target))
      if (this.services.hotkeys?.registerModalTarget) {
        this.modalDomCleanups.push(this.services.hotkeys.registerModalTarget(el, target))
      }
    }

    if (this.surfaceElement) {
      registerEl(this.surfaceElement)
      const region = this.surfaceElement.closest('[role="region"]')
      if (region instanceof HTMLElement && region !== this.surfaceElement) {
        registerEl(region)
      }
    } else if (this.mountElement) {
      registerEl(this.mountElement)
    }
  }

  private notifySubscribers = () => {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private handleTransaction = () => {
    this.syncModalEditableState()
    this.notifySubscribers()
  }

  private syncModalEditableState() {
    if (!this.tiptap) return
    if (this.services.hotkeys?.isOverlayOpen()) return
    const active = typeof document !== 'undefined' ? document.activeElement : null
    const scopeEl = this.surfaceElement ?? this.mountElement
    if (
      active &&
      scopeEl &&
      !scopeEl.contains(active) &&
      !active.contains(scopeEl) &&
      active.closest('[data-pane-id], [data-which-key-explorer], [data-part="node-rename-input"]')
    ) {
      return
    }
    const pluginState = modalKeymapPluginKey.getState(this.tiptap.state)
    if (!pluginState) return
    if (pluginState.mode === 'insert' && !this.tiptap.isEditable) {
      if (!this.options.onedit || this.options.onedit()) {
        this.tiptap.setEditable(true)
        this.services.hotkeys?.setMode('insert')
        try {
          this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta('editableChanged', true))
        } catch {
          // Ignore
        }
        const storage = this.modalStorage
        const sel = this.tiptap.state.selection
        if (storage?.focusControlRequest) {
          const req = storage.focusControlRequest
          storage.focusControlRequest = null
          this.focusCompoundBlockControl(req.pos, req.type, req.control, req.offset)
        } else if (
          sel instanceof NodeSelection &&
          (sel.node.type.name === 'image' ||
            sel.node.type.name === 'imageNode' ||
            sel.node.type.name === 'linkPreview')
        ) {
          this.focusCompoundBlockControl(sel.from, sel.node.type.name)
        } else {
          this.tiptap.view.focus()
        }
      }
    } else if (pluginState.mode !== 'insert' && this.tiptap.isEditable) {
      this.options.onexit?.()
      this.tiptap.setEditable(false)
      this.services.hotkeys?.setMode(pluginState.mode as EditorMode)
      try {
        this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta('editableChanged', false))
      } catch {
        // Ignore
      }
    }
  }

  focusCompoundBlockControl(pos: number, type: string, control?: string, offset?: number) {
    const run = () => {
      if (!this.tiptap || this.tiptap.isDestroyed) return
      const dom = this.tiptap.view.nodeDOM(pos)
      if (!(dom instanceof HTMLElement)) return
      if (type === 'notice') {
        if (control === 'type') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Notice type"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return
          }
        }
        const input = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
        }
      } else if (type === 'codeBlock') {
        if (control === 'language') {
          const trigger = dom.querySelector<HTMLElement>(
            '[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]',
          )
          if (trigger) {
            trigger.focus()
            return
          }
        }
        this.tiptap.commands.setTextSelection(pos + 1)
        this.tiptap.view.focus()
      } else if (type === 'image' || type === 'imageNode') {
        const input = dom.querySelector<HTMLInputElement>(
          'input.caption-input, input[aria-label="Image caption"]',
        )
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
        }
      } else if (type === 'linkPreview') {
        if (control === 'dialog') {
          const bookmarkEdit = dom.querySelector<HTMLElement>('[data-bookmark-edit]')
          if (bookmarkEdit) {
            bookmarkEdit.click()
            return
          }
        }
        const input = dom.querySelector<HTMLInputElement>(
          'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]',
        )
        if (input) {
          input.focus()
          const caret =
            typeof offset === 'number'
              ? Math.max(0, Math.min(input.value.length, offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
          return
        }
        const action = dom.querySelector<HTMLElement>(
          'button[aria-label="Play video"], a.bookmark-card-edit, button[aria-label="Remove preview"]',
        )
        action?.focus()
      }
    }
    queueMicrotask(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run)
      } else {
        run()
      }
    })
  }

  get isEditable(): boolean {
    return this.tiptap?.isEditable ?? false
  }

  get isInsertMode(): boolean {
    if (!this.tiptap?.state) return this.options.editable ?? true
    return isEditorInInsertMode(this.internalEditor)
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
      this.tiptap.off('transaction', this.handleTransaction)
      this.tiptap.off('selectionUpdate', this.notifySubscribers)
      this.tiptap.destroy()
      this.options = { ...this.options, content: currentDoc }
    }
    this.initTiptap(element)
  }

  setSurfaceElement(surfaceEl: HTMLElement | null): void {
    this.surfaceElement = surfaceEl
    this.syncModalDomRegistration()
  }

  setClickToEdit(clickToEdit: boolean): void {
    this.clickToEdit = clickToEdit
    const storage = this.modalStorage
    if (storage) {
      storage.clickToInsert = clickToEdit
    }
  }

  destroy(): void {
    for (const cleanup of this.scopeCleanups) cleanup()
    this.scopeCleanups = []
    for (const cleanup of this.modalDomCleanups) cleanup()
    this.modalDomCleanups = []
    this.listeners.clear()
    if (this.tiptap) {
      this.tiptap.off('transaction', this.handleTransaction)
      this.tiptap.off('selectionUpdate', this.notifySubscribers)
      this.tiptap.destroy()
    }
    this.standaloneHotkeys?.destroy()
    this.standaloneHotkeys = null
  }

  getDocument(): JSONContent {
    return this.tiptap.getJSON() as JSONContent
  }

  setDocument(document: JSONContent, options?: { emitUpdate?: boolean }): void {
    if (!this.tiptap.schema.nodeFromJSON(document).eq(this.tiptap.state.doc)) {
      this.tiptap.commands.setContent(document, { emitUpdate: options?.emitUpdate ?? false })
    }
  }

  serialize(options?: { originalSource?: string; format?: string }): string {
    return HtmdEditor.serialize(this.getDocument(), options)
  }

  deserialize(source: string): HtmdDocument {
    return HtmdEditor.deserialize(source)
  }

  setEditable(editable: boolean): void {
    if (!this.tiptap) return
    const editableChanged = this.tiptap.isEditable !== editable
    this.tiptap.setEditable(editable)
    if (editableChanged) {
      try {
        this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta('editableChanged', editable))
      } catch {
        // Ignore if view is not yet mounted
      }
    }
    const target = getEditorModalTarget(this.internalEditor)
    const currentMode = modalKeymapPluginKey.getState(this.tiptap.state)?.mode ?? 'insert'
    const preset = this.services.hotkeys?.getPreset() ?? 'helix'
    const storage = this.modalStorage

    if (editable) {
      if (currentMode !== 'insert') {
        target?.setModalState({ mode: 'insert', preset })
      }
      if (this.services.hotkeys && this.services.hotkeys.getMode() !== 'insert') {
        this.services.hotkeys.setMode('insert')
      }
      const sel = this.tiptap.state.selection
      if (storage?.focusControlRequest) {
        const req = storage.focusControlRequest
        storage.focusControlRequest = null
        this.focusCompoundBlockControl(req.pos, req.type, req.control, req.offset)
      } else if (
        sel instanceof NodeSelection &&
        (sel.node.type.name === 'image' ||
          sel.node.type.name === 'imageNode' ||
          sel.node.type.name === 'linkPreview')
      ) {
        this.focusCompoundBlockControl(sel.from, sel.node.type.name)
      }
    } else {
      const activeOverlay = editorOverlaysKey.getState(this.tiptap.state)
      if (activeOverlay) {
        this.closeOverlay(activeOverlay.name)
      }
      if (currentMode === 'insert') {
        target?.setModalState({ mode: 'normal', preset })
      }
      if (this.services.hotkeys && this.services.hotkeys.getMode() === 'insert') {
        this.services.hotkeys.setMode('normal')
      }
    }
  }

  focus(position?: 'start' | 'end' | number): void {
    this.tiptap.commands.focus(position ?? 'start')
  }

  focusPosition(position: number): void {
    const clamped = Math.max(0, Math.min(this.tiptap.state.doc.content.size, position))
    this.tiptap.commands.setTextSelection(clamped)
    this.tiptap.view.focus()
  }

  focusBeforePosition(position: number): void {
    const clamped = Math.max(0, Math.min(this.tiptap.state.doc.content.size, position))
    const selection = Selection.findFrom(this.tiptap.state.doc.resolve(clamped), -1, true)
    if (!selection) return
    this.tiptap.commands.setTextSelection(selection.from)
    this.tiptap.view.focus()
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
    return this.internalEditor.commands.openOverlay(name, options)
  }

  closeOverlay(name?: string): boolean {
    return this.internalEditor.commands.closeOverlay(name)
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
        this.tiptap.view.dispatch(tr)
        return true
      }
    }
    return this.internalEditor
      .chain()
      .focus()
      .setTextSelection(position)
      .insertLinkPreview({ ...attrs, type: 'bookmark' })
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
        this.tiptap.view.dispatch(tr)
        return true
      }
    }
    return this.internalEditor
      .chain()
      .focus()
      .setTextSelection(position)
      .insertImage({
        src: attrs.src,
        srcset: attrs.srcset,
        alt: attrs.alt ?? '',
        caption: attrs.caption ?? '',
      })
      .run()
  }

  insertYouTubeEmbed(position: number, url: string): boolean {
    return this.internalEditor
      .chain()
      .focus()
      .insertContentAt(position, {
        type: 'linkPreview',
        attrs: { url, description: '', image: '', type: 'embed' },
      })
      .run()
  }

  splitImageCaptionToParagraph(posAfter: number, rightText: string): boolean {
    return this.internalEditor
      .chain()
      .focus()
      .insertContentAt(posAfter, {
        type: 'paragraph',
        content: rightText ? [{ type: 'text', text: rightText }] : [],
      })
      .setTextSelection(posAfter + 1)
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
    if (!this.tiptap || this.tiptap.isEditable) return false
    const sel = this.tiptap.state.selection
    const pluginState = modalKeymapPluginKey.getState(this.tiptap.state)
    let blockPos: number | null = null
    let blockType: string | null = null
    let control: string | undefined
    let offset: number | undefined
    if (pluginState?.subtextCursor) {
      blockPos = pluginState.subtextCursor.pos
      offset = pluginState.subtextCursor.offset
      if (pluginState.subtextCursor.kind === 'noticeTitle') {
        blockType = 'notice'
        control = 'type'
      } else if (pluginState.subtextCursor.kind === 'linkPreviewUrl') {
        blockType = 'linkPreview'
        control = 'url'
      } else {
        blockType = 'image'
        control = 'caption'
      }
    } else if (
      sel instanceof NodeSelection &&
      (sel.node.type.name === 'notice' ||
        sel.node.type.name === 'codeBlock' ||
        sel.node.type.name === 'image' ||
        sel.node.type.name === 'imageNode' ||
        sel.node.type.name === 'linkPreview')
    ) {
      blockPos = sel.from
      blockType = sel.node.type.name
      if (blockType === 'codeBlock') control = 'language'
    } else {
      const resolvedFrom = sel.$from
      for (let d = resolvedFrom.depth; d >= 1; d -= 1) {
        const name = resolvedFrom.node(d).type.name
        if (name === 'notice') {
          blockPos = resolvedFrom.before(d)
          blockType = 'notice'
          control = 'type'
          break
        }
        if (name === 'codeBlock') {
          blockPos = resolvedFrom.before(d)
          blockType = 'codeBlock'
          control = 'language'
          break
        }
      }
    }
    if (blockPos === null || !blockType) return false
    if (this.options.onedit && !this.options.onedit()) return false

    const storage = this.modalStorage
    if (storage) {
      storage.activeCompoundBlockPos = blockPos
    }
    this.tiptap.setEditable(true)
    const preset = this.services.hotkeys?.getPreset() ?? 'helix'
    getEditorModalTarget(this.internalEditor)?.setModalState({ mode: 'insert', preset })
    this.services.hotkeys?.setMode('insert')
    try {
      this.tiptap.view.dispatch(this.tiptap.state.tr.setMeta('editableChanged', true))
    } catch {
      // Ignore
    }

    this.focusCompoundBlockControl(blockPos, blockType, control, offset)
    return true
  }

  exitToNormal(): boolean {
    if (!this.tiptap) return false
    this.options.onexit?.()
    this.setEditable(false)
    this.services.hotkeys?.setMode('normal')
    return true
  }

  execCommand<K extends keyof HtmdCommandMap & string>(
    name: K,
    ...args: Parameters<HtmdCommandMap[K]>
  ): boolean {
    const chain = () => this.tiptap.chain().focus()
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
        return this.internalEditor.commands.insertNotice(args[0] as NoticeAttributes | undefined)
      case 'insertImage':
        return this.internalEditor.commands.insertImage(
          args[0] as { src: string; srcset?: string; alt?: string; caption?: string },
        )
      case 'insertLinkPreview':
        return this.internalEditor.commands.insertLinkPreview(args[0] as LinkPreviewAttributes)
      case 'insertUrlMention':
        return this.internalEditor.commands.insertUrlMention(args[0] as UrlMentionAttributes)
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
