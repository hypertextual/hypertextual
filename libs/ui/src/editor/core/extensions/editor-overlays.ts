import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type {
  EditorOverlayOpenOptions,
  EditorOverlayState,
  EditorOverlaysOptions,
  EditorOverlaysController,
  EditorOverlayBinding,
  EditorOverlaySurfaceOptions,
  EditorOverlayRect,
} from '../types'

/** Query the active overlay through the editor's ProseMirror state. */
export const editorOverlaysKey = new PluginKey<EditorOverlayState | null>('editorOverlays')

type OverlayAction = { type: 'open'; overlay: EditorOverlayState } | { type: 'close' }

declare module '@tiptap/core' {
  interface Storage {
    editorOverlays: EditorOverlaysController
  }
  interface Commands<ReturnType> {
    editorOverlays: {
      /** Open a registered overlay without changing document content. */
      openOverlay: (name: string, options?: EditorOverlayOpenOptions) => ReturnType
      /** Close the active overlay; an optional name guards against stale dismissals. */
      closeOverlay: (name?: string) => ReturnType
    }
  }
}

/** Own registered overlay state and anchor mapping; the host supplies rendering. */
export const EditorOverlays = Extension.create<
  EditorOverlaysOptions,
  EditorOverlaysController & { bindings: Set<EditorOverlayBinding> }
>({
  name: 'editorOverlays',

  addOptions() {
    return { overlays: {}, onChange: undefined }
  },

  addStorage() {
    return {
      bindings: new Set<EditorOverlayBinding>(),
      attach: () => {
        throw new Error('Overlay surfaces require an initialized editor')
      },
    }
  },

  onBeforeCreate() {
    const editor = this.editor
    const bindings = this.storage.bindings
    this.storage.attach = (surface, options) => {
      const binding = attachSurface(editor, surface, options, () => bindings.delete(binding))
      bindings.add(binding)
      return binding
    }
  },

  onDestroy() {
    for (const binding of this.storage.bindings) binding.destroy()
  },

  addCommands() {
    return {
      openOverlay:
        (name, options = {}) =>
        ({ tr, dispatch }) => {
          const position = options.position ?? tr.selection.from
          if (
            !Object.hasOwn(this.options.overlays, name) ||
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
                definition: this.options.overlays[name]!,
                data: options.data,
              },
            } satisfies OverlayAction)
          }
          return true
        },
      closeOverlay:
        (name) =>
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
    }
  },

  addProseMirrorPlugins() {
    const onChange = this.options.onChange
    return [
      new Plugin<EditorOverlayState | null>({
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
      }),
    ]
  },
})

/** Bind rendering surfaces to the editor without adding them to document state. */
function attachSurface(
  editor: Editor,
  surface: HTMLElement,
  options: EditorOverlaySurfaceOptions,
  onDestroy: () => void,
): EditorOverlayBinding {
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
  editor: Editor,
  anchor: ReturnType<EditorOverlaySurfaceOptions['anchor']>,
): EditorOverlayRect | null {
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
  rect: EditorOverlayRect,
  {
    width,
    height,
    gap = 8,
    viewportGap = 16,
    placement = 'bottom',
    align = 'start',
  }: EditorOverlaySurfaceOptions,
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
