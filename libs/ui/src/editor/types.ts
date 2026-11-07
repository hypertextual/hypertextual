import type { EditorHostServices } from 'core-ts'
import type { ImageUploadResult, JSONContent } from 'htmd-ts'

export type EditorImageUploadResult = ImageUploadResult

export interface EditorHandle {
  focus: () => void
  enterCompoundBlock: () => boolean
}

export interface HtmdEditorProps {
  document: JSONContent
  editable?: boolean
  clickToEdit?: boolean
  oneditablechange?: (editable: boolean) => boolean
  class?: string
  contentClass?: string
  onchange: (document: JSONContent) => void
  onUpload?: (file: File) => Promise<EditorImageUploadResult>
  services?: EditorHostServices
}
