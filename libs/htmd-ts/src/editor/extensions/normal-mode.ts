import type { KeybindingPreset, ModalMotion, ModalTextObjectSpec } from '@cloudvoyant/helical-ui'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { defineHtmdExtension, type HtmdCommandContext } from '../define-htmd-extension.js'
import {
  collectLeafBlocks,
  collectWords,
  createSafeModalSelection,
  dispatchModalTransaction,
  enterModalCompoundBlock,
  findCurrentBlockIndex,
  getContainerInnerTextBounds,
  getCursorCharPos,
  getSubtextValue,
  modalKeymapPluginKey,
  updateModalMeta,
  type SubtextCursorState,
  type WordToken,
} from './modal-editing.js'
import { isPresetSelectionFirst } from './modal-presets.js'

// types ---------------------------------------------------------------------

export interface NormalModeStorage {
  move: (
    editor: TiptapEditor,
    motion: ModalMotion,
    ctx: { preset: KeybindingPreset; count: number },
  ) => boolean
  selectTextObject: (editor: TiptapEditor, spec: ModalTextObjectSpec) => boolean
}

// api -----------------------------------------------------------------------

/**
 * Normal-mode modal extension handling block-cursor motions (`h`/`j`/`k`/`l`,
 * `w`/`b`/`e`, `0`/`$`, `gg`/`G`, `{`/`}`), subtext cursor navigation across
 * notice titles, image captions, and bookmark URLs, and text objects
 * (`iw`/`aw`, `ip`/`ap`, `ic`/`ac`, `in`/`an`, `il`/`al`):
 *
 * ```text
 * Normal mode:
 *   # Title
 *   Paragraph with [c]ursor and `in` / `an` text objects.
 *   +----------------------------------------------------+
 *   | (i) [N]ote title       <-- subtextCursor navigation|
 *   |     Notice body                                    |
 *   +----------------------------------------------------+
 * ```
 */
export const NormalMode = defineHtmdExtension<
  Record<string, never>,
  NormalModeStorage,
  {
    enterCompoundBlock: () => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'normalMode',
  kind: 'behavior',
  createStorage: () => ({
    move: executeNormalModeMove,
    selectTextObject: executeNormalModeTextObject,
  }),
  commands: () => ({
    enterCompoundBlock:
      () =>
      ({ editor }) =>
        enterModalCompoundBlock(editor),
  }),
  keymap: () => ({
    Enter: {
      id: 'htmd.enterCompoundBlock',
      key: 'Enter',
      label: 'Enter Compound Block',
      category: 'Editor',
      mode: 'normal',
      when: ({ editor }, event) => {
        if (editor.isEditable) return false
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
        return true
      },
      run: ({ editor }) => enterModalCompoundBlock(editor),
    },
  }),
})

// helpers -------------------------------------------------------------------

/**
 * Executes a normal-mode cursor or subtext motion (`h`/`j`/`k`/`l`, `w`/`b`/`e`,
 * `0`/`$`, `gg`/`G`, `{`/`}`).
 */
export function executeNormalModeMove(
  editor: TiptapEditor,
  motion: ModalMotion,
  { preset, count }: { preset: KeybindingPreset; count: number },
): boolean {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const steps = Math.max(1, count)
  const isSelectionFirst = isPresetSelectionFirst(preset)
  const pluginState = modalKeymapPluginKey.getState(state)
  let tr = state.tr

  if (motion === 'wordForward' || motion === 'wordBackward' || motion === 'wordEnd') {
    const words = collectWords(doc)
    if (words.length === 0) return false

    const sub = pluginState?.subtextCursor
    const cursor = sel.head
    const currentWordIdx = sub
      ? words.findIndex(
          (w) =>
            w.subtext &&
            w.subtext.pos === sub.pos &&
            w.subtext.kind === sub.kind &&
            sub.offset >= w.subtext.offsetStart &&
            sub.offset < w.subtext.offsetEnd,
        )
      : words.findIndex((w) => !w.subtext && cursor >= w.start && cursor < w.end)

    const isAfterCurrent = (w: WordToken): boolean => {
      if (sub) {
        if (w.subtext && w.subtext.pos === sub.pos && w.subtext.kind === sub.kind) {
          return motion === 'wordEnd'
            ? w.subtext.offsetEnd > sub.offset + 1
            : w.subtext.offsetStart > sub.offset
        }
        return w.start > sub.pos
      }
      if (w.subtext) return w.subtext.pos >= cursor
      return motion === 'wordEnd' ? w.end > cursor : w.start > cursor
    }

    const isBeforeCurrent = (w: WordToken): boolean => {
      if (sub) {
        if (w.subtext && w.subtext.pos === sub.pos && w.subtext.kind === sub.kind) {
          return w.subtext.offsetStart < sub.offset
        }
        return w.start < sub.pos
      }
      const backRef = sel.empty ? cursor : sel.from
      if (w.subtext) return w.subtext.pos < backRef
      return w.start < backRef
    }

    let targetWord: WordToken | undefined
    if (motion === 'wordForward') {
      const idx = words.findIndex(isAfterCurrent)
      if (idx === -1) {
        targetWord = words[words.length - 1]
      } else if (isSelectionFirst && currentWordIdx !== -1 && sel.empty && !sub?.anchorOffset) {
        targetWord = words[Math.min(words.length - 1, currentWordIdx + (steps - 1))]
      } else {
        targetWord = words[Math.min(words.length - 1, idx + steps - 1)]
      }
    } else if (motion === 'wordEnd') {
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

    if (targetWord.subtext) {
      const st = targetWord.subtext
      const node = doc.nodeAt(st.pos)
      if (node) {
        if (st.kind === 'noticeTitle') {
          const { firstTextStart } = getContainerInnerTextBounds(node, st.pos)
          if (firstTextStart !== -1) {
            tr = tr.setSelection(TextSelection.create(doc, firstTextStart))
          }
        } else if (NodeSelection.isSelectable(node)) {
          tr = tr.setSelection(NodeSelection.create(doc, st.pos))
        }
      }
      const nextSubtext: SubtextCursorState = isSelectionFirst
        ? {
            pos: st.pos,
            kind: st.kind,
            offset: motion === 'wordBackward' ? st.offsetStart : st.offsetEnd,
            anchorOffset: motion === 'wordBackward' ? st.offsetEnd : st.offsetStart,
          }
        : {
            pos: st.pos,
            kind: st.kind,
            offset:
              motion === 'wordEnd' ? Math.max(st.offsetStart, st.offsetEnd - 1) : st.offsetStart,
          }
      tr = updateModalMeta(editor, tr, {
        goalColumn: null,
        extendedRange: null,
        subtextCursor: nextSubtext,
      })
      dispatchModalTransaction(editor, tr.scrollIntoView())
      return true
    }

    if (isSelectionFirst) {
      tr =
        motion === 'wordBackward'
          ? tr.setSelection(TextSelection.create(doc, targetWord.end, targetWord.start))
          : tr.setSelection(TextSelection.create(doc, targetWord.start, targetWord.end))
    } else {
      const destPos =
        motion === 'wordEnd' ? Math.max(targetWord.start, targetWord.end - 1) : targetWord.start
      tr = tr.setSelection(TextSelection.create(doc, destPos))
    }

    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: null,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'lineStart' || motion === 'lineEnd') {
    if (pluginState?.subtextCursor) {
      const sub = pluginState.subtextCursor
      const node = doc.nodeAt(sub.pos)
      const text = node ? getSubtextValue(node, sub.kind) : ''
      const nextOffset = motion === 'lineStart' ? 0 : Math.max(0, text.length - 1)
      tr = updateModalMeta(editor, tr, {
        goalColumn: null,
        extendedRange: null,
        subtextCursor: { pos: sub.pos, kind: sub.kind, offset: nextOffset },
      })
      dispatchModalTransaction(editor, tr.scrollIntoView())
      return true
    }
    if (sel instanceof NodeSelection) return true
    const cursorPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
    const $head = doc.resolve(cursorPos)
    if (!$head.parent.isTextblock) return false
    const blocks = collectLeafBlocks(doc)
    const lineBlock = blocks.find(
      (b) => !b.subtextKind && b.isTextblock && cursorPos >= b.start && cursorPos <= b.end,
    )
    const dest =
      motion === 'lineStart'
        ? lineBlock
          ? lineBlock.start
          : $head.start()
        : lineBlock
          ? lineBlock.end
          : $head.end()
    tr = tr.setSelection(TextSelection.create(doc, dest))
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: null,
      subtextCursor: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'docStart' || motion === 'docEnd') {
    const edgeSel = motion === 'docStart' ? Selection.atStart(doc) : Selection.atEnd(doc)
    tr = tr.setSelection(edgeSel)
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: null,
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

    if (targetBlock.subtextKind) {
      nextSubtextCursor = {
        pos: targetBlock.pos,
        kind: targetBlock.subtextKind,
        offset: 0,
      }
      if (targetBlock.subtextKind === 'noticeTitle') {
        const { firstTextStart } = getContainerInnerTextBounds(targetBlock.node, targetBlock.pos)
        if (firstTextStart !== -1) {
          tr = tr.setSelection(TextSelection.create(doc, firstTextStart))
        } else if (NodeSelection.isSelectable(targetBlock.node)) {
          tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
        }
      } else if (NodeSelection.isSelectable(targetBlock.node)) {
        tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
      }
    } else if (targetBlock.isAtom && NodeSelection.isSelectable(targetBlock.node)) {
      tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
    } else if (isSelectionFirst) {
      tr = tr.setSelection(TextSelection.create(doc, targetBlock.start, targetBlock.end))
    } else {
      tr = tr.setSelection(TextSelection.create(doc, targetBlock.start))
    }

    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: null,
      subtextCursor: nextSubtextCursor,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  if (motion === 'left' || motion === 'right') {
    const dir = motion === 'left' ? -1 : 1
    if (doc.content.size === 0) return false

    if (pluginState?.subtextCursor) {
      const sub = pluginState.subtextCursor
      const node = doc.nodeAt(sub.pos)
      const text = node ? getSubtextValue(node, sub.kind) : ''
      const maxOffset = Math.max(0, text.length - 1)
      const nextOffset = Math.max(0, Math.min(maxOffset, sub.offset + dir * steps))
      tr = updateModalMeta(editor, tr, {
        goalColumn: null,
        extendedRange: null,
        subtextCursor: { pos: sub.pos, kind: sub.kind, offset: nextOffset },
      })
      dispatchModalTransaction(editor, tr.scrollIntoView())
      return true
    }

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
          const atomPos = dir > 0 ? targetPos : targetPos - childNode.nodeSize
          tr = tr.setSelection(NodeSelection.create(doc, atomPos))
          tr = updateModalMeta(editor, tr, {
            goalColumn: null,
            extendedRange: null,
            subtextCursor: null,
          })
          dispatchModalTransaction(editor, tr.scrollIntoView())
          return true
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

    tr = tr.setSelection(TextSelection.create(doc, targetPos))
    tr = updateModalMeta(editor, tr, {
      goalColumn: null,
      extendedRange: null,
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

    if (targetBlock.subtextKind) {
      const textLen = (targetBlock.subtextText ?? '').length
      const targetOffset = textLen > 0 ? Math.min(goalCol, textLen - 1) : 0
      nextSubtextCursor = {
        pos: targetBlock.pos,
        kind: targetBlock.subtextKind,
        offset: targetOffset,
      }
      if (targetBlock.subtextKind === 'noticeTitle') {
        const { firstTextStart } = getContainerInnerTextBounds(targetBlock.node, targetBlock.pos)
        if (firstTextStart !== -1) {
          tr = tr.setSelection(TextSelection.create(doc, firstTextStart))
        } else if (NodeSelection.isSelectable(targetBlock.node)) {
          tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
        }
      } else if (NodeSelection.isSelectable(targetBlock.node)) {
        tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
      }
    } else if (targetBlock.isAtom && NodeSelection.isSelectable(targetBlock.node)) {
      tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
    } else {
      const nextHead = Math.min(targetBlock.start + goalCol, targetBlock.end)
      tr = tr.setSelection(TextSelection.create(doc, nextHead))
    }

    tr = updateModalMeta(editor, tr, {
      goalColumn: goalCol,
      extendedRange: null,
      subtextCursor: nextSubtextCursor,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  return false
}

/**
 * Selects the requested inner/around text object (`iw`, `aw`, `ip`, `ap`, `ib`,
 * `ab`) in `editor` and transitions to `select` mode.
 */
export function executeNormalModeTextObject(
  editor: TiptapEditor,
  spec: ModalTextObjectSpec,
): boolean {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const isInner = spec.startsWith('i')
  const kind = spec.slice(1)

  if (kind === 'w') {
    const words = collectWords(doc)
    if (words.length === 0) return false
    const cursor = sel.head
    const matched =
      words.find((w) => cursor >= w.start && cursor <= w.end) ??
      words.find((w) => w.start >= cursor) ??
      words[words.length - 1]!

    let from = matched.start
    let to = matched.end

    if (!isInner) {
      const $end = doc.resolve(to)
      const afterText = doc.textBetween(to, $end.end(), '')
      const trailingWs = /^\s+/.exec(afterText)
      if (trailingWs) {
        to += trailingWs[0].length
      } else {
        const $start = doc.resolve(from)
        const beforeText = doc.textBetween($start.start(), from, '')
        const leadingWs = /\s+$/.exec(beforeText)
        if (leadingWs) {
          from -= leadingWs[0].length
        }
      }
    }

    const tr = state.tr.setSelection(TextSelection.create(doc, from, to))
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  const matchesNodeType = (typeName: string): boolean => {
    switch (kind) {
      case 'p':
        return typeName === 'paragraph' || typeName === 'heading'
      case 'c':
        return typeName === 'codeBlock'
      case 'n':
        return typeName === 'notice' || typeName === 'blockquote'
      case 'l':
        return typeName === 'listItem' || typeName === 'taskItem'
      default:
        return false
    }
  }

  const $head = sel.$head
  let targetNode = null
  let targetPos = -1

  if (sel instanceof NodeSelection && matchesNodeType(sel.node.type.name)) {
    targetNode = sel.node
    targetPos = sel.from
  } else {
    for (let d = $head.depth; d >= 1; d -= 1) {
      const ancestor = $head.node(d)
      if (matchesNodeType(ancestor.type.name)) {
        targetNode = ancestor
        targetPos = $head.before(d)
        break
      }
    }
  }

  if (!targetNode || targetPos < 0) return false

  const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(targetNode, targetPos)
  if (firstTextStart === -1 || lastTextEnd === -1) return false

  if (isInner) {
    let tr = state.tr.setSelection(TextSelection.create(doc, firstTextStart, lastTextEnd))
    tr = updateModalMeta(editor, tr, { extendedRange: null })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  let tr = state.tr.setSelection(
    createSafeModalSelection(doc, targetPos, targetPos + targetNode.nodeSize),
  )
  tr = updateModalMeta(editor, tr, {
    extendedRange: { anchor: targetPos, head: targetPos + targetNode.nodeSize },
  })
  dispatchModalTransaction(editor, tr.scrollIntoView())
  return true
}
