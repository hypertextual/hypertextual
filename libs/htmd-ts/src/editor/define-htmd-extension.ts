import {
  defineEditorExtension,
  type EditorExtension,
  type EditorExtensionSpec,
  type Keymap,
} from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  NodeSelection,
  Selection,
  type EditorState,
  type Plugin,
  type Transaction,
} from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

import { mergeHtmlAttributes } from '../nodes.js'

export { mergeHtmlAttributes }

// types ---------------------------------------------------------------------

export interface HtmdCommandContext {
  editor: TiptapEditor
  state: EditorState
  view: EditorView
  tr: Transaction
  dispatch?: (tr: Transaction) => void
  commands: TiptapEditor['commands']
}

export interface HtmdSubtextSpec {
  kind: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl'
  attr: string
  textSelector: string
  inputSelector: string
}

export interface HtmdNodeNavigation {
  kind: 'textblock' | 'container' | 'atom'
  controls?: readonly string[]
  subtext?: HtmdSubtextSpec
  enterFromAbove: (editor: TiptapEditor, pos: number, node: PMNode) => boolean
  enterFromBelow: (editor: TiptapEditor, pos: number, node: PMNode) => boolean
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
  pmPlugins?: (ctx: { editor: TiptapEditor; options: TOptions; storage: TStorage }) => Plugin[]
  onBeforeCreate?: (ctx: { editor: TiptapEditor; options: TOptions; storage: TStorage }) => void
  onCreate?: (ctx: { editor: TiptapEditor; options: TOptions; storage: TStorage }) => void
  navigation?: (
    ctx: { options: TOptions; storage: TStorage },
    parent?: HtmdNodeNavigation,
  ) => HtmdNodeNavigation
  keymap?: (
    ctx: {
      editor: TiptapEditor
      options: TOptions
      storage: TStorage
    },
    parent?: Keymap<HtmdCommandContext>,
  ) => Keymap<HtmdCommandContext>
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

// api -----------------------------------------------------------------------

export function defineHtmdExtension<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean> =
    Record<string, never>,
>(
  spec: HtmdExtensionSpec<TOptions, TStorage, TCommands>,
): HtmdExtension<TOptions, TStorage, TCommands> {
  const base = defineEditorExtension(
    spec as unknown as EditorExtensionSpec<TOptions, TStorage, HtmdCommandContext, TCommands>,
  ) as HtmdExtension<TOptions, TStorage, TCommands>

  const wrapInstance = <
    TOpts,
    TStor,
    TCmds extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean>,
  >(
    instance: HtmdExtension<TOpts, TStor, TCmds>,
  ): HtmdExtension<TOpts, TStor, TCmds> => ({
    ...instance,
    configure(nextOptions: Partial<TOpts>) {
      return wrapInstance(instance.configure(nextOptions))
    },
    extend<
      TNextOptions extends TOpts = TOpts,
      TNextStorage extends TStor = TStor,
      TNextCommands extends Record<
        string,
        (...args: never[]) => (ctx: HtmdCommandContext) => boolean
      > = TCmds,
    >(
      overrides: Partial<HtmdExtensionSpec<TNextOptions, TNextStorage, TNextCommands>>,
    ): HtmdExtension<TNextOptions, TNextStorage, TNextCommands> {
      const parentNavigation = instance.spec.navigation
      const nextNavigation =
        overrides.navigation || parentNavigation
          ? (ctx: { options: TNextOptions; storage: TNextStorage }) => {
              const resolvedParent = parentNavigation
                ? parentNavigation(ctx as unknown as { options: TOpts; storage: TStor })
                : createTextblockNavigation()
              return overrides.navigation
                ? overrides.navigation(ctx, resolvedParent)
                : resolvedParent
            }
          : undefined
      const extended = instance.extend({
        ...overrides,
        ...(nextNavigation ? { navigation: nextNavigation } : {}),
      })
      return wrapInstance(extended)
    },
  })

  return wrapInstance(base)
}

export function createTextblockNavigation(): HtmdNodeNavigation {
  return {
    kind: 'textblock',
    enterFromAbove(editor, pos) {
      const { doc } = editor.state
      const selection = Selection.findFrom(doc.resolve(Math.min(pos, doc.content.size)), 1, true)
      if (!selection) return false
      clearActiveCompoundBlockPos(editor)
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    },
    enterFromBelow(editor, pos, node) {
      const { doc } = editor.state
      const resolvedPos = Math.min(pos + node.nodeSize, doc.content.size)
      const selection = Selection.findFrom(doc.resolve(resolvedPos), -1, true)
      if (!selection) return false
      clearActiveCompoundBlockPos(editor)
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    },
  }
}

export function createContainerNodeNavigation(config: {
  controls: readonly string[]
  bodyOffset?: number
  enterBelowMode?: 'endPos' | 'findFrom'
}): HtmdNodeNavigation {
  const bodyOffset = config.bodyOffset ?? 1
  const enterBelowMode = config.enterBelowMode ?? 'endPos'
  const controlSelector = config.controls.join(', ')

  return {
    kind: 'container',
    controls: config.controls,
    enterFromAbove(editor, pos) {
      const { doc } = editor.state
      setActiveCompoundBlockPos(editor, pos)
      const targetPos = Math.min(pos + bodyOffset, doc.content.size)
      if (editor.state.selection.from !== targetPos) {
        editor.commands.setTextSelection(targetPos)
      }
      const dom = editor.view?.nodeDOM(pos)
      if (dom instanceof HTMLElement && controlSelector) {
        const control = dom.querySelector<HTMLElement>(controlSelector)
        if (control) {
          control.focus()
          return true
        }
      }
      editor.view?.focus()
      return true
    },
    enterFromBelow(editor, pos, node) {
      const { doc } = editor.state
      setActiveCompoundBlockPos(editor, pos)
      if (enterBelowMode === 'endPos') {
        const endPos = Math.max(pos + 1, pos + node.nodeSize - 1)
        editor.commands.setTextSelection(endPos)
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
    },
  }
}

export function createAtomNodeNavigation(config: {
  controls: readonly string[]
  subtext?: HtmdSubtextSpec
}): HtmdNodeNavigation {
  const primarySelector = config.controls[0] ?? ''

  const focusPrimaryControl = (
    editor: TiptapEditor,
    pos: number,
    node: PMNode,
    direction: 'down' | 'up',
  ): boolean => {
    const dom = editor.view?.nodeDOM(pos)
    if (!(dom instanceof HTMLElement) || !primarySelector) return false
    const input = dom.querySelector<HTMLElement>(primarySelector)
    if (!input) return false
    const { doc } = editor.state
    setActiveCompoundBlockPos(editor, pos)
    const nearPos =
      direction === 'up' ? Math.max(0, pos) : Math.min(pos + node.nodeSize, doc.content.size)
    const sel = Selection.findFrom(doc.resolve(nearPos), direction === 'up' ? -1 : 1, true)
    if (sel) {
      editor.commands.setTextSelection(sel.from)
    }
    input.focus({ preventScroll: true })
    return true
  }

  return {
    kind: 'atom',
    controls: config.controls,
    subtext: config.subtext,
    enterFromAbove(editor, pos, node) {
      return focusPrimaryControl(editor, pos, node, 'down')
    },
    enterFromBelow(editor, pos, node) {
      return focusPrimaryControl(editor, pos, node, 'up')
    },
  }
}

// helpers -------------------------------------------------------------------

const DEFAULT_NODE_NAVIGATIONS: Readonly<Record<string, HtmdNodeNavigation>> = {
  codeBlock: createContainerNodeNavigation({
    controls: ['[aria-label="Code language"][data-part="trigger"], [data-part="trigger"]'],
    bodyOffset: 1,
    enterBelowMode: 'endPos',
  }),
  notice: createContainerNodeNavigation({
    controls: [
      'input[aria-label="Notice title"]',
      '[aria-label="Notice type"][data-part="trigger"]',
    ],
    bodyOffset: 2,
    enterBelowMode: 'findFrom',
  }),
  imageNode: createAtomNodeNavigation({
    controls: [
      'input.caption-input, input[aria-label="Image caption"]',
      'button[aria-label="Replace image"]',
      'button[aria-label="Remove image"]',
    ],
    subtext: {
      kind: 'imageCaption',
      attr: 'caption',
      textSelector: '[data-image-caption-text]',
      inputSelector: 'input.caption-input, input[aria-label="Image caption"]',
    },
  }),
  image: createAtomNodeNavigation({
    controls: [
      'input.caption-input, input[aria-label="Image caption"]',
      'button[aria-label="Replace image"]',
      'button[aria-label="Remove image"]',
    ],
  }),
  linkPreview: createAtomNodeNavigation({
    controls: [
      'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]',
      'button[aria-label="Remove link preview"], button[aria-label="Remove YouTube embed"]',
    ],
    subtext: {
      kind: 'linkPreviewUrl',
      attr: 'url',
      textSelector: '[data-bookmark-url-text]',
      inputSelector: 'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]',
    },
  }),
}

const DEFAULT_TEXTBLOCK_NAVIGATION = createTextblockNavigation()

const editorNavigationRegistry = new WeakMap<TiptapEditor, Map<string, HtmdNodeNavigation>>()

export function registerNodeNavigation(
  editor: TiptapEditor,
  nodeName: string,
  navigation: HtmdNodeNavigation,
): void {
  let map = editorNavigationRegistry.get(editor)
  if (!map) {
    map = new Map()
    editorNavigationRegistry.set(editor, map)
  }
  map.set(nodeName, navigation)
}

export function getNodeNavigation(
  editor: TiptapEditor,
  nodeName: string,
): HtmdNodeNavigation | undefined {
  return editorNavigationRegistry.get(editor)?.get(nodeName) ?? DEFAULT_NODE_NAVIGATIONS[nodeName]
}

function setActiveCompoundBlockPos(editor: TiptapEditor, pos: number | null): void {
  const modalStorage = (
    editor.storage as { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
  )?.modalKeymap
  if (modalStorage) modalStorage.activeCompoundBlockPos = pos
}

function clearActiveCompoundBlockPos(editor: TiptapEditor): void {
  setActiveCompoundBlockPos(editor, null)
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
  editor: TiptapEditor,
  pos: number,
  direction: 'down' | 'up',
  allowTextblockFallback = false,
): boolean {
  const { doc } = editor.state
  if (pos < 0 || pos >= doc.content.size) return false
  const node = doc.nodeAt(pos)
  if (!node) return false

  const nav = getNodeNavigation(editor, node.type.name)
  if (nav) {
    return direction === 'down'
      ? nav.enterFromAbove(editor, pos, node)
      : nav.enterFromBelow(editor, pos, node)
  }

  if (allowTextblockFallback) {
    return direction === 'down'
      ? DEFAULT_TEXTBLOCK_NAVIGATION.enterFromAbove(editor, pos, node)
      : DEFAULT_TEXTBLOCK_NAVIGATION.enterFromBelow(editor, pos, node)
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

export function focusTextPosition(editor: TiptapEditor, position: number): boolean {
  const clamped = Math.max(0, Math.min(editor.state.doc.content.size, position))
  editor.commands.setTextSelection(clamped)
  editor.view?.focus()
  return true
}

export function focusBeforeBlock(editor: TiptapEditor, position: number): boolean {
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
  clearActiveCompoundBlockPos(editor)
  editor.commands.setTextSelection(selection.from)
  editor.view?.focus()
  return true
}

export function focusAfterBlock(editor: TiptapEditor, position: number): boolean {
  const { doc } = editor.state
  const clamped = Math.max(0, Math.min(doc.content.size, position))
  if (focusBlockAtPos(editor, clamped, 'down', true)) {
    return true
  }
  const selection = Selection.findFrom(doc.resolve(clamped), 1, true)
  if (!selection) return false
  clearActiveCompoundBlockPos(editor)
  editor.commands.setTextSelection(selection.from)
  editor.view?.focus()
  return true
}
