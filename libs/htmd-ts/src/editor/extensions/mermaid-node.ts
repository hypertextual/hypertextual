import type { Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import {
  createContainerNodeNavigation,
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusBeforeBlock,
  focusBlockAtPos,
  focusTextPosition,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export type MermaidViewportAction =
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'toggle-fullscreen'

export interface MermaidViewportState {
  scale: number
  panX: number
  panY: number
  fullscreen: boolean
}

export interface MermaidNodeOptions {
  nodeView?: HtmdNodeViewFactory
  HTMLAttributes?: Record<string, unknown>
  keymap?: Keymap<HtmdCommandContext>
}

export interface MermaidNodeStorage {
  viewports: Map<number, MermaidViewportState>
}

export type MermaidNodeCommands = {
  insertMermaid: (code?: string) => (ctx: HtmdCommandContext) => boolean
}

export const DEFAULT_MERMAID_SOURCE = 'flowchart TD\n  A[Start] --> B[End]'

const MERMAID_HEADER_CONTROL_SELECTOR =
  '[data-mermaid-edit], [data-mermaid-fullscreen], [data-mermaid-copy], [data-mermaid-zoom-in], [data-mermaid-zoom-out], [data-mermaid-zoom-reset]'

const PAN_STEP = 48
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

// api -----------------------------------------------------------------------

/**
 * Interactive Mermaid diagram block extension with normal-mode diagram viewer,
 * select-mode line selection, insert-mode source editor with PiP preview,
 * editor-scoped fullscreen viewer/split-pane, and unified pan/zoom shortcuts:
 *
 * ```text
 * Normal mode:
 * +------------------------------------------------------------+
 * | Mermaid              [-] 100% [+] [Reset] [Edit] [Fullscr] |
 * +------------------------------------------------------------+
 * |                 [Start] ---> [End]                         |
 * +------------------------------------------------------------+
 *
 * Insert / Select mode:
 * +------------------------------------------------------------+
 * | Mermaid                                   [Copy] [Fullscr] |
 * +------------------------------------------------------------+
 * | flowchart TD                 +---------------------------+ |
 * |   A[Start] --> B[End]|       | Preview  [-] 100% [+] [F] | |
 * |                              |   [Start] ---> [End]      | |
 * |                              +---------------------------+ |
 * +------------------------------------------------------------+
 * ```
 */
export const MermaidNode = defineHtmdExtension<
  MermaidNodeOptions,
  MermaidNodeStorage,
  MermaidNodeCommands
>({
  name: 'mermaid',
  kind: 'node',
  defaultOptions: () => ({
    nodeView: undefined,
    HTMLAttributes: {},
    keymap: undefined,
  }),
  createStorage: () => ({
    viewports: new Map<number, MermaidViewportState>(),
  }),
  navigation: () =>
    createContainerNodeNavigation({
      controls: [MERMAID_HEADER_CONTROL_SELECTOR],
      defaultControl: 'body',
      multilineTextblock: true,
      expandSelectionRange: true,
      bodyOffset: 1,
      enterBelowMode: 'endPos',
      serializeModalText: (node) => `\`\`\`mermaid\n${node.textContent}\n\`\`\``,
      focusControl(editor, pos, _node, options) {
        try {
          const dom = editor.view?.nodeDOM(pos)
          if (dom instanceof HTMLElement && options?.control && options.control !== 'body') {
            const btn = dom.querySelector<HTMLElement>(
              `[data-mermaid-${options.control}], ${MERMAID_HEADER_CONTROL_SELECTOR}`,
            )
            if (btn) {
              btn.focus()
              return true
            }
          }
        } catch {
          // Headless editor view
        }
        editor.commands.setTextSelection(pos + 1)
        try {
          editor.view.focus()
        } catch {
          // Headless editor view
        }
        return true
      },
    }),
  commands: () => ({
    insertMermaid:
      (code = DEFAULT_MERMAID_SOURCE) =>
      ({ editor, state, dispatch }) => {
        const mermaidType = state.schema.nodes.mermaid
        if (!mermaidType) return false
        const textNode = code ? state.schema.text(code) : null
        const node = mermaidType.create(null, textNode ? [textNode] : [])
        const { from, to } = state.selection
        const tr = state.tr.replaceRangeWith(from, to, node)
        const resolvedPos = Math.min(tr.doc.content.size, from + 1)
        tr.setSelection(TextSelection.create(tr.doc, resolvedPos))
        dispatch?.(tr.scrollIntoView())
        try {
          editor.view.focus()
        } catch {
          // Headless editor view
        }
        return true
      },
  }),
  keymap({ storage }) {
    return {
      'Control-h': {
        id: 'mermaid.panLeft',
        key: 'Ctrl+h',
        label: 'Pan Mermaid Diagram Left',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-left'),
      },
      'Control-j': {
        id: 'mermaid.panDown',
        key: 'Ctrl+j',
        label: 'Pan Mermaid Diagram Down',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-down'),
      },
      'Control-k': {
        id: 'mermaid.panUp',
        key: 'Ctrl+k',
        label: 'Pan Mermaid Diagram Up',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-up'),
      },
      'Control-l': {
        id: 'mermaid.panRight',
        key: 'Ctrl+l',
        label: 'Pan Mermaid Diagram Right',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-right'),
      },
      'Control-=': {
        id: 'mermaid.zoomInCtrl',
        key: 'Ctrl+=',
        label: 'Zoom In Mermaid Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      'Control-+': {
        id: 'mermaid.zoomInCtrlPlus',
        key: 'Ctrl++',
        label: 'Zoom In Mermaid Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      'Control--': {
        id: 'mermaid.zoomOutCtrl',
        key: 'Ctrl+-',
        label: 'Zoom Out Mermaid Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-out'),
      },
      'Control-0': {
        id: 'mermaid.zoomResetCtrl',
        key: 'Ctrl+0',
        label: 'Reset Mermaid Diagram Zoom',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-reset'),
      },
      f: {
        id: 'mermaid.toggleFullscreenNormal',
        key: 'f',
        label: 'Toggle Mermaid Fullscreen',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      '+': {
        id: 'mermaid.zoomInNormalPlus',
        key: '+',
        label: 'Zoom In Mermaid Diagram',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      '=': {
        id: 'mermaid.zoomInNormalEquals',
        key: '=',
        label: 'Zoom In Mermaid Diagram',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      '-': {
        id: 'mermaid.zoomOutNormal',
        key: '-',
        label: 'Zoom Out Mermaid Diagram',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-out'),
      },
      '0': {
        id: 'mermaid.zoomResetNormal',
        key: '0',
        label: 'Reset Mermaid Diagram Zoom',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-reset'),
      },
      H: {
        id: 'mermaid.panLeftNormalShift',
        key: 'H',
        label: 'Pan Mermaid Diagram Left',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-left'),
      },
      J: {
        id: 'mermaid.panDownNormalShift',
        key: 'J',
        label: 'Pan Mermaid Diagram Down',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-down'),
      },
      K: {
        id: 'mermaid.panUpNormalShift',
        key: 'K',
        label: 'Pan Mermaid Diagram Up',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-up'),
      },
      L: {
        id: 'mermaid.panRightNormalShift',
        key: 'L',
        label: 'Pan Mermaid Diagram Right',
        mode: 'normal',
        when: whenMermaidSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-right'),
      },
      'Mod-Enter': {
        id: 'mermaid.toggleFullscreenInsertModEnter',
        key: 'Mod+Enter',
        label: 'Toggle Mermaid Fullscreen Split-Pane',
        mode: 'insert',
        when: whenMermaidActiveOrControl,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      'Control-Shift-f': {
        id: 'mermaid.toggleFullscreenInsertCtrlShiftF',
        key: 'Ctrl+Shift+f',
        label: 'Toggle Mermaid Fullscreen Split-Pane',
        mode: 'insert',
        when: whenMermaidActiveOrControl,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      Tab: {
        id: 'mermaid.indent',
        key: 'Tab',
        label: 'Insert Tab or Focus Mermaid Code',
        mode: 'insert',
        when: whenMermaidActiveOrControl,
        run: handleTab,
      },
      'Shift-Tab': {
        id: 'mermaid.outdentOrFocusToolbar',
        key: 'Shift+Tab',
        label: 'Outdent or Focus Mermaid Toolbar',
        mode: 'insert',
        when: whenMermaidActiveOrControl,
        run: handleShiftTab,
      },
      ArrowUp: {
        id: 'mermaid.arrowUp',
        key: 'ArrowUp',
        label: 'Focus Mermaid Toolbar or Above Block',
        mode: 'insert',
        when: whenMermaidArrowKey,
        run: handleArrowUp,
      },
      ArrowDown: {
        id: 'mermaid.arrowDown',
        key: 'ArrowDown',
        label: 'Enter Mermaid Code or Exit Below',
        mode: 'insert',
        when: whenMermaidArrowKey,
        run: handleArrowDown,
      },
    }
  },
})

// helpers -------------------------------------------------------------------

/**
 * Resolves the document position of the active or selected `mermaid` block.
 */
export function findActiveMermaidPos(
  ctx: HtmdCommandContext,
  event?: KeyboardEvent,
): number | null {
  const { state } = ctx
  if (event) {
    const ctrl = findNodeViewControl(state, event, 'mermaid')
    if (ctrl) return ctrl.pos
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'mermaid') {
    return selection.from
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'mermaid') {
      return $from.before(depth)
    }
  }
  return null
}

/**
 * Returns the current `MermaidViewportState` for the `mermaid` block at `pos`.
 */
export function getMermaidViewportState(
  editor: TiptapEditor,
  pos: number,
): MermaidViewportState | undefined {
  const storage = (editor.storage as unknown as { mermaid?: MermaidNodeStorage })?.mermaid
  return storage?.viewports.get(pos)
}

function whenMermaidActiveOrSelected(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  return findActiveMermaidPos(ctx, event) !== null
}

function whenMermaidSelectedInNormal(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (ctx.editor.isEditable) return false
  return findActiveMermaidPos(ctx, event) !== null
}

function whenMermaidActiveOrControl(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(findNodeViewControl(ctx.state, event, 'mermaid')) || ctx.editor.isActive('mermaid')
}

function whenMermaidArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'mermaid'))
  }
  return true
}

function handleViewportAction(
  ctx: HtmdCommandContext,
  event: KeyboardEvent,
  storage: MermaidNodeStorage,
  action: MermaidViewportAction,
): boolean {
  const pos = findActiveMermaidPos(ctx, event)
  if (pos === null) return false

  const stored = storage.viewports.get(pos) ?? {
    scale: 1,
    panX: 0,
    panY: 0,
    fullscreen: false,
  }
  const next: MermaidViewportState = { ...stored }
  try {
    const dom = ctx.editor.view?.nodeDOM(pos)
    if (typeof HTMLElement !== 'undefined' && dom instanceof HTMLElement) {
      const targetEl = dom.matches('[data-mermaid-scale]')
        ? dom
        : (dom.querySelector<HTMLElement>('[data-mermaid-scale]') ?? dom)
      if (targetEl.dataset.mermaidScale) next.scale = Number(targetEl.dataset.mermaidScale)
      if (targetEl.dataset.mermaidPanX) next.panX = Number(targetEl.dataset.mermaidPanX)
      if (targetEl.dataset.mermaidPanY) next.panY = Number(targetEl.dataset.mermaidPanY)
      if (targetEl.dataset.mermaidFullscreen) {
        next.fullscreen = targetEl.dataset.mermaidFullscreen === 'true'
      }
    }
  } catch {
    // Headless editor view
  }

  switch (action) {
    case 'pan-left':
      next.panX -= PAN_STEP
      break
    case 'pan-right':
      next.panX += PAN_STEP
      break
    case 'pan-up':
      next.panY -= PAN_STEP
      break
    case 'pan-down':
      next.panY += PAN_STEP
      break
    case 'zoom-in':
      next.scale = Math.min(MAX_ZOOM, Math.round((next.scale + ZOOM_STEP) * 100) / 100)
      break
    case 'zoom-out':
      next.scale = Math.max(MIN_ZOOM, Math.round((next.scale - ZOOM_STEP) * 100) / 100)
      break
    case 'zoom-reset':
      next.scale = 1
      next.panX = 0
      next.panY = 0
      break
    case 'toggle-fullscreen':
      next.fullscreen = !next.fullscreen
      break
  }

  storage.viewports.set(pos, next)

  try {
    const dom = ctx.editor.view?.nodeDOM(pos)
    if (typeof HTMLElement !== 'undefined' && dom instanceof HTMLElement) {
      dom.dataset.mermaidScale = String(next.scale)
      dom.dataset.mermaidPanX = String(next.panX)
      dom.dataset.mermaidPanY = String(next.panY)
      dom.dataset.mermaidFullscreen = String(next.fullscreen)
      dom.dispatchEvent(
        new CustomEvent('htmd:mermaid-viewport', {
          bubbles: true,
          detail: { pos, action, state: next },
        }),
      )
    }
  } catch {
    // Headless editor view
  }

  return true
}

function focusMermaidHeaderAt(editor: TiptapEditor, pos: number): boolean {
  const dom = editor.view?.nodeDOM(pos)
  if (dom instanceof HTMLElement) {
    const btn = dom.querySelector<HTMLElement>(MERMAID_HEADER_CONTROL_SELECTOR)
    if (btn) {
      btn.focus()
      return true
    }
  }
  return focusBlockAtPos(editor, pos, 'down')
}

function focusMermaidHeader(editor: TiptapEditor): boolean {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.type.name === 'mermaid') {
    return focusMermaidHeaderAt(editor, selection.from)
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'mermaid') {
      return focusMermaidHeaderAt(editor, $from.before(depth))
    }
  }
  return false
}

function handleTab({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'mermaid')
  if (ctrl) {
    if (ctrl.target.closest('button')) {
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  if (editor.isActive('mermaid')) {
    return editor.commands.insertContent('\t')
  }
  return false
}

function handleShiftTab({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'mermaid')
  if (ctrl) {
    if (ctrl.target.closest('button')) {
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  if (!editor.isActive('mermaid')) return false
  const { $from } = state.selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset)
  if (textBefore.endsWith('\t')) {
    return editor.commands.deleteRange({
      from: $from.pos - 1,
      to: $from.pos,
    })
  }
  return focusMermaidHeader(editor)
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'mermaid')
  if (ctrl) {
    if (ctrl.target.closest('button')) {
      return focusBeforeBlock(editor, ctrl.pos)
    }
    return false
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'mermaid') {
    return focusMermaidHeaderAt(editor, selection.from)
  }
  if (editor.isActive('mermaid')) {
    if (!selection.empty) return false
    const { $from } = selection
    const textBefore = $from.parent.textBetween(0, $from.parentOffset)
    if (!textBefore.includes('\n')) {
      return focusMermaidHeader(editor)
    }
    return false
  }
  if (isAtFirstVisualLine(view, state)) {
    const prevPos = findPrevBlockPos(state)
    if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'mermaid') {
      return focusBlockAtPos(editor, prevPos, 'up')
    }
  }
  return false
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  const ctrl = findNodeViewControl(state, event, 'mermaid')
  if (ctrl) {
    if (ctrl.target.closest('button')) {
      return focusTextPosition(editor, ctrl.pos + 1)
    }
    return false
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'mermaid') {
    return focusTextPosition(editor, selection.from + 1)
  }
  if (editor.isActive('mermaid')) {
    if (!isAtLastVisualLine(view, state)) return false
    const { $from } = selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === 'mermaid') {
        return focusBlockAtPos(editor, $from.after(depth), 'down', true)
      }
    }
    return false
  }
  if (isAtLastVisualLine(view, state)) {
    const nextPos = findNextBlockPos(state)
    if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'mermaid') {
      return focusTextPosition(editor, nextPos + 1)
    }
  }
  return false
}
