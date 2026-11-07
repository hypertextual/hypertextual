import type { EditorExtension, EditorExtensionSpec, Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Selection, type EditorState, type Plugin, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

import { mergeHtmlAttributes } from '../nodes.js'
import {
  CursorManager,
  findNodeViewControl,
  focusTextPosition,
  isAtFirstVisualLine,
  isAtLastVisualLine,
} from './cursor-manager.js'
import {
  findNextBlockPos,
  findPrevBlockPos,
  focusAfterBlock,
  focusBeforeBlock,
  focusBlockAtPos,
  focusControlAtPos,
  SelectionManager,
} from './selection-manager.js'

export {
  CursorManager,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusAfterBlock,
  focusBeforeBlock,
  focusBlockAtPos,
  focusControlAtPos,
  focusTextPosition,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  mergeHtmlAttributes,
  SelectionManager,
}

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

export interface HtmdControlFocusOptions {
  control?: string
  offset?: number
}

export interface HtmdNodeNavigation {
  kind: 'textblock' | 'container' | 'atom'
  controls?: readonly string[]
  subtext?: HtmdSubtextSpec
  enterFromAbove: (editor: TiptapEditor, pos: number, node: PMNode) => boolean
  enterFromBelow: (editor: TiptapEditor, pos: number, node: PMNode) => boolean
  focusControl?: (
    editor: TiptapEditor,
    pos: number,
    node: PMNode,
    options?: HtmdControlFocusOptions,
  ) => boolean
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

/**
 * Defines a composable HTMD editor extension supporting `.configure(options)`
 * and `.extend(overrides)` across options, storage, commands, keymap, and
 * navigation hooks.
 */
export function defineHtmdExtension<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean> =
    Record<string, never>,
>(
  spec: HtmdExtensionSpec<TOptions, TStorage, TCommands>,
  configuredOptions?: Partial<TOptions>,
): HtmdExtension<TOptions, TStorage, TCommands> {
  const baseOptions = spec.defaultOptions ? spec.defaultOptions() : ({} as TOptions)
  const options = { ...baseOptions, ...(configuredOptions ?? {}) } as TOptions

  return {
    spec,
    options,
    configure(nextOptions: Partial<TOptions>) {
      return defineHtmdExtension(spec, { ...options, ...nextOptions })
    },
    extend<
      TNextOptions extends TOptions = TOptions,
      TNextStorage extends TStorage = TStorage,
      TNextCommands extends Record<
        string,
        (...args: never[]) => (ctx: HtmdCommandContext) => boolean
      > = TCommands,
    >(
      overrides: Partial<HtmdExtensionSpec<TNextOptions, TNextStorage, TNextCommands>>,
    ): HtmdExtension<TNextOptions, TNextStorage, TNextCommands> {
      return defineHtmdExtension<TNextOptions, TNextStorage, TNextCommands>({
        ...(spec as unknown as HtmdExtensionSpec<TNextOptions, TNextStorage, TNextCommands>),
        ...overrides,
        defaultOptions: () => ({
          ...(spec.defaultOptions
            ? (spec.defaultOptions() as unknown as TNextOptions)
            : ({} as TNextOptions)),
          ...(options as unknown as Partial<TNextOptions>),
          ...(overrides.defaultOptions ? overrides.defaultOptions() : ({} as TNextOptions)),
        }),
        createStorage: (opts: TNextOptions) => ({
          ...(spec.createStorage
            ? (spec.createStorage(opts) as unknown as TNextStorage)
            : ({} as TNextStorage)),
          ...(overrides.createStorage ? overrides.createStorage(opts) : ({} as TNextStorage)),
        }),
        commands: (ctx) => {
          const parentCommands = spec.commands
            ? (spec.commands(
                ctx as unknown as { options: TOptions; storage: TStorage },
                {} as TCommands,
              ) as unknown as TNextCommands)
            : ({} as TNextCommands)
          const overrideCommands = overrides.commands
            ? overrides.commands(ctx, parentCommands)
            : ({} as TNextCommands)
          return { ...parentCommands, ...overrideCommands }
        },
        keymap: (ctx) => {
          const parentKeymap = spec.keymap
            ? spec.keymap(
                ctx as unknown as { editor: TiptapEditor; options: TOptions; storage: TStorage },
                {},
              )
            : {}
          const overrideKeymap = overrides.keymap ? overrides.keymap(ctx, parentKeymap) : {}
          const optionKeymap =
            (ctx?.options as { keymap?: Keymap<HtmdCommandContext> } | undefined)?.keymap ?? {}
          return { ...parentKeymap, ...overrideKeymap, ...optionKeymap }
        },
        ...(overrides.navigation || spec.navigation
          ? {
              navigation: (ctx: { options: TNextOptions; storage: TNextStorage }) => {
                const parentNav = spec.navigation
                  ? spec.navigation(ctx as unknown as { options: TOptions; storage: TStorage })
                  : createTextblockNavigation()
                return overrides.navigation ? overrides.navigation(ctx, parentNav) : parentNav
              },
            }
          : {}),
      })
    },
  }
}

/**
 * Creates a default `textblock` navigation contract that enters at the start
 * from above and at the end from below.
 */
export function createTextblockNavigation(): HtmdNodeNavigation {
  return {
    kind: 'textblock',
    enterFromAbove(editor, pos) {
      const { doc } = editor.state
      const selection = Selection.findFrom(doc.resolve(Math.min(pos, doc.content.size)), 1, true)
      if (!selection) return false
      CursorManager.clearActiveCompoundBlockPos(editor)
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    },
    enterFromBelow(editor, pos, node) {
      const { doc } = editor.state
      const resolvedPos = Math.min(pos + node.nodeSize, doc.content.size)
      const selection = Selection.findFrom(doc.resolve(resolvedPos), -1, true)
      if (!selection) return false
      CursorManager.clearActiveCompoundBlockPos(editor)
      editor.commands.setTextSelection(selection.from)
      editor.view?.focus()
      return true
    },
  }
}

/**
 * Creates a `container` navigation contract for compound blocks (`notice`,
 * `codeBlock`) with header controls and an editable rich-text body.
 */
export function createContainerNodeNavigation(config: {
  controls: readonly string[]
  bodyOffset?: number
  enterBelowMode?: 'endPos' | 'findFrom'
  focusControl?: (
    editor: TiptapEditor,
    pos: number,
    node: PMNode,
    options?: HtmdControlFocusOptions,
  ) => boolean
}): HtmdNodeNavigation {
  const bodyOffset = config.bodyOffset ?? 1
  const enterBelowMode = config.enterBelowMode ?? 'endPos'
  const controlSelector = config.controls.join(', ')

  return {
    kind: 'container',
    controls: config.controls,
    enterFromAbove(editor, pos) {
      const { doc } = editor.state
      CursorManager.setActiveCompoundBlockPos(editor, pos)
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
      CursorManager.setActiveCompoundBlockPos(editor, pos)
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
    focusControl: config.focusControl,
  }
}

/**
 * Creates an `atom` navigation contract for leaf NodeView blocks (`imageNode`,
 * `linkPreview`) with focusable input/toolbar controls and optional subtext.
 */
export function createAtomNodeNavigation(config: {
  controls: readonly string[]
  subtext?: HtmdSubtextSpec
  focusControl?: (
    editor: TiptapEditor,
    pos: number,
    node: PMNode,
    options?: HtmdControlFocusOptions,
  ) => boolean
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
    CursorManager.setActiveCompoundBlockPos(editor, pos)
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
    focusControl:
      config.focusControl ??
      ((editor, pos, _node, options) => {
        const dom = editor.view?.nodeDOM(pos)
        if (!(dom instanceof HTMLElement) || !primarySelector) return false
        const input = dom.querySelector<HTMLElement>(primarySelector)
        if (!input) return false
        input.focus()
        if (input instanceof HTMLInputElement) {
          const caret =
            typeof options?.offset === 'number'
              ? Math.max(0, Math.min(input.value.length, options.offset))
              : input.value.length
          input.setSelectionRange(caret, caret)
        }
        return true
      }),
  }
}

// helpers -------------------------------------------------------------------

const editorNavigationRegistry = new WeakMap<TiptapEditor, Map<string, HtmdNodeNavigation>>()

/**
 * Registers a node's `HtmdNodeNavigation` spec on the given Tiptap editor
 * instance.
 */
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
  if (nodeName === 'imageNode' && !map.has('image')) {
    map.set('image', navigation)
  }
}

/**
 * Looks up the `HtmdNodeNavigation` spec registered for `nodeName` on `editor`.
 */
export function getNodeNavigation(
  editor: TiptapEditor,
  nodeName: string,
): HtmdNodeNavigation | undefined {
  return editorNavigationRegistry.get(editor)?.get(nodeName)
}
