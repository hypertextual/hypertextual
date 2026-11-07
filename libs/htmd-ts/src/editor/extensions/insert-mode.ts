import type { KeybindingPreset, KeymapMode } from '@cloudvoyant/helical-ui'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, type Selection, TextSelection } from '@tiptap/pm/state'
import { defineHtmdExtension, type HtmdCommandContext } from '../define-htmd-extension.js'
import {
  dispatchModalTransaction,
  exitModalToNormal,
  getContainerInnerTextBounds,
  getModalStorage,
  modalKeymapPluginKey,
  updateModalMeta,
  type ModalEditingOptions,
  type SubtextCursorState,
} from './modal-editing.js'

// types ---------------------------------------------------------------------

export type InsertEntryOperator = 'insertStart' | 'appendEnd' | 'openBelow' | 'openAbove'

export interface InsertModeStorage {
  enterInsert: (
    editor: TiptapEditor,
    op: InsertEntryOperator,
    options: ModalEditingOptions,
  ) => { enterInsert: boolean } | false
  setModalState: (
    editor: TiptapEditor,
    next: { mode: KeymapMode; preset: KeybindingPreset },
  ) => void
}

// api -----------------------------------------------------------------------

/**
 * Insert-mode modal extension managing entry transitions (`i`/`a`/`o`/`O`),
 * compound-block control focusing (notice title, image caption, bookmark URL),
 * and `Escape` exit back to normal mode with compound block re-selection:
 *
 * ```text
 * Normal `i` on Notice title  -->  Focuses <input aria-label="Notice title">
 * Insert `Escape` inside Notice --> Selects outer Notice block in Normal mode
 * ```
 */
export const InsertMode = defineHtmdExtension<
  Record<string, never>,
  InsertModeStorage,
  {
    exitToNormal: () => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'insertMode',
  kind: 'behavior',
  createStorage: () => ({
    enterInsert: executeInsertModeEntry,
    setModalState: applyModalStateTransition,
  }),
  commands: () => ({
    exitToNormal:
      () =>
      ({ editor }) =>
        exitModalToNormal(editor),
  }),
  keymap: () => ({
    Escape: {
      id: 'htmd.exitToNormal',
      key: 'Escape',
      label: 'Exit Insert Mode',
      category: 'Editor',
      mode: 'insert',
      when: ({ editor }) => editor.isEditable,
      run: ({ editor }) => exitModalToNormal(editor),
    },
  }),
})

// helpers -------------------------------------------------------------------

/**
 * Transitions the editor into `insert` mode using the specified entry operator
 * (`insertStart`, `appendEnd`, `openBelow`, `openAbove`).
 */
export function executeInsertModeEntry(
  editor: TiptapEditor,
  op: InsertEntryOperator,
  options: ModalEditingOptions,
): { enterInsert: boolean } | false {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const storage = getModalStorage(editor)
  if (!storage) return false
  const pluginState = modalKeymapPluginKey.getState(state)

  if (op === 'insertStart') {
    let nextSel: Selection
    if (pluginState?.subtextCursor) {
      const sub = pluginState.subtextCursor
      storage.activeCompoundBlockPos = sub.pos
      storage.focusControlRequest = {
        pos: sub.pos,
        type:
          sub.kind === 'noticeTitle'
            ? 'notice'
            : sub.kind === 'linkPreviewUrl'
              ? 'linkPreview'
              : 'image',
        control:
          sub.kind === 'noticeTitle' ? 'title' : sub.kind === 'linkPreviewUrl' ? 'url' : 'caption',
        offset: sub.offset,
      }
      nextSel = sel
    } else if (
      sel instanceof NodeSelection &&
      (sel.node.type.name === 'notice' || sel.node.type.name === 'codeBlock')
    ) {
      const { firstTextStart } = getContainerInnerTextBounds(sel.node, sel.from)
      nextSel = firstTextStart !== -1 ? TextSelection.create(doc, firstTextStart) : sel
    } else if (sel instanceof NodeSelection) {
      storage.activeCompoundBlockPos = sel.from
      storage.focusControlRequest = { pos: sel.from, type: sel.node.type.name }
      nextSel = sel
    } else {
      nextSel = TextSelection.create(doc, sel.from)
    }
    let tr = state.tr.setSelection(nextSel)
    tr = updateModalMeta(editor, tr, {
      mode: 'insert',
      secondaryRanges: [],
      goalColumn: null,
      subtextCursor: null,
    })
    storage.mode = 'insert'
    dispatchModalTransaction(editor, tr)
    return { enterInsert: true }
  }

  if (op === 'appendEnd') {
    let nextSel: Selection
    if (pluginState?.subtextCursor) {
      const sub = pluginState.subtextCursor
      storage.activeCompoundBlockPos = sub.pos
      storage.focusControlRequest = {
        pos: sub.pos,
        type:
          sub.kind === 'noticeTitle'
            ? 'notice'
            : sub.kind === 'linkPreviewUrl'
              ? 'linkPreview'
              : 'image',
        control:
          sub.kind === 'noticeTitle' ? 'title' : sub.kind === 'linkPreviewUrl' ? 'url' : 'caption',
        offset: sub.offset + 1,
      }
      nextSel = sel
    } else if (
      sel instanceof NodeSelection &&
      (sel.node.type.name === 'notice' || sel.node.type.name === 'codeBlock')
    ) {
      const { lastTextEnd } = getContainerInnerTextBounds(sel.node, sel.from)
      const dest = lastTextEnd !== -1 ? lastTextEnd : sel.to
      nextSel = TextSelection.create(doc, dest)
    } else if (sel instanceof NodeSelection) {
      storage.activeCompoundBlockPos = sel.from
      storage.focusControlRequest = { pos: sel.from, type: sel.node.type.name }
      nextSel = sel
    } else {
      const dest = sel.empty ? Math.min(sel.$head.end(), sel.to + 1) : sel.to
      nextSel = TextSelection.create(doc, dest)
    }
    let tr = state.tr.setSelection(nextSel)
    tr = updateModalMeta(editor, tr, {
      mode: 'insert',
      secondaryRanges: [],
      goalColumn: null,
      subtextCursor: null,
    })
    storage.mode = 'insert'
    dispatchModalTransaction(editor, tr)
    return { enterInsert: true }
  }

  if (op === 'openBelow' || op === 'openAbove') {
    let beforeBlock: number
    let afterBlock: number
    if (sel instanceof NodeSelection && sel.node.isBlock) {
      beforeBlock = sel.from
      afterBlock = sel.to
    } else {
      const $pos = sel.$head
      if ($pos.depth >= 1) {
        beforeBlock = $pos.before(1)
        afterBlock = $pos.after(1)
      } else {
        beforeBlock = sel.from
        afterBlock = sel.to
      }
    }

    const enforceH1 = options.enforceTitle !== false
    const isFirstTitle =
      enforceH1 &&
      beforeBlock === 0 &&
      doc.firstChild?.type.name === 'heading' &&
      doc.firstChild.attrs.level === 1

    const insertPos = op === 'openBelow' || isFirstTitle ? afterBlock : beforeBlock
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return false

    const newParagraph = paragraphType.create()
    let tr = closeHistory(state.tr).insert(insertPos, newParagraph)
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
    tr = updateModalMeta(editor, tr, { mode: 'insert', secondaryRanges: [], extendedRange: null })
    storage.mode = 'insert'
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return { enterInsert: true }
  }

  return false
}

/**
 * Applies a modal mode/preset transition to `editor` and restores compound-block
 * node selection when exiting `insert` mode back to `normal` mode.
 */
export function applyModalStateTransition(
  editor: TiptapEditor,
  { mode: nextMode, preset: nextPreset }: { mode: KeymapMode; preset: KeybindingPreset },
): void {
  const storage = getModalStorage(editor)
  if (!storage) return
  if (!editor.state) {
    storage.mode = nextMode
    storage.preset = nextPreset
    return
  }
  const prev = modalKeymapPluginKey.getState(editor.state)
  const exitingInsert =
    (prev?.mode === 'insert' || storage.mode === 'insert') && nextMode === 'normal'
  let compoundPosToSelect: number | null = null
  if (exitingInsert) {
    if (
      typeof storage.activeCompoundBlockPos === 'number' &&
      storage.activeCompoundBlockPos >= 0 &&
      storage.activeCompoundBlockPos < editor.state.doc.content.size
    ) {
      compoundPosToSelect = storage.activeCompoundBlockPos
    }
    storage.activeCompoundBlockPos = null
  }
  if (
    storage.mode === nextMode &&
    storage.preset === nextPreset &&
    prev?.mode === nextMode &&
    prev?.preset === nextPreset &&
    compoundPosToSelect === null
  ) {
    return
  }
  storage.mode = nextMode
  storage.preset = nextPreset
  if (
    prev &&
    prev.mode === nextMode &&
    prev.preset === nextPreset &&
    prev.secondaryRanges.length === 0 &&
    compoundPosToSelect === null
  ) {
    return
  }
  try {
    let tr = editor.state.tr
    let restoredSubtextCursor: SubtextCursorState | null = null
    if (compoundPosToSelect !== null) {
      const node = editor.state.doc.nodeAt(compoundPosToSelect)
      if (node) {
        if (node.type.name === 'notice' || node.type.name === 'codeBlock') {
          const $cur = editor.state.selection.$from
          let insideThisBlock = false
          for (let d = $cur.depth; d >= 1; d -= 1) {
            if ($cur.before(d) === compoundPosToSelect) {
              insideThisBlock = true
              break
            }
          }
          if (!insideThisBlock) {
            const { firstTextStart } = getContainerInnerTextBounds(node, compoundPosToSelect)
            if (firstTextStart !== -1) {
              tr = tr.setSelection(TextSelection.create(editor.state.doc, firstTextStart))
            }
          }
        } else if (NodeSelection.isSelectable(node)) {
          tr = tr.setSelection(NodeSelection.create(editor.state.doc, compoundPosToSelect))
          if (node.type.name === 'image' || node.type.name === 'imageNode') {
            restoredSubtextCursor = {
              pos: compoundPosToSelect,
              kind: 'imageCaption',
              offset: 0,
            }
          } else if (node.type.name === 'linkPreview' && node.attrs.type !== 'embed') {
            restoredSubtextCursor = {
              pos: compoundPosToSelect,
              kind: 'linkPreviewUrl',
              offset: 0,
            }
          }
        }
      }
    }
    tr = updateModalMeta(editor, tr, {
      mode: nextMode,
      preset: nextPreset,
      goalColumn: null,
      subtextCursor: restoredSubtextCursor,
      ...(nextMode === 'insert' ? { secondaryRanges: [] } : {}),
    })
    dispatchModalTransaction(editor, tr)
  } catch {
    // Ignore if editor is mid-destruction
  }
}
