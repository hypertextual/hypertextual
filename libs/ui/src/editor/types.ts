import type { ImageUploadResult } from '@cloudvoyant/helical-ui'
import type { EditorDocument } from './document'

export interface EditorAsset extends ImageUploadResult {
  source: string
}

export interface EditorAssets {
  resolve: (source: string) => Promise<string>
  upload: (file: File) => Promise<EditorAsset>
}

export interface EditorChange {
  source: string
  title: string
}

export interface EditorFailure {
  message: string
  title: string
}

export interface EditorHandle {
  focus: () => void
}

export interface DocumentEditorProps {
  document: EditorDocument
  editable?: boolean
  onchange: (change: EditorChange) => void
  onerror: (failure: EditorFailure) => void
}
