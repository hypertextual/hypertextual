import type { Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  createInplaceWindowNodeNavigation,
  CursorManager,
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

export interface MermaidEditorOptions {
  lowlight?: unknown
  nodeView?: HtmdNodeViewFactory
  HTMLAttributes?: Record<string, unknown>
  keymap?: Keymap<HtmdCommandContext>
}

export interface MermaidEditorStorage {
  viewports: Map<number, MermaidViewportState>
  pendingWindowPrefix: boolean
}

export type MermaidEditorCommands = {
  insertMermaid: (code?: string) => (ctx: HtmdCommandContext) => boolean
}

export const DEFAULT_MERMAID_SOURCE = 'flowchart TD\n  A[Start] --> B[End]'

const MERMAID_HEADER_CONTROL_SELECTOR =
  '[data-mermaid-copy], [data-mermaid-edit], [data-mermaid-fullscreen]'

const PAN_STEP = 48
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

// api -----------------------------------------------------------------------

/**
 * Interactive Mermaid diagram editor extension with Lowlight syntax highlighting,
 * normal-mode diagram viewer, select-mode line selection, insert-mode source
 * editor with top-right in-place preview window, editor-scoped fullscreen
 * viewer/split-pane, and unified pan/zoom shortcuts:
 *
 * ```text
 * Normal mode:
 * +------------------------------------------------------------+
 * | Mermaid                                         [✎] [⤢]    |
 * +------------------------------------------------------------+
 * |                 [Start] ---> [End]                         |
 * +------------------------------------------------------------+
 *
 * Insert / Select mode:
 * +------------------------------------------------------------+
 * | Mermaid                                         [⧉] [⤢]    |
 * +------------------------------------------------------------+
 * | flowchart TD                         +-------------------+ |
 * |   A[Start] --> B[End]|               | [Start] ---> [End]| |
 * |                                      +-------------------+ |
 * +------------------------------------------------------------+
 * ```
 */
export const MermaidEditor = defineHtmdExtension<
  MermaidEditorOptions,
  MermaidEditorStorage,
  MermaidEditorCommands
>({
  name: 'mermaid',
  kind: 'node',
  defaultOptions: () => ({
    lowlight: undefined,
    nodeView: undefined,
    HTMLAttributes: {},
    keymap: undefined,
  }),
  createStorage: () => ({
    viewports: new Map<number, MermaidViewportState>(),
    pendingWindowPrefix: false,
  }),
  navigation: () =>
    createInplaceWindowNodeNavigation({
      controls: [MERMAID_HEADER_CONTROL_SELECTOR],
      defaultControl: 'body',
      textObject: 'c',
      multilineTextblock: true,
      expandSelectionRange: true,
      bodyOffset: 1,
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
        return focusTextPosition(editor, pos + 1)
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
        CursorManager.focusEditorView(editor)
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
        id: 'mermaid.toggleFullscreenModEnter',
        key: 'Mod+Enter',
        label: 'Toggle Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      'Control-Shift-f': {
        id: 'mermaid.toggleFullscreenCtrlShiftF',
        key: 'Ctrl+Shift+f',
        label: 'Toggle Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        when: whenMermaidActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      'Control-w': {
        id: 'mermaid.windowPrefixInsert',
        key: 'Ctrl+w',
        label: 'Mermaid Window Prefix',
        mode: 'insert',
        when: whenMermaidActiveOrControl,
        run: () => {
          storage.pendingWindowPrefix = true
          return true
        },
      },
      z: {
        id: 'mermaid.toggleFullscreenWindowZoom',
        key: 'z',
        label: 'Toggle Mermaid Maximize (Ctrl+w z)',
        mode: 'insert',
        when: (ctx, event) => storage.pendingWindowPrefix && whenMermaidActiveOrControl(ctx, event),
        run: (ctx, event) => {
          storage.pendingWindowPrefix = false
          return handleViewportAction(ctx, event, storage, 'toggle-fullscreen')
        },
      },
      Tab: {
        id: 'mermaid.indent',
        key: 'Tab',
        label: 'Insert Tab or Next Mermaid Toolbar Control',
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
  pmPlugins({ options, storage }) {
    const lowlightPlugin = createMermaidLowlightPlugin(options.lowlight)
    const windowPrefixPlugin = new Plugin({
      props: {
        handleKeyDown(_view, event) {
          if (!storage.pendingWindowPrefix) return false
          if (
            event.key === 'Control' ||
            event.key === 'Shift' ||
            event.key === 'Alt' ||
            event.key === 'Meta'
          ) {
            return false
          }
          if (event.key !== 'z') {
            storage.pendingWindowPrefix = false
          }
          return false
        },
      },
    })
    return lowlightPlugin ? [lowlightPlugin, windowPrefixPlugin] : [windowPrefixPlugin]
  },
})

// pm ------------------------------------------------------------------------

interface LowlightHastNode {
  type: string
  value?: string
  properties?: { className?: string[] }
  children?: LowlightHastNode[]
}

interface LowlightLike {
  highlight: (
    language: string,
    value: string,
  ) => { value?: LowlightHastNode[]; children?: LowlightHastNode[] }
  listLanguages: () => string[]
  register?: (
    grammars: Record<
      string,
      (hljs: {
        COMMENT: (begin: string, end: string) => unknown
        QUOTE_STRING_MODE: unknown
        APOS_STRING_MODE: unknown
        C_NUMBER_MODE: unknown
      }) => unknown
    >,
  ) => void
}

const mermaidLowlightPluginKey = new PluginKey<DecorationSet>('mermaidLowlight')

function ensureMermaidGrammarRegistered(lowlight: LowlightLike): boolean {
  try {
    if (!lowlight.listLanguages().includes('mermaid') && typeof lowlight.register === 'function') {
      lowlight.register({
        mermaid: (hljs) => ({
          name: 'Mermaid',
          case_insensitive: false,
          keywords: {
            keyword:
              'flowchart graph sequenceDiagram stateDiagram stateDiagram-v2 classDiagram erDiagram gantt pie mindmap timeline gitGraph C4Context C4Container C4Component C4Dynamic C4Deployment xychart-beta subgraph end direction participant actor activate deactivate loop alt else opt par and critical break rect note over as state class style classDef click linkStyle autonumber title section dateFormat axisFormat',
            literal: 'TB TD BT RL LR true false',
            built_in: 'left right top bottom of',
          },
          contains: [
            hljs.COMMENT('%%', '$'),
            hljs.QUOTE_STRING_MODE,
            hljs.APOS_STRING_MODE,
            hljs.C_NUMBER_MODE,
            {
              className: 'keyword',
              begin: /<?--+>?|==+>|-\.+->?|--[xo]|<<?->>?|->>|-->>|-[x)]|--[x)]|:::/,
            },
            {
              className: 'attr',
              begin: /\|[^|\n]*\|/,
            },
            {
              className: 'title',
              begin: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*[[({])/,
            },
            {
              className: 'string',
              begin: /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/,
            },
          ],
        }),
      })
    }
    return lowlight.listLanguages().includes('mermaid')
  } catch {
    return false
  }
}

function flattenLowlightNodes(
  nodes: LowlightHastNode[],
  className: string[] = [],
): Array<{ text: string; classes: string[] }> {
  return nodes.flatMap((node) => {
    const classes = [...className, ...(node.properties?.className ?? [])]
    if (node.children) return flattenLowlightNodes(node.children, classes)
    return [{ text: node.value ?? '', classes }]
  })
}

function buildMermaidDecorations(doc: PmNode, lowlight: LowlightLike): DecorationSet {
  if (!ensureMermaidGrammarRegistered(lowlight)) {
    return DecorationSet.empty
  }
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'mermaid') return true
    if (!node.textContent) return false
    try {
      const result = lowlight.highlight('mermaid', node.textContent)
      const nodes = result.value ?? result.children ?? []
      let from = pos + 1
      for (const token of flattenLowlightNodes(nodes)) {
        const to = from + token.text.length
        if (token.classes.length > 0 && to > from) {
          decorations.push(Decoration.inline(from, to, { class: token.classes.join(' ') }))
        }
        from = to
      }
    } catch {
      // Ignore highlight errors on partial source
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

function createMermaidLowlightPlugin(rawLowlight: unknown): Plugin | null {
  const lowlight = rawLowlight as LowlightLike | undefined
  if (
    !lowlight ||
    typeof lowlight.highlight !== 'function' ||
    typeof lowlight.listLanguages !== 'function'
  ) {
    return null
  }
  return new Plugin<DecorationSet>({
    key: mermaidLowlightPluginKey,
    state: {
      init: (_, { doc }) => buildMermaidDecorations(doc, lowlight),
      apply: (tr, prevSet) => {
        if (!tr.docChanged) return prevSet
        return buildMermaidDecorations(tr.doc, lowlight)
      },
    },
    props: {
      decorations(state) {
        return mermaidLowlightPluginKey.getState(state) ?? null
      },
    },
  })
}

// helpers -------------------------------------------------------------------

function findActiveMermaidPos(ctx: HtmdCommandContext, event?: KeyboardEvent): number | null {
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
  const rawTarget =
    event.target instanceof HTMLElement
      ? event.target
      : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  if (rawTarget && rawTarget.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'mermaid'))
  }
  return true
}

function handleViewportAction(
  ctx: HtmdCommandContext,
  event: KeyboardEvent,
  storage: MermaidEditorStorage,
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

function getToolbarButtons(wrapper: HTMLElement): HTMLElement[] {
  return Array.from(
    wrapper.querySelectorAll<HTMLElement>(
      '[data-editor-controls] button:not([disabled]), button[data-mermaid-copy], button[data-mermaid-edit], button[data-mermaid-fullscreen]',
    ),
  )
}

function focusMermaidHeaderAt(editor: TiptapEditor, pos: number): boolean {
  const dom = editor.view?.nodeDOM(pos)
  if (dom instanceof HTMLElement) {
    const buttons = getToolbarButtons(dom)
    const btn = buttons[0] ?? dom.querySelector<HTMLElement>(MERMAID_HEADER_CONTROL_SELECTOR)
    if (btn) {
      CursorManager.setActiveCompoundBlockPos(editor, pos)
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
    const currentBtn = ctrl.target.closest<HTMLElement>('button')
    if (currentBtn) {
      const buttons = getToolbarButtons(ctrl.wrapper)
      const idx = buttons.indexOf(currentBtn)
      if (idx !== -1 && idx + 1 < buttons.length) {
        buttons[idx + 1]!.focus()
        return true
      }
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
    const currentBtn = ctrl.target.closest<HTMLElement>('button')
    if (currentBtn) {
      const buttons = getToolbarButtons(ctrl.wrapper)
      const idx = buttons.indexOf(currentBtn)
      if (idx > 0) {
        buttons[idx - 1]!.focus()
        return true
      }
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
    if (!selection.empty) return false
    const { $from } = selection
    const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size)
    if (textAfter.includes('\n')) return false
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
      return focusBlockAtPos(editor, nextPos, 'down')
    }
  }
  return false
}
