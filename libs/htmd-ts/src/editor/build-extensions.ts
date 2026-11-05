import {
  Extension,
  Node,
  NodeView,
  textblockTypeInputRule,
  type AnyExtension,
  type Extensions,
  type NodeViewRenderer,
  type NodeViewRendererProps,
} from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Color } from '@tiptap/extension-color'
import { Heading } from '@tiptap/extension-heading'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { Mention } from '@tiptap/extension-mention'
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

import type {
  HtmdCommandContext,
  HtmdExtension,
  HtmdInternalEditor,
} from './define-htmd-extension.js'
import { CodeBlockCustom } from './extensions/code-block-custom.js'
import { CurrentEmptyBlock } from './extensions/current-empty-block.js'
import { EditorHeading } from './extensions/editor-heading.js'
import { EditorOverlays } from './extensions/editor-overlays.js'
import { ExitHeading } from './extensions/exit-heading.js'
import { HeadingWithId } from './extensions/heading-with-id.js'
import { ImageNode } from './extensions/image-node.js'
import { InternalMention } from './extensions/internal-mention.js'
import { LinkPreview } from './extensions/link-preview.js'
import { ModalKeymap } from './extensions/modal-keymap.js'
import { NoticeNode } from './extensions/notice-node.js'
import { PasteUrl } from './extensions/paste-url.js'
import { SlashCommands } from './extensions/slash-commands.js'
import { TitleHeading } from './extensions/title-heading.js'
import { UnparsedBlock } from './extensions/unparsed-block.js'
import { UnparsedInline } from './extensions/unparsed-inline.js'
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

    this.instance.dom.classList.add(`node-${this.node.type.name}`)
    this.contentDOMElement = this.node.isLeaf
      ? null
      : (this.instance.contentDOM ??
        this.instance.dom.querySelector<HTMLElement>('[data-node-view-content]'))

    this.handleSelectionUpdate = this.handleSelectionUpdate.bind(this)
    this.editor.on('selectionUpdate', this.handleSelectionUpdate)
  }

  private appendContentDom() {
    if (!this.node.isLeaf && !this.contentDOMElement) {
      this.contentDOMElement =
        this.instance.contentDOM ??
        this.instance.dom.querySelector<HTMLElement>('[data-node-view-content]')
    }
  }

  override get dom(): HTMLElement {
    return this.instance.dom
  }

  override get contentDOM(): HTMLElement | null {
    if (this.node.isLeaf) return null
    return this.contentDOMElement
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
    if (this.instance.update) {
      const ok = this.instance.update(
        node as unknown as HtmdNodeViewNode,
        decorations,
        innerDecorations,
      )
      this.appendContentDom()
      return ok
    }
    return true
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
    const createInstance = factory()
    return new HtmdAdaptedNodeView(
      (ctx) =>
        createInstance({
          ...ctx,
          editor: getHostEditor() ?? ctx.editor,
        }),
      props,
    )
  }
}

export interface CompiledExtensionKeymap {
  name: string
  getKeymap: () => Keymap<HtmdCommandContext>
  getContext: () => HtmdCommandContext | null
}

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

  const buildCommandContext = (tiptapEditor: unknown): HtmdCommandContext => {
    const internalEditor = tiptapEditor as HtmdInternalEditor
    try {
      ;(
        internalEditor.view as unknown as {
          domObserver?: { flush?: () => void }
        }
      )?.domObserver?.flush?.()
    } catch {
      // Headless environment without DOM selection APIs
    }
    return {
      editor: internalEditor,
      state: internalEditor.state,
      view: internalEditor.view,
      tr: internalEditor.state.tr,
      dispatch: (tr) => internalEditor.view.dispatch(tr),
      commands: internalEditor.commands,
      chain: () => internalEditor.chain(),
    }
  }

  const sharedConfig: Record<string, unknown> = {
    name: spec.name,
    ...(spec.priority !== undefined ? { priority: spec.priority } : {}),
    ...(spec.group !== undefined ? { group: spec.group } : {}),
    ...(spec.content !== undefined ? { content: spec.content } : {}),
    ...(spec.inline !== undefined ? { inline: spec.inline } : {}),
    ...(spec.atom !== undefined ? { atom: spec.atom } : {}),
    ...(spec.code !== undefined ? { code: spec.code } : {}),
    ...(spec.marks !== undefined ? { marks: spec.marks } : {}),
    ...(spec.defining !== undefined ? { defining: spec.defining } : {}),
    ...(spec.selectable !== undefined ? { selectable: spec.selectable } : {}),

    addOptions(this: { parent?: () => Record<string, unknown> }) {
      const parentOpts = typeof this.parent === 'function' ? this.parent() : {}
      const defaults = spec.defaultOptions ? spec.defaultOptions() : {}
      return { ...parentOpts, ...defaults, ...configuredOptions }
    },

    ...(spec.createStorage
      ? {
          addStorage(this: { options: Record<string, unknown> }) {
            return spec.createStorage!(this.options as TOptions)
          },
        }
      : {}),

    ...(spec.attributes
      ? {
          addAttributes() {
            return spec.attributes
          },
        }
      : {}),

    ...(spec.parseHTML
      ? {
          parseHTML() {
            return spec.parseHTML!()
          },
        }
      : {}),

    ...(spec.renderHTML
      ? {
          renderHTML(
            this: { options: Record<string, unknown> },
            props: {
              node: import('@tiptap/pm/model').Node
              HTMLAttributes: Record<string, unknown>
            },
          ) {
            return spec.renderHTML!({
              node: props.node,
              HTMLAttributes: props.HTMLAttributes,
              options: this.options as TOptions,
            })
          },
        }
      : {}),

    ...(spec.textblockInputRules
      ? {
          addInputRules(this: {
            type: import('@tiptap/pm/model').NodeType
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            const ruleSpecs = spec.textblockInputRules!({
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            })
            return ruleSpecs.map((r) =>
              textblockTypeInputRule({
                find: r.find,
                type: this.type,
                getAttributes: r.getAttributes,
              }),
            )
          },
        }
      : {}),

    ...(spec.kind === 'node'
      ? {
          addNodeView(this: { options: { nodeView?: HtmdNodeViewFactory } }) {
            return toTiptapNodeViewRenderer(this.options?.nodeView, getHostEditor)
          },
        }
      : {}),

    ...(spec.commands
      ? {
          addCommands(this: {
            editor: unknown
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            const commandFns = spec.commands!({
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            }) as unknown as Record<
              string,
              (...args: unknown[]) => (ctx: HtmdCommandContext) => boolean
            >
            const wrapped: Record<
              string,
              (...args: unknown[]) => (props: Record<string, unknown>) => boolean
            > = {}
            for (const [cmdName, factory] of Object.entries(commandFns)) {
              wrapped[cmdName] =
                (...args: unknown[]) =>
                (props: Record<string, unknown>) => {
                  const internalEditor = (props.editor ?? this.editor) as HtmdInternalEditor
                  return factory(...args)({
                    editor: internalEditor,
                    state: (props.state as HtmdCommandContext['state']) ?? internalEditor.state,
                    view: (props.view as HtmdCommandContext['view']) ?? internalEditor.view,
                    tr: (props.tr as HtmdCommandContext['tr']) ?? internalEditor.state.tr,
                    dispatch: props.dispatch as HtmdCommandContext['dispatch'],
                    commands:
                      (props.commands as HtmdCommandContext['commands']) ?? internalEditor.commands,
                    chain:
                      (props.chain as HtmdCommandContext['chain']) ??
                      (() => internalEditor.chain()),
                  })
                }
            }
            return wrapped
          },
        }
      : {}),

    ...(spec.keymap
      ? {
          addKeyboardShortcuts(this: {
            editor: unknown
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            const editorRef = this.editor as HtmdInternalEditor
            const optionsRef = this.options as TOptions
            const storageRef = this.storage as TStorage
            const keymap = spec.keymap!({
              editor: editorRef,
              options: optionsRef,
              storage: storageRef,
            })

            options?.onExtensionKeymap?.({
              name: spec.name,
              getKeymap: () =>
                spec.keymap!({
                  editor: editorRef,
                  options: optionsRef,
                  storage: storageRef,
                }),
              getContext: () => {
                try {
                  return buildCommandContext(editorRef)
                } catch {
                  return null
                }
              },
            })

            const shortcuts: Record<string, () => boolean> = {}
            for (const [key, binding] of Object.entries(keymap)) {
              shortcuts[key] = () => {
                const ctx = buildCommandContext(editorRef)
                const syntheticEvent = new KeyboardEvent('keydown', { key })
                if (binding.when && !binding.when(ctx, syntheticEvent)) return false
                return binding.run(ctx, syntheticEvent)
              }
            }
            return shortcuts
          },
        }
      : {}),

    ...(spec.pmPlugins
      ? {
          addProseMirrorPlugins(this: {
            editor: unknown
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            return spec.pmPlugins!({
              editor: this.editor as HtmdInternalEditor,
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            })
          },
        }
      : {}),

    ...(spec.onBeforeCreate
      ? {
          onBeforeCreate(this: {
            editor: unknown
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            spec.onBeforeCreate!({
              editor: this.editor as HtmdInternalEditor,
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            })
          },
        }
      : {}),

    ...(spec.onCreate
      ? {
          onCreate(this: {
            editor: unknown
            options: Record<string, unknown>
            storage: Record<string, unknown>
          }) {
            spec.onCreate!({
              editor: this.editor as HtmdInternalEditor,
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            })
          },
        }
      : {}),

    ...(spec.onDestroy
      ? {
          onDestroy(this: { options: Record<string, unknown>; storage: Record<string, unknown> }) {
            spec.onDestroy!({
              options: this.options as TOptions,
              storage: this.storage as TStorage,
            })
          },
        }
      : {}),
  }

  if (spec.base === 'heading') {
    return Heading.extend(sharedConfig as never).configure(configuredOptions as never)
  }
  if (spec.base === 'codeBlockLowlight') {
    return CodeBlockLowlight.extend(sharedConfig as never).configure(configuredOptions as never)
  }
  if (spec.base === 'mention') {
    return Mention.extend(sharedConfig as never).configure(configuredOptions as never)
  }
  if (spec.kind === 'node') {
    return Node.create(sharedConfig as never).configure(configuredOptions as never)
  }
  return Extension.create(sharedConfig as never).configure(configuredOptions as never)
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
      heading: false,
    }),
    ...(headingWithId
      ? [compile(HeadingWithId.configure({ levels: [1, 2, 3, 4, 5, 6] }))]
      : [compile(EditorHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }))]),
    ...(enforceTitle ? [compile(TitleHeading), compile(ExitHeading)] : []),
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
    compile(UnparsedBlock.configure({ nodeView: untypedNodeViews.unparsedBlock })),
    compile(UnparsedInline.configure({ nodeView: untypedNodeViews.unparsedInline })),
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
    compile(CodeBlockCustom.configure({ lowlight, nodeView: untypedNodeViews.codeBlock })),
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
    compile(ModalKeymap.configure({ enforceTitle, onNotification })),
  ] as Extensions
}
