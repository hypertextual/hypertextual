import type { Editor, JSONContent, NodeViewProps } from '@tiptap/core'
import type { Snippet } from 'svelte'
import type {
  MentionItem,
  SlashCommandItem,
  ImageUploadResult,
  LinkPreviewAttributes,
  LinkPreviewFetcher,
  EditorOverlayDefinition,
} from '../core'

export type UrlMentionPillProps = NodeViewProps

export interface BubbleMenuProps {
  editor: Editor
}

export interface CursorOverlayProps extends EditorOverlayDefinition {
  editor: Editor
  position: number
  children: Snippet
}

export interface SlashMenuProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface EditorOverlayInputProps {
  editor: Editor
  position: number
  onClose: () => void
}

export interface EditorOverlayViewProps extends EditorOverlayInputProps {
  data?: unknown
  onUpload?: (file: File) => Promise<ImageUploadResult>
  fetchLinkPreview?: LinkPreviewFetcher
}

export interface BookmarkInputProps extends EditorOverlayInputProps {
  /** Optional metadata fetcher; without it a bare bookmark is inserted. */
  fetchLinkPreview?: LinkPreviewFetcher
}

export interface FontColorPickerProps {
  editor: Editor
  visible?: boolean
  mode?: 'color' | 'highlight'
}

export type YouTubeInputProps = EditorOverlayInputProps

export interface EditorProps {
  content?: JSONContent
  editable?: boolean
  onedit?: () => boolean
  /** Keep the required first H1 title. Disable for compact inputs such as mentions. */
  enforceTitle?: boolean
  onchange?: (document: JSONContent) => void
  /** Seam: replaces the source editor's hardcoded internal-search endpoint. */
  mentionSource?: (query: string) => Promise<MentionItem[]>
  /** Seam: replaces the source editor's hardcoded /read/... hrefs. */
  hrefBuilder?: (item: MentionItem) => string
  /** Seam: replaces the source editor's app-specific image upload. */
  onUpload?: (file: File) => Promise<ImageUploadResult>
  /** Resolve Open Graph or SEO metadata for bookmark cards. */
  fetchLinkPreview?: (url: string) => Promise<Omit<LinkPreviewAttributes, 'url' | 'type'>>
}

export type ImageNodeViewProps = NodeViewProps

export interface LinkEditPopoverProps {
  editor: Editor
  initialUrl?: string
  onClose: () => void
}

export type LinkPreviewCardProps = NodeViewProps

export type CodeBlockComponentProps = NodeViewProps

export interface ImageInputProps extends EditorOverlayInputProps {
  onUpload?: (file: File) => Promise<ImageUploadResult>
}

export type NoticeNodeViewProps = NodeViewProps

export interface MentionListProps {
  items: MentionItem[]
  command: (item: Partial<MentionItem>) => void
  clientRect: (() => DOMRect | null) | null
}

export interface ImageFileUploadProps {
  file: File | null
  onFileChange: (file: File | null) => void
  disabled?: boolean
}
