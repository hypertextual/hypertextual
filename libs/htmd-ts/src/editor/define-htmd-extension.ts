import {
  defineEditorExtension,
  type EditorExtension,
  type EditorExtensionSpec,
  type Keymap,
} from 'core-ts'
import type { DOMOutputSpec, Node as PMNode, ParseRule, Schema } from '@tiptap/pm/model'
import {
  NodeSelection,
  Selection,
  type EditorState,
  type Plugin,
  type Transaction,
} from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

import type { LinkPreviewAttributes, NoticeAttributes, UrlMentionAttributes } from './types.js'

export interface HtmdInternalChain {
  focus: (position?: 'start' | 'end' | number | boolean | null) => HtmdInternalChain
  deleteRange: (range: { from: number; to: number }) => HtmdInternalChain
  setNode: (typeOrName: string, attributes?: Record<string, unknown>) => HtmdInternalChain
  setTextSelection: (position: number | { from: number; to: number }) => HtmdInternalChain
  insertContent: (value: unknown) => HtmdInternalChain
  insertContentAt: (
    position: number | { from: number; to: number },
    value: unknown,
  ) => HtmdInternalChain
  command: (
    fn: (props: {
      tr: Transaction
      state: EditorState
      dispatch?: (tr: Transaction) => void
    }) => boolean,
  ) => HtmdInternalChain
  toggleBlockquote: () => HtmdInternalChain
  toggleBulletList: () => HtmdInternalChain
  toggleOrderedList: () => HtmdInternalChain
  toggleTaskList: () => HtmdInternalChain
  setHorizontalRule: () => HtmdInternalChain
  setCodeBlock: (attributes?: { language?: string }) => HtmdInternalChain
  insertNotice: (attributes?: NoticeAttributes) => HtmdInternalChain
  insertImage: (attributes: {
    src: string
    srcset?: string
    alt?: string
    caption?: string
  }) => HtmdInternalChain
  insertLinkPreview: (attributes: LinkPreviewAttributes) => HtmdInternalChain
  insertUrlMention: (attributes: UrlMentionAttributes) => HtmdInternalChain
  openOverlay: (name: string, options?: { position?: number; data?: unknown }) => HtmdInternalChain
  closeOverlay: (name?: string) => HtmdInternalChain
  run: () => boolean
}

export interface HtmdInternalEditor {
  readonly state: EditorState
  readonly view: EditorView
  readonly schema: Schema
  readonly isEditable: boolean
  readonly isFocused: boolean
  readonly isDestroyed: boolean
  readonly storage: Record<string, unknown>
  readonly extensionManager?: {
    plugins?: Plugin[]
    attributes?: unknown[]
  }
  readonly commands: {
    insertContent: (value: unknown) => boolean
    insertContentAt: (position: number | { from: number; to: number }, value: unknown) => boolean
    deleteRange: (range: { from: number; to: number }) => boolean
    setNode: (typeOrName: string, attributes?: Record<string, unknown>) => boolean
    setTextSelection: (position: number | { from: number; to: number }) => boolean
    focus: (position?: 'start' | 'end' | number | boolean | null) => boolean
    openOverlay: (name: string, options?: { position?: number; data?: unknown }) => boolean
    closeOverlay: (name?: string) => boolean
    insertNotice: (attributes?: NoticeAttributes) => boolean
    insertImage: (attributes: {
      src: string
      srcset?: string
      alt?: string
      caption?: string
    }) => boolean
    insertLinkPreview: (attributes: LinkPreviewAttributes) => boolean
    insertUrlMention: (attributes: UrlMentionAttributes) => boolean
    undo?: () => boolean
    redo?: () => boolean
  }
  chain: () => HtmdInternalChain
  isActive: (name: string, attributes?: Record<string, unknown>) => boolean
  getAttributes: (name: string) => Record<string, unknown>
  on: (event: string, listener: (...args: never[]) => void) => void
  off: (event: string, listener: (...args: never[]) => void) => void
}

export interface HtmdCommandContext {
  editor: HtmdInternalEditor
  state: EditorState
  view: EditorView
  tr: Transaction
  dispatch?: (tr: Transaction) => void
  commands: HtmdInternalEditor['commands']
  chain: () => HtmdInternalChain
}

export interface HtmdAttributeSpec {
  default?: unknown
  rendered?: boolean
  parseHTML?: (element: HTMLElement) => unknown
  renderHTML?: (attributes: Record<string, unknown>) => Record<string, unknown>
}

export interface HtmdExtensionSpec<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean> =
    Record<string, never>,
> extends Omit<
  EditorExtensionSpec<TOptions, TStorage, HtmdCommandContext, TCommands>,
  'keymap' | 'onCreate'
> {
  base?: 'heading' | 'codeBlockLowlight' | 'mention'
  group?: string
  content?: string
  inline?: boolean
  atom?: boolean
  code?: boolean
  marks?: string
  defining?: boolean
  selectable?: boolean
  attributes?: Record<string, HtmdAttributeSpec>
  parseHTML?: () => ParseRule[]
  renderHTML?: (props: {
    node: PMNode
    HTMLAttributes: Record<string, unknown>
    options: TOptions
  }) => DOMOutputSpec
  pmPlugins?: (ctx: {
    editor: HtmdInternalEditor
    options: TOptions
    storage: TStorage
  }) => Plugin[]
  onBeforeCreate?: (ctx: {
    editor: HtmdInternalEditor
    options: TOptions
    storage: TStorage
  }) => void
  onCreate?: (ctx: { editor: HtmdInternalEditor; options: TOptions; storage: TStorage }) => void
  keymap?: (ctx: {
    editor: HtmdInternalEditor
    options: TOptions
    storage: TStorage
  }) => Keymap<HtmdCommandContext>
}

export interface HtmdExtension<
  TOptions = unknown,
  TStorage = unknown,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean> =
    Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean>,
> extends Omit<
  EditorExtension<TOptions, TStorage, HtmdCommandContext, TCommands>,
  'spec' | 'configure' | 'extend'
> {
  readonly spec: HtmdExtensionSpec<TOptions, TStorage, TCommands>
  configure(options: Partial<TOptions>): HtmdExtension<TOptions, TStorage, TCommands>
  extend<
    TNextOptions extends TOptions = TOptions,
    TNextStorage extends TStorage = TStorage,
    TNextCommands extends Record<
      string,
      (...args: never[]) => (ctx: HtmdCommandContext) => boolean
    > = TCommands,
  >(
    overrides: Partial<HtmdExtensionSpec<TNextOptions, TNextStorage, TNextCommands>>,
  ): HtmdExtension<TNextOptions, TNextStorage, TNextCommands>
}

export function defineHtmdExtension<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean> =
    Record<string, never>,
>(
  spec: HtmdExtensionSpec<TOptions, TStorage, TCommands>,
): HtmdExtension<TOptions, TStorage, TCommands> {
  return defineEditorExtension(
    spec as unknown as EditorExtensionSpec<TOptions, TStorage, HtmdCommandContext, TCommands>,
  ) as HtmdExtension<TOptions, TStorage, TCommands>
}

export function mergeHtmlAttributes(
  ...objects: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const item of objects) {
    if (!item) continue
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || value === null) continue
      if (key === 'class' && typeof merged.class === 'string' && typeof value === 'string') {
        const classes = new Set(
          [...merged.class.split(/\s+/), ...value.split(/\s+/)].filter(Boolean),
        )
        merged.class = [...classes].join(' ')
      } else if (key === 'style' && typeof merged.style === 'string' && typeof value === 'string') {
        merged.style = `${merged.style.replace(/;?\s*$/, '')}; ${value}`
      } else {
        merged[key] = value
      }
    }
  }
  return merged
}

export function isAtFirstVisualLine(view: EditorView, state: EditorState): boolean {
  const { selection } = state
  if (!selection.empty || !selection.$from.parent.isTextblock) return false
  const { $from } = selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset)
  if (textBefore.includes('\n')) return false
  let hasHardBreakBefore = false
  $from.parent.nodesBetween(0, $from.parentOffset, (node) => {
    if (node.type.name === 'hardBreak') hasHardBreakBefore = true
  })
  if (hasHardBreakBefore) return false
  try {
    const cursorCoords = view.coordsAtPos(selection.from)
    const startCoords = view.coordsAtPos($from.start())
    if (cursorCoords.top > startCoords.top + 2) return false
  } catch {
    // Headless environment without layout coordinates
  }
  return true
}

export function isAtLastVisualLine(view: EditorView, state: EditorState): boolean {
  const { selection } = state
  if (!selection.empty || !selection.$from.parent.isTextblock) return false
  const { $from } = selection
  const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size)
  if (textAfter.includes('\n')) return false
  let hasHardBreakAfter = false
  $from.parent.nodesBetween($from.parentOffset, $from.parent.content.size, (node) => {
    if (node.type.name === 'hardBreak') hasHardBreakAfter = true
  })
  if (hasHardBreakAfter) return false
  try {
    const cursorCoords = view.coordsAtPos(selection.from)
    const endCoords = view.coordsAtPos($from.end())
    if (cursorCoords.top < endCoords.top - 2) return false
  } catch {
    // Headless environment without layout coordinates
  }
  return true
}

export function findNextBlockPos(state: EditorState): number | null {
  const { selection } = state
  if (selection instanceof NodeSelection) {
    return selection.to < state.doc.content.size ? selection.to : null
  }
  const { $from } = selection
  for (let d = $from.depth; d >= 1; d -= 1) {
    const afterPos = $from.after(d)
    if (d === 1 || afterPos < $from.end(d - 1)) {
      return afterPos < state.doc.content.size ? afterPos : null
    }
  }
  return null
}

export function findPrevBlockPos(state: EditorState): number | null {
  const { selection } = state
  if (selection instanceof NodeSelection) {
    if (selection.from <= 0) return null
    const prev = state.doc.resolve(selection.from).nodeBefore
    return prev ? selection.from - prev.nodeSize : null
  }
  const { $from } = selection
  for (let d = $from.depth; d >= 1; d -= 1) {
    const beforePos = $from.before(d)
    if (d === 1 || beforePos > $from.start(d - 1)) {
      if (beforePos <= 0) return null
      const prev = state.doc.resolve(beforePos).nodeBefore
      return prev ? beforePos - prev.nodeSize : null
    }
  }
  return null
}

export function focusBlockAtPos(
  editor: HtmdInternalEditor,
  pos: number,
  direction: 'down' | 'up',
  allowTextblockFallback = false,
): boolean {
  const { doc } = editor.state
  if (pos < 0 || pos >= doc.content.size) return false
  const node = doc.nodeAt(pos)
  if (!node) return false
  const dom = editor.view?.nodeDOM(pos)
  const modalStorage = (
    editor.storage as { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
  )?.modalKeymap

  if (node.type.name === 'codeBlock') {
    if (modalStorage) modalStorage.activeCompoundBlockPos = pos
    if (direction === 'down') {
      const targetPos = Math.min(pos + 1, doc.content.size)
      if (editor.state.selection.from !== targetPos) {
        editor.commands.setTextSelection(targetPos)
      }
      if (dom instanceof HTMLElement) {
        const trigger = dom.querySelector<HTMLElement>(
          '[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]',
        )
        if (trigger) {
          trigger.focus()
          return true
        }
      }
      editor.view?.focus()
      return true
    }
    const endPos = Math.max(pos + 1, pos + node.nodeSize - 1)
    editor.commands.setTextSelection(endPos)
    editor.view?.focus()
    return true
  }

  if (node.type.name === 'notice') {
    if (modalStorage) modalStorage.activeCompoundBlockPos = pos
    if (direction === 'down') {
      const targetPos = Math.min(pos + 2, doc.content.size)
      if (editor.state.selection.from !== targetPos) {
        editor.commands.setTextSelection(targetPos)
      }
      if (dom instanceof HTMLElement) {
        const titleInput = dom.querySelector<HTMLInputElement>('input[aria-label="Notice title"]')
        if (titleInput) {
          titleInput.focus()
          return true
        }
      }
      editor.view?.focus()
      return true
    }
    const selection = Selection.findFrom(doc.resolve(pos + node.nodeSize - 1), -1, true)
    if (selection) {
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    }
    return false
  }

  if (node.type.name === 'imageNode' || node.type.name === 'image') {
    if (dom instanceof HTMLElement) {
      const input = dom.querySelector<HTMLInputElement>(
        'input.caption-input, input[aria-label="Image caption"]',
      )
      if (input) {
        if (modalStorage) modalStorage.activeCompoundBlockPos = pos
        const nearPos =
          direction === 'up' ? Math.max(0, pos) : Math.min(pos + node.nodeSize, doc.content.size)
        const sel = Selection.findFrom(doc.resolve(nearPos), direction === 'up' ? -1 : 1, true)
        if (sel) {
          editor.commands.setTextSelection(sel.from)
        }
        input.focus({ preventScroll: true })
        return true
      }
    }
    return false
  }

  if (node.type.name === 'linkPreview') {
    if (dom instanceof HTMLElement) {
      const input = dom.querySelector<HTMLInputElement>(
        'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]',
      )
      if (input) {
        if (modalStorage) modalStorage.activeCompoundBlockPos = pos
        const nearPos =
          direction === 'up' ? Math.max(0, pos) : Math.min(pos + node.nodeSize, doc.content.size)
        const sel = Selection.findFrom(doc.resolve(nearPos), direction === 'up' ? -1 : 1, true)
        if (sel) {
          editor.commands.setTextSelection(sel.from)
        }
        input.focus({ preventScroll: true })
        return true
      }
    }
    return false
  }

  if (allowTextblockFallback) {
    const resolvedPos = direction === 'down' ? pos : Math.min(pos + node.nodeSize, doc.content.size)
    const selection = Selection.findFrom(
      doc.resolve(resolvedPos),
      direction === 'down' ? 1 : -1,
      true,
    )
    if (selection) {
      if (modalStorage) modalStorage.activeCompoundBlockPos = null
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    }
  }

  return false
}

export function findNodeViewControl(
  state: EditorState,
  event: KeyboardEvent,
  nodeTypeName: string,
): { target: HTMLElement; wrapper: HTMLElement; pos: number; node: PMNode } | null {
  if (!(event.target instanceof HTMLElement)) return null
  const wrapper = event.target.closest<HTMLElement & { __htmdGetPos?: () => number | undefined }>(
    `.node-${nodeTypeName}`,
  )
  if (!wrapper || !event.target.closest('[contenteditable="false"]')) return null
  const pos = wrapper.__htmdGetPos?.()
  if (typeof pos !== 'number') return null
  const node = state.doc.nodeAt(pos)
  if (!node || node.type.name !== nodeTypeName) return null
  return { target: event.target, wrapper, pos, node }
}

export function focusTextPosition(editor: HtmdInternalEditor, position: number): boolean {
  const clamped = Math.max(0, Math.min(editor.state.doc.content.size, position))
  editor.commands.setTextSelection(clamped)
  editor.view?.focus()
  return true
}

export function focusBeforeBlock(editor: HtmdInternalEditor, position: number): boolean {
  const { doc } = editor.state
  const clamped = Math.max(0, Math.min(doc.content.size, position))
  const $resolved = doc.resolve(clamped)
  if ($resolved.nodeBefore) {
    const prevPos = clamped - $resolved.nodeBefore.nodeSize
    if (focusBlockAtPos(editor, prevPos, 'up')) {
      return true
    }
  }
  const selection = Selection.findFrom($resolved, -1, true)
  if (!selection) return false
  const modalStorage = (
    editor.storage as { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
  )?.modalKeymap
  if (modalStorage) modalStorage.activeCompoundBlockPos = null
  editor.commands.setTextSelection(selection.from)
  editor.view?.focus()
  return true
}

export function focusAfterBlock(editor: HtmdInternalEditor, position: number): boolean {
  const { doc } = editor.state
  const clamped = Math.max(0, Math.min(doc.content.size, position))
  if (focusBlockAtPos(editor, clamped, 'down', true)) {
    return true
  }
  const selection = Selection.findFrom(doc.resolve(clamped), 1, true)
  if (!selection) return false
  const modalStorage = (
    editor.storage as { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
  )?.modalKeymap
  if (modalStorage) modalStorage.activeCompoundBlockPos = null
  editor.commands.setTextSelection(selection.from)
  editor.view?.focus()
  return true
}
