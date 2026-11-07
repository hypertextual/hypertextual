import {
  Extension,
  NodeView,
  type AnyExtension,
  type Editor as TiptapEditor,
  type Extensions,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { TextStyle } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { EditorNotification, Keymap } from 'core-ts'
import { common, createLowlight } from 'lowlight'

import {
  HeadingNodeWithId,
  Image as SchemaImageNode,
  InternalMention as SchemaInternalMentionNode,
  LinkPreview as SchemaLinkPreviewNode,
  Notice as SchemaNoticeNode,
  UnparsedBlock as SchemaUnparsedBlockNode,
  UnparsedInline as SchemaUnparsedInlineNode,
  UrlMention as SchemaUrlMentionNode,
} from '../nodes.js'
import {
  registerNodeNavigation,
  type HtmdCommandContext,
  type HtmdExtension,
} from './define-htmd-extension.js'
import { CodeBlock } from './extensions/code-block.js'
import { CurrentEmptyBlock } from './extensions/current-empty-block.js'
import { EditorOverlays } from './extensions/editor-overlays.js'
import { HeadingWithId } from './extensions/heading-with-id.js'
import { ImageNode } from './extensions/image-node.js'
import { InsertMode } from './extensions/insert-mode.js'
import { InternalMention } from './extensions/internal-mention.js'
import { LinkPreview } from './extensions/link-preview.js'
import { ModalEditing } from './extensions/modal-editing.js'
import { HelixPreset, KakounePreset, VimPreset } from './extensions/modal-presets.js'
import { NormalMode } from './extensions/normal-mode.js'
import { NoticeNode } from './extensions/notice-node.js'
import { PasteUrl } from './extensions/paste-url.js'
import { SelectMode } from './extensions/select-mode.js'
import { SlashCommands } from './extensions/slash-commands.js'
import { TitleHeading } from './extensions/title-heading.js'
import { UnparsableBlockFallback } from './extensions/unparsable-block-fallback.js'
import { UnparsableInlineFallback } from './extensions/unparsable-inline-fallback.js'
import { UrlMention } from './extensions/url-mention.js'
import type {
  HtmdNodeViewContext,
  HtmdNodeViewFactory,
  HtmdNodeViewInstance,
  HtmdNodeViewNode,
  HtmdNodeViews,
  HtmdOverlayDefinition,
  HtmdOverlayState,
  LinkPreviewFetcher,
  MentionItem,
  SlashCommandItem,
} from './types.js'

// types ---------------------------------------------------------------------

export interface CompiledExtensionKeymap {
  name: string
  getKeymap: () => Keymap<HtmdCommandContext>
  getContext: () => HtmdCommandContext | null
}

export interface BuildExtensionsOptions<TEditor = unknown> {
  nodeViews: HtmdNodeViews<TEditor>
  getHostEditor?: () => TEditor
  onExtensionKeymap?: (compiled: CompiledExtensionKeymap) => void
  onNotification?: (notification: EditorNotification) => void
  overlays?: Readonly<Record<string, HtmdOverlayDefinition>>
  onOverlayChange?: (overlay: HtmdOverlayState | null) => void
  placeholder?: (nodeName: string, level?: number) => string
  mentionSource?: (query: string) => Promise<MentionItem[]>
  hrefBuilder?: (item: MentionItem) => string
  fetchLinkPreview?: LinkPreviewFetcher
  mentionRender?: SuggestionOptions<MentionItem>['render']
  slashRender?: SuggestionOptions<SlashCommandItem>['render']
  enforceTitle?: boolean
  headingWithId?: boolean
}

interface TiptapHookThis<TOptions, TStorage> {
  parent?: () => Record<string, unknown>
  editor: TiptapEditor
  options: TOptions
  storage: TStorage
}

const SCHEMA_NODE_BY_NAME: Readonly<Record<string, AnyExtension>> = {
  heading: HeadingNodeWithId,
  codeBlock: CodeBlockLowlight.extend({ selectable: true }),
  internalMention: SchemaInternalMentionNode,
  urlMention: SchemaUrlMentionNode,
  notice: SchemaNoticeNode,
  imageNode: SchemaImageNode,
  linkPreview: SchemaLinkPreviewNode,
  unparsedBlock: SchemaUnparsedBlockNode,
  unparsedInline: SchemaUnparsedInlineNode,
}

// api -----------------------------------------------------------------------

/**
 * Adapts an engine-neutral `HtmdExtension` descriptor into a Tiptap `Node` or
 * `Extension` by extending the canonical node schema from `nodes.ts` and
 * attaching `nodeView`, `commands`, `keymap`, and `pmPlugins`.
 */
export function compileHtmdExtension<
  TOptions,
  TStorage,
  TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean>,
>(
  ext: HtmdExtension<TOptions, TStorage, TCommands>,
  options?: {
    getHostEditor?: () => unknown
    onExtensionKeymap?: (compiled: CompiledExtensionKeymap) => void
  },
): AnyExtension {
  const { spec, options: configuredOptions } = ext
  const getHostEditor = options?.getHostEditor ?? (() => undefined)

  const sharedConfig: Record<string, unknown> = {
    name: spec.name,
    priority: spec.priority,

    addOptions(this: TiptapHookThis<TOptions, TStorage>) {
      const parentOpts = typeof this.parent === 'function' ? this.parent() : {}
      const defaults = spec.defaultOptions ? spec.defaultOptions() : {}
      return { ...parentOpts, ...defaults, ...configuredOptions }
    },
  }

  if (spec.createStorage) {
    sharedConfig.addStorage = function (this: TiptapHookThis<TOptions, TStorage>) {
      return spec.createStorage!(this.options)
    }
  }
  if (spec.kind === 'node') {
    sharedConfig.addNodeView = function (this: { options: { nodeView?: HtmdNodeViewFactory } }) {
      return toTiptapNodeViewRenderer(this.options?.nodeView, getHostEditor)
    }
  }
  if (spec.commands) {
    sharedConfig.addCommands = function (this: TiptapHookThis<TOptions, TStorage>) {
      const commandFns = spec.commands!({
        options: this.options,
        storage: this.storage,
      }) as unknown as Record<string, (...args: unknown[]) => (ctx: HtmdCommandContext) => boolean>
      return Object.fromEntries(
        Object.entries(commandFns).map(([cmdName, factory]) => [
          cmdName,
          (...args: unknown[]) =>
            (props: Record<string, unknown>) =>
              factory(...args)(
                toCommandContext((props.editor as TiptapEditor) ?? this.editor, props),
              ),
        ]),
      )
    }
  }
  const hasOptionKeymap = Boolean(
    (configuredOptions as { keymap?: Keymap<HtmdCommandContext> } | undefined)?.keymap,
  )
  if (spec.keymap || hasOptionKeymap) {
    sharedConfig.addKeyboardShortcuts = function (this: TiptapHookThis<TOptions, TStorage>) {
      const { editor: editorRef, options: optionsRef, storage: storageRef } = this
      const getKeymap = () => {
        const baseKeymap = spec.keymap
          ? spec.keymap({ editor: editorRef, options: optionsRef, storage: storageRef })
          : {}
        const optionKeymap =
          (optionsRef as { keymap?: Keymap<HtmdCommandContext> } | undefined)?.keymap ?? {}
        return { ...baseKeymap, ...optionKeymap }
      }

      options?.onExtensionKeymap?.({
        name: spec.name,
        getKeymap,
        getContext: () => {
          try {
            return toCommandContext(editorRef)
          } catch {
            return null
          }
        },
      })

      return Object.fromEntries(
        Object.entries(getKeymap()).map(([key, binding]) => [
          key,
          () => {
            const ctx = toCommandContext(editorRef)
            const syntheticEvent = new KeyboardEvent('keydown', { key })
            if (binding.when && !binding.when(ctx, syntheticEvent)) return false
            return binding.run(ctx, syntheticEvent)
          },
        ]),
      )
    }
  }
  if (spec.pmPlugins) {
    sharedConfig.addProseMirrorPlugins = function (this: TiptapHookThis<TOptions, TStorage>) {
      return spec.pmPlugins!(this)
    }
  }
  if (spec.onBeforeCreate || spec.navigation) {
    sharedConfig.onBeforeCreate = function (this: TiptapHookThis<TOptions, TStorage>) {
      if (spec.navigation) {
        registerNodeNavigation(
          this.editor,
          spec.name,
          spec.navigation({ options: this.options, storage: this.storage }),
        )
      }
      spec.onBeforeCreate?.(this)
    }
  }
  if (spec.onCreate) {
    sharedConfig.onCreate = function (this: TiptapHookThis<TOptions, TStorage>) {
      spec.onCreate!(this)
    }
  }
  if (spec.onDestroy) {
    sharedConfig.onDestroy = function (this: TiptapHookThis<TOptions, TStorage>) {
      spec.onDestroy!(this)
    }
  }

  for (const [key, value] of Object.entries(sharedConfig)) {
    if (value === undefined) delete sharedConfig[key]
  }

  const schemaBase = spec.kind === 'node' ? SCHEMA_NODE_BY_NAME[spec.name] : undefined
  const baseExtension = schemaBase
    ? schemaBase.extend(sharedConfig as never)
    : Extension.create(sharedConfig as never)

  return baseExtension.configure(configuredOptions as never)
}

export function buildExtensions<TEditor = unknown>(
  options: BuildExtensionsOptions<TEditor>,
): Extensions {
  const {
    nodeViews,
    getHostEditor,
    onExtensionKeymap,
    onNotification,
    mentionSource,
    hrefBuilder,
    mentionRender,
    slashRender,
    headingWithId,
  } = options
  const untypedNodeViews = nodeViews as HtmdNodeViews<unknown>
  const enforceTitle = options.enforceTitle ?? true
  const lowlight = createLowlight(common)
  const compile = <
    TOptions,
    TStorage,
    TCommands extends Record<string, (...args: never[]) => (ctx: HtmdCommandContext) => boolean>,
  >(
    ext: HtmdExtension<TOptions, TStorage, TCommands>,
  ) => compileHtmdExtension(ext, { getHostEditor, onExtensionKeymap })

  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      underline: false,
      heading: headingWithId ? false : { levels: [1, 2, 3, 4, 5, 6] },
    }),
    ...(headingWithId ? [compile(HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] }))] : []),
    ...(enforceTitle ? [compile(TitleHeading)] : []),
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ node }) =>
        node.type.name === 'codeBlock'
          ? ''
          : options.placeholder
            ? options.placeholder(node.type.name, node.attrs.level)
            : node.type.name === 'heading' && node.attrs.level === 1
              ? 'Untitled'
              : "Type '/' for commands",
    }),
    compile(UnparsableBlockFallback.configure({ nodeView: untypedNodeViews.unparsedBlock })),
    compile(UnparsableInlineFallback.configure({ nodeView: untypedNodeViews.unparsedInline })),
    compile(CurrentEmptyBlock),
    compile(PasteUrl),
    compile(
      EditorOverlays.configure({
        overlays: options.overlays ?? {},
        onChange: options.onOverlayChange,
      }),
    ),
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Typography,
    Underline,
    TextStyle,
    Color,
    compile(CodeBlock.configure({ lowlight, nodeView: untypedNodeViews.codeBlock })),
    CharacterCount.configure({ mode: 'textSize' }),
    TaskList,
    TaskItem.configure({ nested: true }),
    compile(NoticeNode.configure({ nodeView: untypedNodeViews.notice })),
    compile(
      InternalMention.configure({
        hrefBuilder,
        suggestion: {
          ...InternalMention.options.suggestion,
          items: async ({ query }) => {
            try {
              return (await mentionSource?.(query)) ?? []
            } catch {
              return []
            }
          },
          render: mentionRender ?? (() => ({})),
        },
      }),
    ),
    compile(
      LinkPreview.configure({
        nodeView: untypedNodeViews.linkPreview,
        fetchLinkPreview: options.fetchLinkPreview,
      }),
    ),
    compile(ImageNode.configure({ nodeView: untypedNodeViews.image })),
    compile(UrlMention.configure({ nodeView: untypedNodeViews.urlMention })),
    compile(
      SlashCommands.configure({
        suggestion: {
          ...SlashCommands.options.suggestion,
          render: slashRender ?? (() => ({})),
        },
      }),
    ),
    compile(NormalMode),
    compile(SelectMode),
    compile(InsertMode),
    compile(HelixPreset),
    compile(VimPreset),
    compile(KakounePreset),
    compile(ModalEditing.configure({ enforceTitle, onNotification })),
  ] as Extensions
}

// helpers -------------------------------------------------------------------

class HtmdAdaptedNodeView extends NodeView<
  (ctx: HtmdNodeViewContext<unknown>) => HtmdNodeViewInstance
> {
  declare private instance: HtmdNodeViewInstance
  declare private contentDOMElement: HTMLElement | null

  override mount() {
    this.instance = this.component({
      editor: this.editor,
      node: this.node as unknown as HtmdNodeViewNode,
      decorations: this.decorations,
      innerDecorations: this.innerDecorations,
      selected: false,
      HTMLAttributes: this.HTMLAttributes,
      getPos: () => this.getPos(),
      updateAttributes: (attributes = {}) => this.updateAttributes(attributes),
      deleteNode: () => this.deleteNode(),
    })

    const dom = this.instance.dom as HTMLElement & { __htmdGetPos?: () => number | undefined }
    dom.classList.add(`node-${this.node.type.name}`)
    dom.__htmdGetPos = () => this.getPos()
    this.contentDOMElement = this.node.isLeaf
      ? null
      : (this.instance.contentDOM ?? dom.querySelector<HTMLElement>('[data-node-view-content]'))

    this.handleSelectionUpdate = this.handleSelectionUpdate.bind(this)
    this.editor.on('selectionUpdate', this.handleSelectionUpdate)
  }

  override get dom(): HTMLElement {
    return this.instance.dom
  }

  override get contentDOM(): HTMLElement | null {
    return this.node.isLeaf ? null : this.contentDOMElement
  }

  handleSelectionUpdate() {
    const { from, to } = this.editor.state.selection
    const pos = this.getPos()
    if (typeof pos !== 'number') return
    if (from <= pos && to >= pos + this.node.nodeSize) {
      this.selectNode()
    } else {
      this.deselectNode()
    }
  }

  update(
    node: NodeViewRendererProps['node'],
    decorations: NodeViewRendererProps['decorations'],
    innerDecorations: NodeViewRendererProps['innerDecorations'],
  ): boolean {
    if (node.type !== this.node.type) return false
    if (
      node === this.node &&
      this.decorations === decorations &&
      this.innerDecorations === innerDecorations
    ) {
      return true
    }
    this.node = node
    this.decorations = decorations
    this.innerDecorations = innerDecorations
    if (!this.instance.update) return true
    const ok = this.instance.update(
      node as unknown as HtmdNodeViewNode,
      decorations,
      innerDecorations,
    )
    if (!this.node.isLeaf && !this.contentDOMElement) {
      this.contentDOMElement =
        this.instance.contentDOM ??
        this.instance.dom.querySelector<HTMLElement>('[data-node-view-content]')
    }
    return ok
  }

  selectNode() {
    this.instance.selectNode?.()
    this.instance.dom.classList.add('ProseMirror-selectednode')
  }

  deselectNode() {
    this.instance.deselectNode?.()
    this.instance.dom.classList.remove('ProseMirror-selectednode')
  }

  destroy() {
    this.editor.off('selectionUpdate', this.handleSelectionUpdate)
    this.instance.destroy?.()
    this.contentDOMElement = null
  }
}

function toTiptapNodeViewRenderer(
  factory: HtmdNodeViewFactory | undefined,
  getHostEditor: () => unknown,
): NodeViewRenderer | null {
  if (!factory) return null
  return (props: NodeViewRendererProps) => {
    return new HtmdAdaptedNodeView((ctx) => {
      const enriched = { ...ctx, editor: getHostEditor() ?? ctx.editor }
      const result = (
        factory as (
          arg?: HtmdNodeViewContext,
        ) => HtmdNodeViewInstance | ((c: HtmdNodeViewContext) => HtmdNodeViewInstance)
      )(enriched)
      return typeof result === 'function' ? result(enriched) : result
    }, props)
  }
}

function toCommandContext(
  editor: TiptapEditor,
  overrides?: Record<string, unknown>,
): HtmdCommandContext {
  if (!overrides) {
    try {
      ;(editor.view as unknown as { domObserver?: { flush?: () => void } })?.domObserver?.flush?.()
    } catch {
      // Headless environment without DOM selection APIs
    }
  }
  return {
    editor,
    state: (overrides?.state as HtmdCommandContext['state']) ?? editor.state,
    view: (overrides?.view as HtmdCommandContext['view']) ?? editor.view,
    tr: (overrides?.tr as HtmdCommandContext['tr']) ?? editor.state.tr,
    dispatch:
      (overrides?.dispatch as HtmdCommandContext['dispatch']) ?? ((tr) => editor.view.dispatch(tr)),
    commands: (overrides?.commands as HtmdCommandContext['commands']) ?? editor.commands,
  }
}
