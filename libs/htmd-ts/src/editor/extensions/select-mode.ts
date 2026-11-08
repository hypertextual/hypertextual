import type { ModalMotion, ModalSelectionTransform } from '@cloudvoyant/helical-ui'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { defineHtmdExtension } from '../define-htmd-extension.js'
import {
  collectLeafBlocks,
  collectWords,
  computeExtendedRangeAndSelection,
  createSafeModalSelection,
  dispatchModalTransaction,
  findCurrentBlockIndex,
  getCursorCharPos,
  getModalStorage,
  modalKeymapPluginKey,
  updateModalMeta,
  type SecondaryCursorRange,
  type SubtextCursorState,
  type WordToken,
} from './modal-editing.js'

// types ---------------------------------------------------------------------

export interface SelectModeStorage {
  extendSelection: (editor: TiptapEditor, motion: ModalMotion, count: number) => boolean
  selectLines: (editor: TiptapEditor, count: number) => boolean
  transformSelection: (editor: TiptapEditor, action: ModalSelectionTransform) => boolean
}

// api -----------------------------------------------------------------------

/**
 * Select/visual-mode modal extension (`v` / `x`) that extends an anchored
 * selection range across text, blocks, and compound nodes and manages
 * multi-cursor selection transforms (`C`, `,`, `;`, `Alt-;`):
 *
 * ```text
 * Select mode:
 *   Anchor [selected span across blocks and]Cursor
 *   Secondary cursor: [second cursor]
 * ```
 */
export const SelectMode = defineHtmdExtension<Record<string, never>, SelectModeStorage>({
  name: 'selectMode',
  kind: 'behavior',
  createStorage: () => ({
    extendSelection: executeSelectModeExtend,
    selectLines: executeSelectLines,
    transformSelection: executeSelectionTransform,
  }),
})

// helpers -------------------------------------------------------------------

/**
 * Selects or extends whole-line block selections (`x`) by `count` blocks.
 */
export function executeSelectLines(editor: TiptapEditor, count: number): boolean {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const steps = Math.max(1, count)
  const pluginState = modalKeymapPluginKey.getState(state)
  const blocks = collectLeafBlocks(doc)
  if (blocks.length === 0) return false

  const currentFrom = pluginState?.extendedRange
    ? Math.min(pluginState.extendedRange.anchor, pluginState.extendedRange.head)
    : sel.from
  const currentTo = pluginState?.extendedRange
    ? Math.max(pluginState.extendedRange.anchor, pluginState.extendedRange.head)
    : sel.to

  const currentBlockIdx = blocks.findIndex((b) =>
    b.isTextblock
      ? currentFrom >= b.start && currentFrom <= b.end
      : currentFrom >= b.start && currentFrom < b.end,
  )
  const startIdx =
    currentBlockIdx === -1
      ? findCurrentBlockIndex(blocks, doc, sel, pluginState?.extendedRange)
      : currentBlockIdx
  const startBlock = blocks[startIdx]!

  const alreadyCoversCurrent =
    currentFrom < currentTo && currentFrom <= startBlock.start && currentTo >= startBlock.end

  let endBlockIdx = startIdx + (steps - 1)
  if (alreadyCoversCurrent) {
    let currentEndIdx = startIdx
    for (let i = startIdx; i < blocks.length; i += 1) {
      const b = blocks[i]!
      if (currentTo >= b.start && currentTo <= b.end) {
        currentEndIdx = i
      }
    }
    endBlockIdx = currentEndIdx + steps
  }
  const endBlock = blocks[Math.min(blocks.length - 1, endBlockIdx)]!

  let tr = state.tr
  if (startBlock === endBlock && startBlock.isAtom && NodeSelection.isSelectable(startBlock.node)) {
    tr = tr.setSelection(NodeSelection.create(doc, startBlock.pos))
  } else {
    tr = tr.setSelection(createSafeModalSelection(doc, startBlock.start, endBlock.end))
  }
  const nextExtendedRange = { anchor: startBlock.start, head: endBlock.end }
  const storage = getModalStorage(editor)
  if (storage && storage.mode === 'normal') {
    storage.mode = 'select'
    tr = updateModalMeta(editor, tr, {
      mode: 'select',
      goalColumn: null,
      extendedRange: nextExtendedRange,
    })
  } else {
    tr = updateModalMeta(editor, tr, { goalColumn: null, extendedRange: nextExtendedRange })
  }
  dispatchModalTransaction(editor, tr.scrollIntoView())
  return true
}

/**
 * Extends the active modal selection in `editor` along `motion` by `count` steps.
 */
export function executeSelectModeExtend(
  editor: TiptapEditor,
  motion: ModalMotion,
  count: number,
): boolean {
  if (motion === 'lineSelect') {
    return executeSelectLines(editor, count)
  }

  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const steps = Math.max(1, count)
  const pluginState = modalKeymapPluginKey.getState(state)
  let tr = state.tr

  if (motion === 'wordForward' || motion === 'wordBackward' || motion === 'wordEnd') {
    const words = collectWords(doc)
    if (words.length === 0) return false
    const cursor = sel.head
    const isAfterCurrent = (w: WordToken): boolean =>
      w.subtext ? w.subtext.pos >= cursor : motion === 'wordEnd' ? w.end > cursor : w.start > cursor
    const isBeforeCurrent = (w: WordToken): boolean => {
      const backRef = sel.empty ? cursor : sel.from
      return w.subtext ? w.subtext.pos < backRef : w.start < backRef
    }

    let targetWord: WordToken | undefined
    if (motion === 'wordForward' || motion === 'wordEnd') {
      const idx = words.findIndex(isAfterCurrent)
      targetWord =
        idx === -1 ? words[words.length - 1] : words[Math.min(words.length - 1, idx + steps - 1)]
    } else {
      let idx = -1
      for (let i = words.length - 1; i >= 0; i -= 1) {
        if (isBeforeCurrent(words[i]!)) {
          idx = i
          break
        }
      }
      targetWord = idx === -1 ? words[0] : words[Math.max(0, idx - (steps - 1))]
    }
    if (!targetWord) return false

    const nextCursor =
      motion === 'wordBackward' ? targetWord.start : Math.max(targetWord.start, targetWord.end - 1)
    const ext = computeExtendedRangeAndSelection(
      doc,
      sel,
      nextCursor,
      undefined,
      pluginState?.extendedRange,
    )
    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: ext.extendedRange,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'lineStart' || motion === 'lineEnd') {
    const cursorPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
    const $head = doc.resolve(cursorPos)
    if (!$head.parent.isTextblock) return false
    const blocks = collectLeafBlocks(doc)
    const lineBlock = blocks.find(
      (b) => !b.subtextKind && b.isTextblock && cursorPos >= b.start && cursorPos <= b.end,
    )
    const lineStartPos = lineBlock ? lineBlock.start : $head.start()
    const lineEndPos = lineBlock ? lineBlock.end : $head.end()
    const dest = motion === 'lineStart' ? lineStartPos : Math.max(lineStartPos, lineEndPos - 1)
    const ext = computeExtendedRangeAndSelection(
      doc,
      sel,
      dest,
      undefined,
      pluginState?.extendedRange,
    )
    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: ext.extendedRange,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'docStart' || motion === 'docEnd') {
    const edgeSel = motion === 'docStart' ? Selection.atStart(doc) : Selection.atEnd(doc)
    const dest =
      motion === 'docStart' ? edgeSel.head : Math.max(edgeSel.$head.start(), edgeSel.head - 1)
    const ext = computeExtendedRangeAndSelection(
      doc,
      sel,
      dest,
      undefined,
      pluginState?.extendedRange,
    )
    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: ext.extendedRange,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'paragraphForward' || motion === 'paragraphBackward') {
    const dir = motion === 'paragraphForward' ? 1 : -1
    const blocks = collectLeafBlocks(doc)
    if (blocks.length === 0) return false
    const currentIdx = findCurrentBlockIndex(
      blocks,
      doc,
      sel,
      pluginState?.extendedRange,
      pluginState?.subtextCursor,
    )
    const targetIdx = Math.max(0, Math.min(blocks.length - 1, currentIdx + dir * steps))
    const targetBlock = blocks[targetIdx]!
    let nextSubtextCursor: SubtextCursorState | null = null
    let ext: { selection: Selection; extendedRange: { anchor: number; head: number } }

    if (targetBlock.isAtom) {
      ext = computeExtendedRangeAndSelection(
        doc,
        sel,
        targetBlock.start,
        targetBlock,
        pluginState?.extendedRange,
      )
    } else if (targetBlock.subtextKind) {
      nextSubtextCursor = { pos: targetBlock.pos, kind: targetBlock.subtextKind, offset: 0 }
      ext = computeExtendedRangeAndSelection(
        doc,
        sel,
        targetBlock.start,
        undefined,
        pluginState?.extendedRange,
      )
    } else {
      const dest = dir > 0 ? Math.max(targetBlock.start, targetBlock.end - 1) : targetBlock.start
      ext = computeExtendedRangeAndSelection(doc, sel, dest, undefined, pluginState?.extendedRange)
    }

    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: ext.extendedRange,
      subtextCursor: nextSubtextCursor,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'left' || motion === 'right') {
    const dir = motion === 'left' ? -1 : 1
    if (doc.content.size === 0) return false
    let targetPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
    for (let i = 0; i < steps; i += 1) {
      const $pos = doc.resolve(targetPos)
      const nextInBlock = targetPos + dir
      if ($pos.parent.isTextblock && nextInBlock >= $pos.start() && nextInBlock <= $pos.end()) {
        const childNode = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore
        if (
          childNode &&
          childNode.isAtom &&
          !childNode.isText &&
          NodeSelection.isSelectable(childNode)
        ) {
          targetPos = dir > 0 ? targetPos : targetPos - childNode.nodeSize
          continue
        }
        targetPos = nextInBlock
      } else {
        const found = Selection.findFrom(
          doc.resolve(Math.max(0, Math.min(doc.content.size, targetPos + dir))),
          dir,
          true,
        )
        if (found) targetPos = found.head
      }
    }
    const ext = computeExtendedRangeAndSelection(
      doc,
      sel,
      targetPos,
      undefined,
      pluginState?.extendedRange,
    )
    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: ext.extendedRange,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'down' || motion === 'up') {
    const dir = motion === 'down' ? 1 : -1
    const blocks = collectLeafBlocks(doc)
    if (blocks.length === 0) return false

    const cursorPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
    const currentIdx = findCurrentBlockIndex(
      blocks,
      doc,
      sel,
      pluginState?.extendedRange,
      pluginState?.subtextCursor,
    )
    const currentBlock = blocks[currentIdx]!
    const currentColumn = currentBlock.subtextKind
      ? (pluginState?.subtextCursor?.offset ?? 0)
      : currentBlock.isTextblock
        ? Math.max(0, cursorPos - currentBlock.start)
        : 0
    const goalCol = pluginState?.goalColumn ?? currentColumn
    const targetIdx = Math.max(0, Math.min(blocks.length - 1, currentIdx + dir * steps))
    const targetBlock = blocks[targetIdx]!
    let nextSubtextCursor: SubtextCursorState | null = null
    let ext: { selection: Selection; extendedRange: { anchor: number; head: number } }

    if (targetBlock.isAtom) {
      ext = computeExtendedRangeAndSelection(
        doc,
        sel,
        targetBlock.start,
        targetBlock,
        pluginState?.extendedRange,
      )
    } else if (targetBlock.subtextKind) {
      const textLen = (targetBlock.subtextText ?? '').length
      const targetOffset = textLen > 0 ? Math.min(goalCol, textLen - 1) : 0
      nextSubtextCursor = {
        pos: targetBlock.pos,
        kind: targetBlock.subtextKind,
        offset: targetOffset,
      }
      ext = computeExtendedRangeAndSelection(
        doc,
        sel,
        targetBlock.start,
        undefined,
        pluginState?.extendedRange,
      )
    } else {
      const maxTargetPos =
        targetBlock.end > targetBlock.start ? targetBlock.end - 1 : targetBlock.start
      const nextHead = dir > 0 ? maxTargetPos : Math.min(targetBlock.start + goalCol, maxTargetPos)
      ext = computeExtendedRangeAndSelection(
        doc,
        sel,
        nextHead,
        undefined,
        pluginState?.extendedRange,
      )
    }

    tr = tr.setSelection(ext.selection)
    tr = updateModalMeta(editor, tr, {
      goalColumn: goalCol,
      extendedRange: ext.extendedRange,
      subtextCursor: nextSubtextCursor,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  return false
}

/**
 * Applies a selection transformation (`collapse`, `flip`, `addBelow`, `addAbove`,
 * `selectAll`, `keepPrimary`) to the active primary and secondary modal ranges.
 */
export function executeSelectionTransform(
  editor: TiptapEditor,
  action: ModalSelectionTransform,
): boolean {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const pluginState = modalKeymapPluginKey.getState(state)
  const currentSecondary = pluginState?.secondaryRanges ?? []

  if (action === 'collapse') {
    const nextSelection =
      sel instanceof NodeSelection ? sel : TextSelection.create(doc, getCursorCharPos(doc, sel))
    let tr = state.tr.setSelection(nextSelection)
    tr = updateModalMeta(editor, tr, { secondaryRanges: [] })
    dispatchModalTransaction(editor, tr)
    return true
  }

  if (action === 'flip') {
    if (sel.empty || sel instanceof NodeSelection) return false
    const tr = state.tr.setSelection(TextSelection.create(doc, sel.head, sel.anchor))
    dispatchModalTransaction(editor, tr)
    return true
  }

  if (action === 'keepPrimary') {
    const tr = updateModalMeta(editor, state.tr, { secondaryRanges: [] })
    dispatchModalTransaction(editor, tr)
    return true
  }

  if (action === 'addCursorBelow' || action === 'addCursorAbove') {
    const dir = action === 'addCursorBelow' ? 1 : -1
    const blocks = collectLeafBlocks(doc).filter((b) => b.isTextblock)
    if (blocks.length < 2) return false

    const referenceHead =
      currentSecondary.length > 0 ? currentSecondary[currentSecondary.length - 1]!.head : sel.head
    const currentIdx = blocks.findIndex((b) => referenceHead >= b.start && referenceHead <= b.end)
    if (currentIdx === -1) return false
    const nextIdx = currentIdx + dir
    if (nextIdx < 0 || nextIdx >= blocks.length) return false

    const currBlock = blocks[currentIdx]!
    const nextBlock = blocks[nextIdx]!
    const colOffset = referenceHead - currBlock.start
    const selLength = Math.max(0, sel.to - sel.from)

    const nextFrom = Math.min(nextBlock.start + colOffset, nextBlock.end)
    const nextTo = Math.min(nextFrom + selLength, nextBlock.end)
    const nextRange: SecondaryCursorRange = {
      from: nextFrom,
      to: nextTo,
      head: nextTo,
    }

    const tr = updateModalMeta(editor, state.tr, {
      secondaryRanges: [...currentSecondary, nextRange],
    })
    dispatchModalTransaction(editor, tr)
    return true
  }

  return false
}
