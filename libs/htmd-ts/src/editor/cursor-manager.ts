import type { Editor as TiptapEditor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Manages visual-line cursor boundary checks, NodeView control target lookup,
 * and active compound-block cursor state for a Tiptap/ProseMirror editor.
 */
export class CursorManager {
  /**
   * Records or clears the document position of the currently active compound
   * block in modal storage so `Escape` can restore a `NodeSelection` on that block.
   */
  static setActiveCompoundBlockPos(editor: TiptapEditor, pos: number | null): void {
    const modalStorage = (
      editor.storage as { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
    )?.modalKeymap
    if (modalStorage) modalStorage.activeCompoundBlockPos = pos
  }

  /**
   * Clears the active compound-block position in modal storage.
   */
  static clearActiveCompoundBlockPos(editor: TiptapEditor): void {
    CursorManager.setActiveCompoundBlockPos(editor, null)
  }

  /**
   * Returns `true` when the caret is on the first visual line of a textblock
   * (no preceding newline, `hardBreak`, or wrapped line above).
   */
  static isAtFirstVisualLine(view: EditorView, state: EditorState): boolean {
    const { selection } = state
    if (!selection.empty || !selection.$from.parent.isTextblock) return false
    const { $from } = selection
    const textBefore = $from.parent.textBetween(0, $from.parentOffset)
    if (textBefore.includes('\n')) return false
    let hasHardBreakBefore = false
    $from.parent.nodesBetween(0, $from.parentOffset, (node) => {
      if (node.type.name === 'hardBreak') hasHardBreakBefore = true
    })
    if (hasHardBreakBefore) return false
    try {
      const cursorCoords = view.coordsAtPos(selection.from)
      const startCoords = view.coordsAtPos($from.start())
      if (cursorCoords.top > startCoords.top + 2) return false
    } catch {
      // Headless environment without layout coordinates
    }
    return true
  }

  /**
   * Returns `true` when the caret is on the last visual line of a textblock
   * (no trailing newline, `hardBreak`, or wrapped line below).
   */
  static isAtLastVisualLine(view: EditorView, state: EditorState): boolean {
    const { selection } = state
    if (!selection.empty || !selection.$from.parent.isTextblock) return false
    const { $from } = selection
    const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size)
    if (textAfter.includes('\n')) return false
    let hasHardBreakAfter = false
    $from.parent.nodesBetween($from.parentOffset, $from.parent.content.size, (node) => {
      if (node.type.name === 'hardBreak') hasHardBreakAfter = true
    })
    if (hasHardBreakAfter) return false
    try {
      const cursorCoords = view.coordsAtPos(selection.from)
      const endCoords = view.coordsAtPos($from.end())
      if (cursorCoords.top < endCoords.top - 2) return false
    } catch {
      // Headless environment without layout coordinates
    }
    return true
  }

  /**
   * Resolves the focused `contenteditable="false"` NodeView control, its outer
   * `.node-<nodeTypeName>` wrapper element, and its ProseMirror document position.
   */
  static findNodeViewControl(
    state: EditorState,
    event: KeyboardEvent,
    nodeTypeName: string,
  ): { target: HTMLElement; wrapper: HTMLElement; pos: number; node: PMNode } | null {
    const rawTarget =
      event.target instanceof HTMLElement
        ? event.target
        : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
    if (!rawTarget) return null
    const wrapper = rawTarget.closest<HTMLElement & { __htmdGetPos?: () => number | undefined }>(
      `.node-${nodeTypeName}`,
    )
    if (!wrapper || !rawTarget.closest('[contenteditable="false"]')) return null
    const pos = wrapper.__htmdGetPos?.()
    if (typeof pos !== 'number') return null
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== nodeTypeName) return null
    return { target: rawTarget, wrapper, pos, node }
  }

  /**
   * Blurs any focused descendant control inside the ProseMirror root before
   * focusing the editor view so WebKit and Chromium reliably return focus to `.ProseMirror`.
   */
  static focusEditorView(editor: TiptapEditor): void {
    try {
      const viewDom = editor.view?.dom
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null
      if (
        viewDom &&
        activeEl instanceof HTMLElement &&
        activeEl !== viewDom &&
        viewDom.contains(activeEl)
      ) {
        activeEl.blur()
      }
      editor.view?.focus()
    } catch {
      // Headless editor view
    }
  }

  /**
   * Moves the ProseMirror text caret to `position` (clamped to document bounds)
   * and focuses the editor view.
   */
  static focusTextPosition(editor: TiptapEditor, position: number): boolean {
    const clamped = Math.max(0, Math.min(editor.state.doc.content.size, position))
    editor.commands.setTextSelection(clamped)
    CursorManager.focusEditorView(editor)
    return true
  }
}

/**
 * Returns `true` when the caret is on the first visual line of a textblock.
 */
export function isAtFirstVisualLine(view: EditorView, state: EditorState): boolean {
  return CursorManager.isAtFirstVisualLine(view, state)
}

/**
 * Returns `true` when the caret is on the last visual line of a textblock.
 */
export function isAtLastVisualLine(view: EditorView, state: EditorState): boolean {
  return CursorManager.isAtLastVisualLine(view, state)
}

/**
 * Resolves the focused `contenteditable="false"` NodeView control and its
 * ProseMirror node position for `nodeTypeName`.
 */
export function findNodeViewControl(
  state: EditorState,
  event: KeyboardEvent,
  nodeTypeName: string,
): { target: HTMLElement; wrapper: HTMLElement; pos: number; node: PMNode } | null {
  return CursorManager.findNodeViewControl(state, event, nodeTypeName)
}

/**
 * Moves the ProseMirror text caret to `position` and focuses the editor view.
 */
export function focusTextPosition(editor: TiptapEditor, position: number): boolean {
  return CursorManager.focusTextPosition(editor, position)
}
