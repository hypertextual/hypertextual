import type { JSONContent } from '@tiptap/core'
import type { ImageUploadResult } from './core'

export type EditorImageUploadResult = ImageUploadResult

export interface EditorHandle {
  focus: () => void
}

export interface DocumentEditorProps {
  document: JSONContent
  editable?: boolean
  onchange: (document: JSONContent) => void
  onUpload?: (file: File) => Promise<EditorImageUploadResult>
}
