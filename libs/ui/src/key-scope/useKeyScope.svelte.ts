import { getDocumentWhichKeyController } from '@cloudvoyant/helical-ui'
import {
  KeyScopeDispatcher,
  type EditorHostServices,
  type EditorHotkeyService,
  type EditorMode,
  type KeyScopeOptions,
} from 'core-ts'
import { getContext, hasContext, setContext } from 'svelte'

const EDITOR_HOST_SERVICES_CONTEXT = Symbol.for('hypertextual.editor-host-services')

interface DocumentScopeEntry {
  dispatcher: KeyScopeDispatcher
  count: number
  listener: (event: KeyboardEvent) => void
}

const documentScopeEntries = new WeakMap<Document, DocumentScopeEntry>()

function registerDocumentScope<TCtx>(doc: Document, options: KeyScopeOptions<TCtx>): () => void {
  let entry = documentScopeEntries.get(doc)
  if (!entry) {
    const dispatcher = new KeyScopeDispatcher()
    const listener = (event: KeyboardEvent) => {
      const wk = getDocumentWhichKeyController(doc)?.getState()
      const mode: EditorMode = (wk?.mode as EditorMode | undefined) ?? 'normal'
      const overlayOpen = Boolean(wk?.isOpen || wk?.explorerOpen)
      const prefixActive = Boolean(
        wk && (wk.activePath.length > 0 || wk.countBuffer.length > 0),
      )
      dispatcher.dispatch(event, mode, { overlayOpen, prefixActive })
    }
    entry = { dispatcher, count: 0, listener }
    documentScopeEntries.set(doc, entry)
  }
  if (entry.count === 0 && typeof window !== 'undefined') {
    window.addEventListener('keydown', entry.listener, true)
  }
  entry.count += 1
  const unregister = entry.dispatcher.register(options)
  return () => {
    unregister()
    if (!entry) return
    entry.count = Math.max(0, entry.count - 1)
    if (entry.count === 0 && typeof window !== 'undefined') {
      window.removeEventListener('keydown', entry.listener, true)
    }
  }
}

/**
 * Provides `EditorHostServices` in Svelte component context for descendant
 * editor surfaces and popovers.
 */
export function provideEditorHostServices(getServices: () => EditorHostServices | undefined): void {
  setContext(EDITOR_HOST_SERVICES_CONTEXT, getServices)
}

/**
 * Reads optional `EditorHostServices` from Svelte component context if present.
 */
export function useOptionalEditorHostServices(): EditorHostServices | undefined {
  if (!hasContext(EDITOR_HOST_SERVICES_CONTEXT)) return undefined
  const getter = getContext<(() => EditorHostServices | undefined) | undefined>(
    EDITOR_HOST_SERVICES_CONTEXT,
  )
  return getter?.()
}

export interface UseKeyScopeOptions<TCtx = unknown> extends KeyScopeOptions<TCtx> {
  hotkeys?: EditorHotkeyService | (() => EditorHotkeyService | undefined)
}

/**
 * Registers a reactive DOM-scoped keymap for the lifetime of the owning Svelte
 * component.
 */
export function useKeyScope<TCtx = unknown>(options: UseKeyScopeOptions<TCtx>): void {
  const getServices = hasContext(EDITOR_HOST_SERVICES_CONTEXT)
    ? getContext<(() => EditorHostServices | undefined) | undefined>(EDITOR_HOST_SERVICES_CONTEXT)
    : undefined

  $effect(() => {
    const explicitHotkeys =
      typeof options.hotkeys === 'function' ? options.hotkeys() : options.hotkeys
    const contextHotkeys = getServices?.()?.hotkeys
    const service = explicitHotkeys ?? contextHotkeys

    const scopeOptions: KeyScopeOptions<TCtx> = {
      id: options.id,
      priority: options.priority,
      element: options.element,
      matchesTarget: options.matchesTarget,
      enabled: options.enabled,
      getContext: options.getContext,
      keymap: options.keymap,
    }

    if (service) {
      return service.registerKeyScope(scopeOptions)
    }

    const doc =
      options.element?.()?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
    if (!doc) return
    return registerDocumentScope(doc, scopeOptions)
  })
}
