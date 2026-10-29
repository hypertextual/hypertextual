/** Shared presentation state for the editor and its mounted node views. */
export interface EditorMode {
  editable: boolean
}

export const editorModeKey = Symbol('editorMode')
