import type { JSONContent } from '@tiptap/core'
import type { ImageUploadResult } from './core'

export type EditorImageUploadResult = ImageUploadResult

export interface EditorHandle {
  focus: () => void
  enterCompoundBlock: () => boolean
}

export interface DocumentEditorProps {
  document: JSONContent
  editable?: boolean
  clickToEdit?: boolean
  oneditablechange?: (editable: boolean) => boolean
  class?: string
  contentClass?: string
  onchange: (document: JSONContent) => void
  onUpload?: (file: File) => Promise<EditorImageUploadResult>
}
