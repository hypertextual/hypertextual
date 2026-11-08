import { NodeSelection, Selection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  createTextblockNavigation,
  defineHtmdExtension,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export interface UnparsableBlockFallbackOptions {
  nodeView?: HtmdNodeViewFactory
}

// api -----------------------------------------------------------------------

/**
 * Editable block fallback extension for unrecognized or malformed Markdown
 * blocks (`unparsedBlock` schema node).
 *
 * Preserves the exact raw source text in a monospace block with a diagnostic
 * badge so users can fix, select, or delete unsupported syntax without data loss:
 *
 * ```text
 * +------------------------------------------------------------+
 * | [!] Unrecognized Markdown: Unsupported table               |
 * | | col 1 | col 2 |                                          |
 * +------------------------------------------------------------+
 * ```
 */
export const UnparsableBlockFallback = defineHtmdExtension<
  UnparsableBlockFallbackOptions,
  Record<string, never>,
  {
    deleteUnparsedBlock: () => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'unparsedBlock',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined }),
  navigation: () =>
    createTextblockNavigation({
      multilineTextblock: true,
      expandSelectionRange: true,
      serializeModalText: (node) => String(node.attrs.raw ?? node.textContent ?? ''),
    }),
  commands: () => ({
    deleteUnparsedBlock:
      () =>
      ({ state, dispatch }) =>
        deleteActiveUnparsedBlock(state, dispatch),
  }),
  keymap: () => ({
    Backspace: {
      id: 'unparsedBlock.backspace',
      key: 'Backspace',
      label: 'Delete Empty or Selected Unparsed Block',
      mode: 'insert',
      when: ({ state }) => canDeleteUnparsedBlockOnKey(state),
      run: ({ state, dispatch }) => deleteActiveUnparsedBlock(state, dispatch),
    },
    Delete: {
      id: 'unparsedBlock.delete',
      key: 'Delete',
      label: 'Delete Empty or Selected Unparsed Block',
      mode: 'insert',
      when: ({ state }) => canDeleteUnparsedBlockOnKey(state),
      run: ({ state, dispatch }) => deleteActiveUnparsedBlock(state, dispatch),
    },
  }),
})

// helpers -------------------------------------------------------------------

function findTargetUnparsedBlock(state: EditorState): { from: number; to: number } | null {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'unparsedBlock') {
    return { from: selection.from, to: selection.to }
  }
  const { $from } = selection
  if (
    selection.empty &&
    $from.parent.type.name === 'unparsedBlock' &&
    $from.parent.content.size === 0
  ) {
    return { from: $from.before($from.depth), to: $from.after($from.depth) }
  }
  return null
}

function canDeleteUnparsedBlockOnKey(state: EditorState): boolean {
  return findTargetUnparsedBlock(state) !== null
}

function deleteActiveUnparsedBlock(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const target = findTargetUnparsedBlock(state)
  if (!target) return false
  if (dispatch) {
    let tr = state.tr.delete(target.from, target.to)
    if (tr.doc.childCount === 0 && state.schema.nodes.paragraph) {
      tr = tr.insert(0, state.schema.nodes.paragraph.create())
    }
    const nextPos = Math.min(tr.doc.content.size, target.from)
    tr = tr.setSelection(Selection.near(tr.doc.resolve(nextPos)))
    dispatch(tr.scrollIntoView())
  }
  return true
}
