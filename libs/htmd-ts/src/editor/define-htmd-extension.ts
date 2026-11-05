import {
  defineEditorExtension,
  type EditorExtension,
  type EditorExtensionSpec,
  type Keymap,
} from 'core-ts'
import type { DOMOutputSpec, Node as PMNode, ParseRule, Schema } from '@tiptap/pm/model'
import type { EditorState, Plugin, Transaction } from '@tiptap/pm/state'
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

export interface HtmdTextblockInputRuleSpec {
  find: RegExp
  getAttributes?:
    Record<string, unknown> | ((match: RegExpExecArray) => Record<string, unknown> | null)
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
  textblockInputRules?: (ctx: {
    options: TOptions
    storage: TStorage
  }) => HtmdTextblockInputRuleSpec[]
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
