import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, Selection, type EditorState } from '@tiptap/pm/state'
import { CursorManager } from './cursor-manager.js'
import {
  createTextblockNavigation,
  getNodeNavigation,
  type HtmdControlFocusOptions,
} from './define-htmd-extension.js'

const DEFAULT_TEXTBLOCK_NAVIGATION = createTextblockNavigation()

/**
 * Manages block-boundary selection lookup and directional entry or control focus
 * across standard textblocks and custom NodeView blocks.
 */
export class SelectionManager {
  /**
   * Finds the document position of the block immediately following the current
   * selection, or `null` at the end of the document.
   */
  static findNextBlockPos(state: EditorState): number | null {
    const { selection } = state
    if (selection instanceof NodeSelection) {
      return selection.to < state.doc.content.size ? selection.to : null
    }
    const { $from } = selection
    for (let d = $from.depth; d >= 1; d -= 1) {
      const afterPos = $from.after(d)
      if (d === 1 || afterPos < $from.end(d - 1)) {
        return afterPos < state.doc.content.size ? afterPos : null
      }
    }
    return null
  }

  /**
   * Finds the document position of the block immediately preceding the current
   * selection, or `null` at the start of the document.
   */
  static findPrevBlockPos(state: EditorState): number | null {
    const { selection } = state
    if (selection instanceof NodeSelection) {
      if (selection.from <= 0) return null
      const prev = state.doc.resolve(selection.from).nodeBefore
      return prev ? selection.from - prev.nodeSize : null
    }
    const { $from } = selection
    for (let d = $from.depth; d >= 1; d -= 1) {
      const navKind = getNodeNavigation(undefined, $from.node(d).type.name)?.kind
      if (navKind === 'container' || navKind === 'custom') {
        return null
      }
      const beforePos = $from.before(d)
      if (d === 1 || beforePos > $from.start(d - 1)) {
        if (beforePos <= 0) return null
        const prev = state.doc.resolve(beforePos).nodeBefore
        return prev ? beforePos - prev.nodeSize : null
      }
    }
    return null
  }

  /**
   * Enters the block at `pos` from `'down'` (above) or `'up'` (below) using the
   * owning extension's registered `HtmdNodeNavigation` spec.
   */
  static focusBlockAtPos(
    editor: TiptapEditor,
    pos: number,
    direction: 'down' | 'up',
    allowTextblockFallback = false,
  ): boolean {
    const { doc } = editor.state
    if (pos < 0 || pos >= doc.content.size) return false
    const node = doc.nodeAt(pos)
    if (!node) return false

    const nav = getNodeNavigation(editor, node.type.name)
    if (nav) {
      return direction === 'down'
        ? nav.enterFromAbove(editor, pos, node)
        : nav.enterFromBelow(editor, pos, node)
    }

    if (allowTextblockFallback) {
      return direction === 'down'
        ? DEFAULT_TEXTBLOCK_NAVIGATION.enterFromAbove(editor, pos, node)
        : DEFAULT_TEXTBLOCK_NAVIGATION.enterFromBelow(editor, pos, node)
    }

    return false
  }

  /**
   * Focuses a specific interactive control inside the node at `pos` using the
   * owning extension's `navigation.focusControl` hook.
   */
  static focusControlAtPos(
    editor: TiptapEditor,
    pos: number,
    options?: HtmdControlFocusOptions,
  ): boolean {
    const { doc } = editor.state
    if (pos < 0 || pos >= doc.content.size) return false
    const node = doc.nodeAt(pos)
    if (!node) return false
    const nav = getNodeNavigation(editor, node.type.name)
    if (nav?.focusControl) {
      return nav.focusControl(editor, pos, node, options)
    }
    if (nav) {
      return nav.enterFromAbove(editor, pos, node)
    }
    return false
  }

  /**
   * Moves focus to the block or text position immediately before `position`.
   */
  static focusBeforeBlock(editor: TiptapEditor, position: number): boolean {
    const { doc } = editor.state
    const clamped = Math.max(0, Math.min(doc.content.size, position))
    const $resolved = doc.resolve(clamped)
    if ($resolved.nodeBefore) {
      const prevPos = clamped - $resolved.nodeBefore.nodeSize
      if (SelectionManager.focusBlockAtPos(editor, prevPos, 'up')) {
        return true
      }
    }
    const selection = Selection.findFrom($resolved, -1, true)
    if (!selection) return false
    CursorManager.clearActiveCompoundBlockPos(editor)
    editor.commands.setTextSelection(selection.from)
    CursorManager.focusEditorView(editor)
    return true
  }

  /**
   * Moves focus to the block or text position immediately after `position`.
   */
  static focusAfterBlock(editor: TiptapEditor, position: number): boolean {
    const { doc } = editor.state
    const clamped = Math.max(0, Math.min(doc.content.size, position))
    if (SelectionManager.focusBlockAtPos(editor, clamped, 'down', true)) {
      return true
    }
    const selection = Selection.findFrom(doc.resolve(clamped), 1, true)
    if (!selection) return false
    CursorManager.clearActiveCompoundBlockPos(editor)
    editor.commands.setTextSelection(selection.from)
    CursorManager.focusEditorView(editor)
    return true
  }
}

/**
 * Finds the document position of the block immediately following the current
 * selection, or `null` at the end of the document.
 */
export function findNextBlockPos(state: EditorState): number | null {
  return SelectionManager.findNextBlockPos(state)
}

/**
 * Finds the document position of the block immediately preceding the current
 * selection, or `null` at the start of the document.
 */
export function findPrevBlockPos(state: EditorState): number | null {
  return SelectionManager.findPrevBlockPos(state)
}

/**
 * Enters the block at `pos` from `'down'` (above) or `'up'` (below) using the
 * owning extension's registered `HtmdNodeNavigation` spec.
 */
export function focusBlockAtPos(
  editor: TiptapEditor,
  pos: number,
  direction: 'down' | 'up',
  allowTextblockFallback = false,
): boolean {
  return SelectionManager.focusBlockAtPos(editor, pos, direction, allowTextblockFallback)
}

/**
 * Focuses an interactive control inside the node at `pos` using the owning
 * extension's `navigation.focusControl` hook.
 */
export function focusControlAtPos(
  editor: TiptapEditor,
  pos: number,
  options?: HtmdControlFocusOptions,
): boolean {
  return SelectionManager.focusControlAtPos(editor, pos, options)
}

/**
 * Moves focus to the block or text position immediately before `position`.
 */
export function focusBeforeBlock(editor: TiptapEditor, position: number): boolean {
  return SelectionManager.focusBeforeBlock(editor, position)
}

/**
 * Moves focus to the block or text position immediately after `position`.
 */
export function focusAfterBlock(editor: TiptapEditor, position: number): boolean {
  return SelectionManager.focusAfterBlock(editor, position)
}
