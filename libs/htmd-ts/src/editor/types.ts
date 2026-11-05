import type { Editor, EditorCounts, EditorHostServices, Keymap } from 'core-ts'
import type { JSONContent } from '../types.js'

export type { EditorCounts }

export type NoticeVariant = 'info' | 'success' | 'warning' | 'error'

export interface NoticeAttributes {
  variant?: NoticeVariant
  title?: string
}

export interface MentionItem {
  id: string
  label: string
  /** e.g. "post" | "series" | "user" */
  type: string
  seriesId?: string | null
  title?: string
}

export interface MentionListElement extends HTMLElement {
  __mentionListKeyDown?: (event: KeyboardEvent) => boolean
}

export interface UrlMentionAttributes {
  url: string
  title: string
  favicon: string | null
}

export interface LinkPreviewAttributes {
  url: string
  title: string
  description: string
  image: string | null
  favicon: string | null
  provider: string
  type: 'bookmark' | 'embed'
}

export type LinkPreviewFetcher = (
  url: string,
) => Promise<Omit<LinkPreviewAttributes, 'url' | 'type'>>

export interface ImageUploadResult {
  src: string
  srcset?: string
}

export interface HtmdSlashChain {
  focus: () => HtmdSlashChain
  deleteRange: (range: { from: number; to: number }) => HtmdSlashChain
  setNode: (name: string, attrs?: Record<string, unknown>) => HtmdSlashChain
  toggleBlockquote: () => HtmdSlashChain
  insertNotice: (attrs?: NoticeAttributes) => HtmdSlashChain
  toggleBulletList: () => HtmdSlashChain
  toggleOrderedList: () => HtmdSlashChain
  toggleTaskList: () => HtmdSlashChain
  setHorizontalRule: () => HtmdSlashChain
  setCodeBlock: (attrs?: { language?: string }) => HtmdSlashChain
  openOverlay: (name: string, options?: HtmdOverlayOpenOptions) => HtmdSlashChain
  run: () => boolean
}

export interface HtmdSlashCommandEditor {
  chain: () => HtmdSlashChain
}

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: HtmdSlashCommandEditor; range: { from: number; to: number } }) => void
  category: 'suggested' | 'basic' | 'media' | 'advanced'
  shortcut?: string
}

export interface HtmdSelectionState {
  from: number
  to: number
  empty: boolean
  isNodeSelection: boolean
  isFocused: boolean
}

export interface HtmdSubtextCursor {
  pos: number
  kind: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl'
  offset: number
  anchorOffset?: number
}

export interface HtmdNodeViewNode {
  readonly attrs: Record<string, unknown>
  readonly nodeSize: number
  readonly textContent: string
  readonly childCount: number
  readonly firstChild: {
    readonly type: { readonly name: string }
    readonly content: { readonly size: number }
  } | null
  readonly isInline?: boolean
  readonly isLeaf?: boolean
  readonly type: { readonly name: string }
}

export interface HtmdNodeViewContext<TEditor = unknown> {
  editor: TEditor
  node: HtmdNodeViewNode
  decorations: readonly unknown[]
  innerDecorations?: unknown
  selected: boolean
  HTMLAttributes: Record<string, unknown>
  getPos: () => number | undefined
  updateAttributes: (attributes: Record<string, unknown>) => void
  deleteNode: () => void
}

export interface HtmdNodeViewInstance {
  dom: HTMLElement
  contentDOM?: HTMLElement | null
  update?: (
    node: HtmdNodeViewNode,
    decorations: readonly unknown[],
    innerDecorations?: unknown,
  ) => boolean
  selectNode?: () => void
  deselectNode?: () => void
  destroy?: () => void
}

export type HtmdNodeViewFactory<TEditor = unknown> = () => (
  ctx: HtmdNodeViewContext<TEditor>,
) => HtmdNodeViewInstance

export interface HtmdNodeViews<TEditor = unknown> {
  image?: HtmdNodeViewFactory<TEditor>
  urlMention?: HtmdNodeViewFactory<TEditor>
  linkPreview?: HtmdNodeViewFactory<TEditor>
  codeBlock?: HtmdNodeViewFactory<TEditor>
  notice?: HtmdNodeViewFactory<TEditor>
  unparsedBlock?: HtmdNodeViewFactory<TEditor>
  unparsedInline?: HtmdNodeViewFactory<TEditor>
}

export interface OverlayPlacementOptions {
  width: number
  height: number
  gap?: number
  viewportGap?: number
  placement?: 'top' | 'bottom'
  align?: 'start' | 'center'
}

export interface HtmdOverlayDefinition extends OverlayPlacementOptions {
  lockScroll?: boolean
}

export interface HtmdOverlayRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface HtmdOverlaySurfaceOptions extends OverlayPlacementOptions {
  anchor: () => number | 'selection' | HtmdOverlayRect | null
  lockScroll?: boolean | (() => boolean)
}

export interface HtmdOverlayBinding {
  update: () => void
  destroy: () => void
}

export interface HtmdOverlaysController {
  attach: (surface: HTMLElement, options: HtmdOverlaySurfaceOptions) => HtmdOverlayBinding
}

export interface HtmdOverlayOpenOptions {
  position?: number
  data?: unknown
}

export interface HtmdOverlayState {
  readonly name: string
  readonly position: number
  readonly definition: HtmdOverlayDefinition
  readonly data?: unknown
}

export interface HtmdOverlaysOptions {
  overlays: Readonly<Record<string, HtmdOverlayDefinition>>
  onChange?: (overlay: HtmdOverlayState | null) => void
}

export interface HtmdSuggestionMenuProps<TItem> {
  items: TItem[]
  query: string
  range: { from: number; to: number }
  command: (item: TItem) => void
  clientRect?: (() => DOMRect | null) | null
}

export interface HtmdSuggestionRenderer<TItem> {
  onStart?: (props: HtmdSuggestionMenuProps<TItem>) => void
  onUpdate?: (props: HtmdSuggestionMenuProps<TItem>) => void
  onKeyDown?: (props: { event: KeyboardEvent }) => boolean
  onExit?: () => void
}

export type HtmdCommandMap = {
  toggleBold: () => boolean
  toggleItalic: () => boolean
  toggleUnderline: () => boolean
  toggleStrike: () => boolean
  toggleCode: () => boolean
  toggleBlockquote: () => boolean
  toggleBulletList: () => boolean
  toggleOrderedList: () => boolean
  toggleTaskList: () => boolean
  setHorizontalRule: () => boolean
  setHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => boolean
  setParagraph: () => boolean
  setCodeBlock: (language?: string) => boolean
  setColor: (color: string) => boolean
  unsetColor: () => boolean
  toggleHighlight: (color: string) => boolean
  unsetHighlight: () => boolean
  setLink: (href: string) => boolean
  unsetLink: () => boolean
  insertNotice: (attrs?: NoticeAttributes) => boolean
  insertImage: (attrs: { src: string; srcset?: string; alt?: string; caption?: string }) => boolean
  insertLinkPreview: (attrs: LinkPreviewAttributes) => boolean
  insertUrlMention: (attrs: UrlMentionAttributes) => boolean
  openOverlay: (name: string, options?: HtmdOverlayOpenOptions) => boolean
  closeOverlay: (name?: string) => boolean
  enterCompoundBlock: () => boolean
  exitToNormal: () => boolean
}

export interface HtmdEditorOptions {
  element?: HTMLElement
  surfaceElement?: HTMLElement
  content?: JSONContent
  editable?: boolean
  clickToEdit?: boolean
  enforceTitle?: boolean
  headingWithId?: boolean
  editorClass?: string
  services?: EditorHostServices
  nodeViews?: HtmdNodeViews<import('./htmd-editor.js').HtmdEditor>
  overlays?: Readonly<Record<string, HtmdOverlayDefinition>>
  onOverlayChange?: (overlay: HtmdOverlayState | null) => void
  placeholder?: (nodeName: string, level?: number) => string
  mentionSource?: (query: string) => Promise<MentionItem[]>
  hrefBuilder?: (item: MentionItem) => string
  onUpload?: (file: File) => Promise<ImageUploadResult>
  fetchLinkPreview?: LinkPreviewFetcher
  mentionRender?: () => HtmdSuggestionRenderer<MentionItem>
  slashRender?: () => HtmdSuggestionRenderer<SlashCommandItem>
  onchange?: (document: JSONContent) => void
  onedit?: () => boolean
  onexit?: () => void
}

export type HtmdEditorKeymap = Keymap<Editor<JSONContent, HtmdCommandMap>>
