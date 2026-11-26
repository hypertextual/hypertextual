import type { Keymap } from 'core-ts'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import {
  createAtomNodeNavigation,
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusAfterBlock,
  focusBeforeBlock,
  focusBlockAtPos,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'

// types ---------------------------------------------------------------------

export type DrawioViewportAction =
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'toggle-fullscreen'

export interface DrawioViewportState {
  scale: number
  panX: number
  panY: number
  fullscreen: boolean
}

export interface DrawioViewerOptions {
  nodeView?: HtmdNodeViewFactory
  HTMLAttributes?: Record<string, unknown>
  keymap?: Keymap<HtmdCommandContext>
}

export interface DrawioViewerStorage {
  viewports: Map<number, DrawioViewportState>
  pendingWindowPrefix: boolean
}

export type DrawioViewerCommands = {
  insertDrawio: (attrs: {
    src: string
    alt?: string
    caption?: string
  }) => (ctx: HtmdCommandContext) => boolean
}

const DRAWIO_CTA_SELECTOR = 'button[data-drawio-cta]'
const DRAWIO_REPLACE_SELECTOR = 'button[aria-label="Replace diagram"]'
const DRAWIO_REMOVE_SELECTOR = 'button[aria-label="Remove diagram"]'
const DRAWIO_CAPTION_SELECTOR = 'input[aria-label="Diagram caption"]'

const PAN_STEP = 48
const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

// api -----------------------------------------------------------------------

/**
 * Interactive Draw.io diagram block extension (`![alt](path.drawio.svg "caption")`)
 * with normal-mode pan/zoom/fullscreen preview, insert-mode centered
 * `Open in Draw.io` CTA, replace/remove controls, and editable `<figcaption>`:
 *
 * ```text
 * Normal mode:
 * +------------------------------------------------------------+
 * |                  [Client] ---> [Server]                    |
 * +------------------------------------------------------------+
 *   System architecture
 *
 * Insert mode:
 * +------------------------------------------------------------+
 * |                                                        [×] |
 * |              [ ↗ Open in Draw.io ] [Replace]               | <-- Tab
 * +------------------------------------------------------------+
 *   [ System architecture|                                    ] <-- Tab
 * ```
 */
export const DrawioViewer = defineHtmdExtension<
  DrawioViewerOptions,
  DrawioViewerStorage,
  DrawioViewerCommands
>({
  name: 'drawio',
  kind: 'node',
  defaultOptions: () => ({
    nodeView: undefined,
    HTMLAttributes: {},
    keymap: undefined,
  }),
  createStorage: () => ({
    viewports: new Map<number, DrawioViewportState>(),
    pendingWindowPrefix: false,
  }),
  navigation: () =>
    createAtomNodeNavigation({
      controls: [
        DRAWIO_REPLACE_SELECTOR,
        DRAWIO_CTA_SELECTOR,
        DRAWIO_REMOVE_SELECTOR,
        DRAWIO_CAPTION_SELECTOR,
      ],
      defaultControl: 'replace',
      subtext: {
        kind: 'imageCaption',
        attr: 'caption',
        control: 'caption',
        enterControl: 'caption',
        decorationAttr: 'data-pm-modal-drawio-caption',
        textSelector: '[data-drawio-caption-text]',
        inputSelector: DRAWIO_CAPTION_SELECTOR,
      },
      serializeModalText: (node) => {
        const alt = String(node.attrs.alt ?? '')
        const src = String(node.attrs.src ?? '')
        const caption = String(node.attrs.caption ?? '')
        return caption ? `![${alt}](${src} "${caption}")` : `![${alt}](${src})`
      },
    }),
  commands: () => ({
    insertDrawio:
      (attrs) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'drawio',
          attrs: {
            src: attrs.src,
            alt: attrs.alt ?? '',
            caption: attrs.caption ?? '',
          },
        }),
  }),
  keymap({ storage }) {
    return {
      'Control-h': {
        id: 'drawio.panLeft',
        key: 'Ctrl+h',
        label: 'Pan Draw.io Diagram Left',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-left'),
      },
      'Control-j': {
        id: 'drawio.panDown',
        key: 'Ctrl+j',
        label: 'Pan Draw.io Diagram Down',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-down'),
      },
      'Control-k': {
        id: 'drawio.panUp',
        key: 'Ctrl+k',
        label: 'Pan Draw.io Diagram Up',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-up'),
      },
      'Control-l': {
        id: 'drawio.panRight',
        key: 'Ctrl+l',
        label: 'Pan Draw.io Diagram Right',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-right'),
      },
      'Control-=': {
        id: 'drawio.zoomInCtrl',
        key: 'Ctrl+=',
        label: 'Zoom In Draw.io Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      'Control-+': {
        id: 'drawio.zoomInCtrlPlus',
        key: 'Ctrl++',
        label: 'Zoom In Draw.io Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      'Control--': {
        id: 'drawio.zoomOutCtrl',
        key: 'Ctrl+-',
        label: 'Zoom Out Draw.io Diagram',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-out'),
      },
      'Control-0': {
        id: 'drawio.zoomResetCtrl',
        key: 'Ctrl+0',
        label: 'Reset Draw.io Diagram Zoom',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-reset'),
      },
      f: {
        id: 'drawio.toggleFullscreenNormal',
        key: 'f',
        label: 'Toggle Draw.io Fullscreen',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      '+': {
        id: 'drawio.zoomInNormalPlus',
        key: '+',
        label: 'Zoom In Draw.io Diagram',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      '=': {
        id: 'drawio.zoomInNormalEquals',
        key: '=',
        label: 'Zoom In Draw.io Diagram',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-in'),
      },
      '-': {
        id: 'drawio.zoomOutNormal',
        key: '-',
        label: 'Zoom Out Draw.io Diagram',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-out'),
      },
      '0': {
        id: 'drawio.zoomResetNormal',
        key: '0',
        label: 'Reset Draw.io Diagram Zoom',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'zoom-reset'),
      },
      H: {
        id: 'drawio.panLeftNormalShift',
        key: 'H',
        label: 'Pan Draw.io Diagram Left',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-left'),
      },
      J: {
        id: 'drawio.panDownNormalShift',
        key: 'J',
        label: 'Pan Draw.io Diagram Down',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-down'),
      },
      K: {
        id: 'drawio.panUpNormalShift',
        key: 'K',
        label: 'Pan Draw.io Diagram Up',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-up'),
      },
      L: {
        id: 'drawio.panRightNormalShift',
        key: 'L',
        label: 'Pan Draw.io Diagram Right',
        mode: 'normal',
        when: whenDrawioSelectedInNormal,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'pan-right'),
      },
      'Mod-Enter': {
        id: 'drawio.toggleFullscreenModEnter',
        key: 'Mod+Enter',
        label: 'Toggle Draw.io Fullscreen',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      'Control-Shift-f': {
        id: 'drawio.toggleFullscreenCtrlShiftF',
        key: 'Ctrl+Shift+f',
        label: 'Toggle Draw.io Fullscreen',
        mode: ['normal', 'select', 'insert'],
        when: whenDrawioActiveOrSelected,
        run: (ctx, event) => handleViewportAction(ctx, event, storage, 'toggle-fullscreen'),
      },
      'Control-w': {
        id: 'drawio.windowPrefixInsert',
        key: 'Ctrl+w',
        label: 'Draw.io Window Prefix',
        mode: 'insert',
        when: whenDrawioControlFocused,
        run: () => {
          storage.pendingWindowPrefix = true
          return true
        },
      },
      z: {
        id: 'drawio.toggleFullscreenWindowZoom',
        key: 'z',
        label: 'Toggle Draw.io Maximize (Ctrl+w z)',
        mode: 'insert',
        when: (ctx, event) => storage.pendingWindowPrefix && whenDrawioControlFocused(ctx, event),
        run: (ctx, event) => {
          storage.pendingWindowPrefix = false
          return handleViewportAction(ctx, event, storage, 'toggle-fullscreen')
        },
      },
      Tab: {
        id: 'drawio.tabNext',
        key: 'Tab',
        label: 'Next Draw.io Control',
        mode: 'insert',
        when: whenDrawioControlFocused,
        run: handleTab,
      },
      'Shift-Tab': {
        id: 'drawio.tabPrev',
        key: 'Shift+Tab',
        label: 'Previous Draw.io Control',
        mode: 'insert',
        when: whenDrawioControlFocused,
        run: handleShiftTab,
      },
      ArrowDown: {
        id: 'drawio.arrowDown',
        key: 'ArrowDown',
        label: 'Focus Draw.io Caption or Below Block',
        mode: 'insert',
        when: whenDrawioArrowKey,
        run: handleArrowDown,
      },
      ArrowUp: {
        id: 'drawio.arrowUp',
        key: 'ArrowUp',
        label: 'Focus Above Draw.io Block',
        mode: 'insert',
        when: whenDrawioArrowKey,
        run: handleArrowUp,
      },
      Enter: {
        id: 'drawio.splitCaption',
        key: 'Enter',
        label: 'Split Diagram Caption to Paragraph',
        mode: 'insert',
        when: whenDrawioCaptionEnter,
        run: handleEnter,
      },
    }
  },
  pmPlugins({ storage }) {
    return [createWindowPrefixPlugin(storage)]
  },
})

// pm ------------------------------------------------------------------------

function createWindowPrefixPlugin(storage: DrawioViewerStorage): Plugin {
  return new Plugin({
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
}

// helpers -------------------------------------------------------------------

function findActiveDrawioPos(ctx: HtmdCommandContext, event?: KeyboardEvent): number | null {
  const { state } = ctx
  if (event) {
    const ctrl = findNodeViewControl(state, event, 'drawio')
    if (ctrl) return ctrl.pos
  }
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'drawio') {
    return selection.from
  }
  return null
}

function whenDrawioActiveOrSelected(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  return findActiveDrawioPos(ctx, event) !== null
}

function whenDrawioSelectedInNormal(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (ctx.editor.isEditable) return false
  return findActiveDrawioPos(ctx, event) !== null
}

function whenDrawioControlFocused({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(findNodeViewControl(state, event, 'drawio'))
}

function whenDrawioArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'drawio'))
  }
  return true
}

function whenDrawioCaptionEnter({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(
    findNodeViewControl(state, event, 'drawio')?.target.matches(DRAWIO_CAPTION_SELECTOR),
  )
}

function getFocusableDrawioControls(wrapper: HTMLElement): HTMLElement[] {
  const selectors = [
    DRAWIO_REPLACE_SELECTOR,
    DRAWIO_CTA_SELECTOR,
    DRAWIO_REMOVE_SELECTOR,
    DRAWIO_CAPTION_SELECTOR,
  ]
  const controls: HTMLElement[] = []
  for (const selector of selectors) {
    const el = wrapper.querySelector<HTMLElement>(selector)
    if (el) controls.push(el)
  }
  return controls
}

function handleTab({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'drawio')
  if (!ctrl) return false
  const controls = getFocusableDrawioControls(ctrl.wrapper)
  if (controls.length === 0) return false
  const current = controls.find((el) => el === ctrl.target || el.contains(ctrl.target))
  const idx = current ? controls.indexOf(current) : -1
  const next = controls[(idx + 1) % controls.length]
  if (next) {
    next.focus()
    return true
  }
  return false
}

function handleShiftTab({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'drawio')
  if (!ctrl) return false
  const controls = getFocusableDrawioControls(ctrl.wrapper)
  if (controls.length === 0) return false
  const current = controls.find((el) => el === ctrl.target || el.contains(ctrl.target))
  const idx = current ? controls.indexOf(current) : 0
  const prev = controls[(idx - 1 + controls.length) % controls.length]
  if (prev) {
    prev.focus()
    return true
  }
  return false
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  const ctrl = findNodeViewControl(state, event, 'drawio')
  if (ctrl) {
    const captionInput = ctrl.wrapper.querySelector<HTMLInputElement>(DRAWIO_CAPTION_SELECTOR)
    if (ctrl.target === captionInput) {
      captionInput.blur()
      return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
    }
    if (captionInput) {
      captionInput.focus()
      return true
    }
    return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
  }
  if (!isAtLastVisualLine(view, state)) return false
  const nextPos = findNextBlockPos(state)
  if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'drawio') {
    return focusBlockAtPos(editor, nextPos, 'down')
  }
  return false
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'drawio')
  if (ctrl) {
    const captionInput = ctrl.wrapper.querySelector<HTMLInputElement>(DRAWIO_CAPTION_SELECTOR)
    const replaceBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(DRAWIO_REPLACE_SELECTOR)
    if (ctrl.target === captionInput && replaceBtn) {
      replaceBtn.focus()
      return true
    }
    ctrl.target.blur()
    return focusBeforeBlock(editor, ctrl.pos)
  }
  if (!isAtFirstVisualLine(view, state)) return false
  const prevPos = findPrevBlockPos(state)
  if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'drawio') {
    return focusBlockAtPos(editor, prevPos, 'up')
  }
  return false
}

function handleEnter({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'drawio')
  if (!ctrl || !(ctrl.target instanceof HTMLInputElement)) return false
  const caption = ctrl.target.value
  const cursorIdx = ctrl.target.selectionStart ?? caption.length
  const leftText = caption.slice(0, cursorIdx)
  const rightText = caption.slice(cursorIdx)
  ctrl.target.value = leftText
  const posAfter = ctrl.pos + ctrl.node.nodeSize
  return editor
    .chain()
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setNodeMarkup(ctrl.pos, undefined, {
          ...ctrl.node.attrs,
          caption: leftText,
        })
      }
      return true
    })
    .focus()
    .insertContentAt(posAfter, {
      type: 'paragraph',
      content: rightText ? [{ type: 'text', text: rightText }] : [],
    })
    .setTextSelection(posAfter + 1)
    .run()
}

function handleViewportAction(
  ctx: HtmdCommandContext,
  event: KeyboardEvent,
  storage: DrawioViewerStorage,
  action: DrawioViewportAction,
): boolean {
  const pos = findActiveDrawioPos(ctx, event)
  if (pos === null) return false

  const stored = storage.viewports.get(pos) ?? {
    scale: 1,
    panX: 0,
    panY: 0,
    fullscreen: false,
  }
  const next: DrawioViewportState = { ...stored }
  try {
    const dom = ctx.editor.view?.nodeDOM(pos)
    if (typeof HTMLElement !== 'undefined' && dom instanceof HTMLElement) {
      const targetEl = dom.matches('[data-drawio-scale]')
        ? dom
        : (dom.querySelector<HTMLElement>('[data-drawio-scale]') ?? dom)
      if (targetEl.dataset.drawioScale) next.scale = Number(targetEl.dataset.drawioScale)
      if (targetEl.dataset.drawioPanX) next.panX = Number(targetEl.dataset.drawioPanX)
      if (targetEl.dataset.drawioPanY) next.panY = Number(targetEl.dataset.drawioPanY)
      if (targetEl.dataset.drawioFullscreen) {
        next.fullscreen = targetEl.dataset.drawioFullscreen === 'true'
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
      dom.dataset.drawioScale = String(next.scale)
      dom.dataset.drawioPanX = String(next.panX)
      dom.dataset.drawioPanY = String(next.panY)
      dom.dataset.drawioFullscreen = String(next.fullscreen)
      dom.dispatchEvent(
        new CustomEvent('htmd:drawio-viewport', {
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
