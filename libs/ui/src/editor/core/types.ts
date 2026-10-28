// libs/helical-ui/src/editor/types.ts
// Framework-agnostic contracts shared by the Svelte and React editor packages.
//
// This module must stay free of `svelte` and `react` imports: the Svelte and React packages
// each consume these types and supply their own node-view renderers (see EditorNodeViews).
import type { Editor, Range } from '@tiptap/core'
import type { SuggestionOptions } from '@tiptap/suggestion'

export interface EditorCounts {
  wordCount: number
  charCount: number
  /** Rough page estimate (words / 300), floored at 1. */
  pageCount: number
  /** Estimated reading time in minutes (words / 250), floored at 1. */
  readDuration: number
}

export interface MentionItem {
  id: string
  label: string
  /** e.g. "post" | "series" | "user" */
  type: string
  seriesId?: string | null
  title?: string
}

/**
 * A suggestion-list element the framework menus augment with their own keydown handler, so the
 * Tiptap suggestion bridge can delegate arrow/Enter handling to the mounted menu.
 */
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

/** Resolve bookmark metadata through an app-owned server or a CORS-enabled metadata service. */
export type LinkPreviewFetcher = (
  url: string,
) => Promise<Omit<LinkPreviewAttributes, 'url' | 'type'>>

export interface ImageUploadResult {
  src: string
  srcset?: string
}

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: Editor; range: Range }) => void
  category: 'suggested' | 'basic' | 'media' | 'advanced'
  shortcut?: string
}

/**
 * A zero-argument `addNodeView` implementation, produced per framework by binding a component
 * to that framework's node-view renderer (`SvelteNodeViewRenderer` / `ReactNodeViewRenderer`).
 * Passing it in pre-bound keeps `helical-ui` free of any framework import.
 */
export type NodeViewFactory = () => ReturnType<
  NonNullable<import('@tiptap/core').NodeConfig['addNodeView']>
>

/** Optional renderer supplied when configuring a framework-neutral node. */
export interface NodeViewOptions {
  nodeView?: NodeViewFactory
}

/** The per-framework node views the editor needs. */
export interface EditorNodeViews {
  image: NodeViewFactory
  urlMention: NodeViewFactory
  linkPreview: NodeViewFactory
  codeBlock: NodeViewFactory
  notice?: NodeViewFactory
  /** Override how unrecognized block source is displayed, without changing stored text. */
  unparsedBlock?: NodeViewFactory
  /** Override how unrecognized inline source is displayed, without changing stored text. */
  unparsedInline?: NodeViewFactory
}

/**
 * App-specific seams. These replace behaviour the source editor hardcoded, so the component
 * stays app-agnostic: mention search, internal-link hrefs, image upload, and bookmark metadata
 * loading.
 */
export interface EditorSeams {
  /** Replaces the source editor's hardcoded internal-search fetch. */
  mentionSource?: (query: string) => Promise<MentionItem[]>
  /** Replaces the source editor's hardcoded `/read/...` href construction. */
  hrefBuilder?: (item: MentionItem) => string
  /** Replaces the app-specific image upload. */
  onUpload?: (file: File) => Promise<ImageUploadResult>
  /** Resolves Open Graph or SEO metadata for bookmark cards. */
  fetchLinkPreview?: LinkPreviewFetcher
}

/** Layout and scroll behavior for a registered overlay, in CSS pixels. */
export interface EditorOverlayDefinition extends OverlayPlacementOptions {
  lockScroll?: boolean
}

export interface OverlayPlacementOptions {
  width: number
  height: number
  gap?: number
  viewportGap?: number
  placement?: 'top' | 'bottom'
  align?: 'start' | 'center'
}

export interface EditorOverlayRect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Read the latest anchor after the framework has rendered. */
export interface EditorOverlaySurfaceOptions extends OverlayPlacementOptions {
  anchor: () => number | 'selection' | EditorOverlayRect | null
  lockScroll?: boolean | (() => boolean)
}

/** Refresh after framework state changes; release when the surface unmounts. */
export interface EditorOverlayBinding {
  update: () => void
  destroy: () => void
}

export interface EditorOverlaysController {
  attach: (surface: HTMLElement, options: EditorOverlaySurfaceOptions) => EditorOverlayBinding
}

/** A request anchored to a document position; omitted positions use the selection. */
export interface EditorOverlayOpenOptions {
  position?: number
  data?: unknown
}

/** Temporary state owned by one editor; this is never part of the saved document. */
export interface EditorOverlayState {
  readonly name: string
  readonly position: number
  readonly definition: EditorOverlayDefinition
  readonly data?: unknown
}

/** Register names and notify a framework renderer when the active overlay changes. */
export interface EditorOverlaysOptions {
  overlays: Readonly<Record<string, EditorOverlayDefinition>>
  onChange?: (overlay: EditorOverlayState | null) => void
}

export interface BuildExtensionsOptions extends EditorSeams {
  nodeViews: EditorNodeViews
  overlays?: EditorOverlaysOptions['overlays']
  onOverlayChange?: EditorOverlaysOptions['onChange']
  /** Placeholder resolver; defaults to "Untitled" for the H1 and "Type '/' for commands" outside code blocks. */
  placeholder?: (nodeName: string, level?: number) => string
  /** Mounts the framework's mention suggestion menu. */
  mentionRender?: SuggestionOptions<MentionItem>['render']
  /** Mounts the framework's slash-command menu. */
  slashRender?: SuggestionOptions<SlashCommandItem>['render']
  /** Keep the editor's required first H1 and title navigation. Defaults to true. */
  enforceTitle?: boolean
  /**
   * The read-only Reader uses heading ids so headings are anchor-linkable; the editor uses the
   * plain heading. When true, StarterKit's heading is disabled and HeadingWithId is used.
   */
  headingWithId?: boolean
}
