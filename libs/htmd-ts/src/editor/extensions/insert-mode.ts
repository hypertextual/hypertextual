import type { KeybindingPreset, KeymapMode } from '@cloudvoyant/helical-ui'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, type Selection, TextSelection } from '@tiptap/pm/state'
import {
  defineHtmdExtension,
  getNodeNavigation,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
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
 * compound-block control focusing (via each node extension's `navigation` spec),
 * and `Escape` exit back to normal mode with compound block re-selection:
 *
 * ```text
 * Normal `i` on subtext       -->  Focuses the owning extension's subtext input
 * Insert `Escape` inside block --> Selects outer compound block in Normal mode
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

  if (op === 'insertStart' || op === 'appendEnd') {
    const isAppend = op === 'appendEnd'
    let nextSel: Selection
    if (pluginState?.subtextCursor) {
      const sub = pluginState.subtextCursor
      const subNode = doc.nodeAt(sub.pos)
      const subNav = subNode ? getNodeNavigation(editor, subNode.type.name) : undefined
      storage.activeCompoundBlockPos = sub.pos
      storage.focusControlRequest = {
        pos: sub.pos,
        type: subNode?.type.name ?? '',
        control: subNav?.subtext?.control,
        offset: isAppend ? sub.offset + 1 : sub.offset,
      }
      nextSel = sel
    } else if (sel instanceof NodeSelection) {
      const nav = getNodeNavigation(editor, sel.node.type.name)
      storage.activeCompoundBlockPos = sel.from
      if (nav?.kind === 'container' || nav?.kind === 'inplace') {
        const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(sel.node, sel.from)
        const dest = isAppend ? (lastTextEnd !== -1 ? lastTextEnd : sel.to) : firstTextStart
        nextSel = dest !== -1 ? TextSelection.create(doc, dest) : sel
      } else {
        storage.focusControlRequest = {
          pos: sel.from,
          type: sel.node.type.name,
          control: nav?.defaultControl,
        }
        nextSel = sel
      }
    } else if (isAppend) {
      const dest = sel.empty ? Math.min(sel.$head.end(), sel.to + 1) : sel.to
      nextSel = TextSelection.create(doc, dest)
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
  if (nextMode === 'normal' && compoundPosToSelect === null) {
    const $from = editor.state.selection.$from
    for (let d = $from.depth; d >= 1; d -= 1) {
      if (getNodeNavigation(editor, $from.node(d).type.name)?.kind === 'inplace') {
        compoundPosToSelect = $from.before(d)
        break
      }
    }
  }
  const enteringInplaceSelect =
    nextMode === 'select' &&
    editor.state.selection instanceof NodeSelection &&
    getNodeNavigation(editor, editor.state.selection.node.type.name)?.kind === 'inplace'
  if (
    storage.mode === nextMode &&
    storage.preset === nextPreset &&
    prev?.mode === nextMode &&
    prev?.preset === nextPreset &&
    compoundPosToSelect === null &&
    !enteringInplaceSelect
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
    compoundPosToSelect === null &&
    !enteringInplaceSelect
  ) {
    return
  }
  try {
    let tr = editor.state.tr
    let restoredSubtextCursor: SubtextCursorState | null = null
    if (enteringInplaceSelect && editor.state.selection instanceof NodeSelection) {
      const startPos = Math.min(editor.state.doc.content.size, editor.state.selection.from + 1)
      tr = tr.setSelection(TextSelection.create(editor.state.doc, startPos))
    } else if (compoundPosToSelect !== null) {
      const node = editor.state.doc.nodeAt(compoundPosToSelect)
      if (node) {
        const nav = getNodeNavigation(editor, node.type.name)
        if (nav?.kind === 'inplace' && NodeSelection.isSelectable(node)) {
          tr = tr.setSelection(NodeSelection.create(editor.state.doc, compoundPosToSelect))
        } else if (nav?.kind === 'container') {
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
          if (nav?.subtext && (!nav.subtext.enabled || nav.subtext.enabled(node))) {
            restoredSubtextCursor = {
              pos: compoundPosToSelect,
              kind: nav.subtext.kind,
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
