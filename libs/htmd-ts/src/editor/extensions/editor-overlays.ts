import type { Editor as TiptapEditor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { defineHtmdExtension, type HtmdCommandContext } from '../define-htmd-extension.js'
import type {
  HtmdOverlayBinding,
  HtmdOverlayOpenOptions,
  HtmdOverlayRect,
  HtmdOverlayState,
  HtmdOverlaySurfaceOptions,
  HtmdOverlaysController,
  HtmdOverlaysOptions,
} from '../types.js'

// types ---------------------------------------------------------------------

/** Query the active overlay through the editor's ProseMirror state. */
export const editorOverlaysKey = new PluginKey<HtmdOverlayState | null>('editorOverlays')

type OverlayAction = { type: 'open'; overlay: HtmdOverlayState } | { type: 'close' }

export type EditorOverlaysStorage = HtmdOverlaysController & {
  bindings: Set<HtmdOverlayBinding>
}

// api -----------------------------------------------------------------------

/**
 * Manages positioned editor overlay popovers (`image`, `bookmark`, `youtube`,
 * floating selection toolbar) anchored to document positions or selections:
 *
 * ```text
 * Paragraph cursor |
 *                  +----------------------------------+
 *                  | [Paste Bookmark URL...         ] |
 *                  +----------------------------------+
 * ```
 */
export const EditorOverlays = defineHtmdExtension<
  HtmdOverlaysOptions,
  EditorOverlaysStorage,
  {
    openOverlay: (
      name: string,
      options?: HtmdOverlayOpenOptions,
    ) => (ctx: HtmdCommandContext) => boolean
    closeOverlay: (name?: string) => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'editorOverlays',
  kind: 'behavior',
  defaultOptions: () => ({ overlays: {}, onChange: undefined }),
  createStorage: () => ({
    bindings: new Set<HtmdOverlayBinding>(),
    attach: () => {
      throw new Error('Overlay surfaces require an initialized editor')
    },
  }),
  onBeforeCreate({ editor, storage }) {
    const bindings = storage.bindings
    storage.attach = (surface, options) => {
      const binding = attachSurface(editor, surface, options, () => bindings.delete(binding))
      bindings.add(binding)
      return binding
    }
  },
  onDestroy({ storage }) {
    for (const binding of storage.bindings) binding.destroy()
  },
  commands: ({ options }) => ({
    openOverlay:
      (name: string, openOptions: HtmdOverlayOpenOptions = {}) =>
      ({ tr, dispatch }) => {
        const position = openOptions.position ?? tr.selection.from
        if (
          !Object.hasOwn(options.overlays, name) ||
          !Number.isInteger(position) ||
          position < 0 ||
          position > tr.doc.content.size
        )
          return false

        if (dispatch) {
          tr.setMeta(editorOverlaysKey, {
            type: 'open',
            overlay: {
              name,
              position,
              definition: options.overlays[name]!,
              data: openOptions.data,
            },
          } satisfies OverlayAction)
        }
        return true
      },
    closeOverlay:
      (name?: string) =>
      ({ state, tr, dispatch }) => {
        const pending = tr.getMeta(editorOverlaysKey) as OverlayAction | undefined
        const active = pending
          ? pending.type === 'open'
            ? pending.overlay
            : null
          : editorOverlaysKey.getState(state)
        if (name !== undefined && active?.name !== name) return false
        if (dispatch) tr.setMeta(editorOverlaysKey, { type: 'close' } satisfies OverlayAction)
        return true
      },
  }),
  pmPlugins({ options }) {
    return [createEditorOverlaysPlugin(options)]
  },
})

// pm ------------------------------------------------------------------------

function createEditorOverlaysPlugin(options: HtmdOverlaysOptions): Plugin<HtmdOverlayState | null> {
  const onChange = options.onChange
  return new Plugin<HtmdOverlayState | null>({
    key: editorOverlaysKey,
    state: {
      init: () => null,
      apply(transaction, active) {
        const action = transaction.getMeta(editorOverlaysKey) as OverlayAction | undefined
        if (action) return action.type === 'open' ? action.overlay : null
        if (!active || !transaction.docChanged) return active
        const mapped = transaction.mapping.mapResult(active.position, 1)
        if (mapped.deleted) return null
        return { ...active, position: mapped.pos }
      },
    },
    view(view) {
      onChange?.(editorOverlaysKey.getState(view.state) ?? null)
      return {
        update(currentView, previousState) {
          const active = editorOverlaysKey.getState(currentView.state) ?? null
          if (active !== editorOverlaysKey.getState(previousState)) onChange?.(active)
        },
        destroy() {
          onChange?.(null)
        },
      }
    },
  })
}

// helpers -------------------------------------------------------------------

function attachSurface(
  editor: TiptapEditor,
  surface: HTMLElement,
  options: HtmdOverlaySurfaceOptions,
  onDestroy: () => void,
): HtmdOverlayBinding {
  const viewport = editor.view.dom.ownerDocument.defaultView!
  const container = findScrollContainer(editor.view.dom)
  let frame = 0
  let destroyed = false

  const update = () => {
    if (destroyed || frame) return
    frame = viewport.requestAnimationFrame(() => {
      frame = 0
      if (destroyed || editor.isDestroyed || !surface.isConnected) return
      const anchor = options.anchor()
      if (anchor === null) return
      const rect = resolveAnchor(editor, anchor)
      if (!rect) return
      const bounds = surface.getBoundingClientRect()
      const { left, top } = placeSurface(
        rect,
        {
          ...options,
          width: bounds.width || options.width,
          height: bounds.height || options.height,
        },
        viewport,
      )
      surface.style.left = `${left}px`
      surface.style.top = `${top}px`
    })
  }
  const preventWheel = (event: WheelEvent) => {
    const locked =
      typeof options.lockScroll === 'function' ? options.lockScroll() : options.lockScroll
    if (!locked || (event.target instanceof Node && surface.contains(event.target))) return
    event.preventDefault()
  }
  const observer = new ResizeObserver(update)
  observer.observe(surface)
  editor.on('transaction', update)
  editor.on('selectionUpdate', update)
  viewport.addEventListener('scroll', update, true)
  viewport.addEventListener('resize', update)
  container?.addEventListener('wheel', preventWheel, { passive: false })
  update()

  return {
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      viewport.cancelAnimationFrame(frame)
      observer.disconnect()
      editor.off('transaction', update)
      editor.off('selectionUpdate', update)
      viewport.removeEventListener('scroll', update, true)
      viewport.removeEventListener('resize', update)
      container?.removeEventListener('wheel', preventWheel)
      onDestroy()
    },
  }
}

function resolveAnchor(
  editor: TiptapEditor,
  anchor: ReturnType<HtmdOverlaySurfaceOptions['anchor']>,
): HtmdOverlayRect | null {
  if (anchor === null) return null
  if (typeof anchor === 'number') {
    if (!Number.isInteger(anchor) || anchor < 0 || anchor > editor.state.doc.content.size)
      return null
    return editor.view.coordsAtPos(anchor)
  }
  if (anchor !== 'selection') return anchor
  const selection = editor.view.dom.ownerDocument.getSelection()
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0)
    if (editor.view.dom.contains(range.commonAncestorContainer)) {
      const rect = range.getBoundingClientRect()
      if (rect.width) return rect
    }
  }
  const { from, to } = editor.state.selection
  const start = editor.view.coordsAtPos(from)
  const end = editor.view.coordsAtPos(to)
  return { left: start.left, right: end.left, top: start.top, bottom: end.bottom }
}

function placeSurface(
  rect: HtmdOverlayRect,
  {
    width,
    height,
    gap = 8,
    viewportGap = 16,
    placement = 'bottom',
    align = 'start',
  }: HtmdOverlaySurfaceOptions,
  viewport: Window,
) {
  const below = viewport.innerHeight - viewportGap - rect.bottom - gap
  const above = rect.top - viewportGap - gap
  const useTop =
    placement === 'top' ? above >= height || above > below : below < height && above > below
  const top = useTop ? rect.top - height - gap : rect.bottom + gap
  const left = align === 'center' ? (rect.left + rect.right - width) / 2 : rect.left
  return {
    left: Math.min(
      Math.max(left, viewportGap),
      Math.max(viewport.innerWidth - width - viewportGap, viewportGap),
    ),
    top: Math.min(
      Math.max(top, viewportGap),
      Math.max(viewport.innerHeight - height - viewportGap, viewportGap),
    ),
  }
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  const document = element.ownerDocument
  let current = element.parentElement
  while (current && current !== document.body) {
    const overflowY = document.defaultView!.getComputedStyle(current).overflowY
    if (/(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight)
      return current
    current = current.parentElement
  }
  return null
}
