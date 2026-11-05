import { getDocumentWhichKeyController } from '@cloudvoyant/helical-ui'
import {
  createStandaloneHotkeyService,
  getDocumentHotkeyService,
  type EditorHostServices,
  type EditorHotkeyService,
  type KeyScopeOptions,
  type StandaloneEditorHotkeyService,
} from 'core-ts'
import { getContext, hasContext, setContext } from 'svelte'

const EDITOR_HOST_SERVICES_CONTEXT = Symbol.for('hypertextual.editor-host-services')

const fallbackServices = new WeakMap<Document, StandaloneEditorHotkeyService>()

function getFallbackHotkeyService(doc: Document): StandaloneEditorHotkeyService {
  let existing = fallbackServices.get(doc)
  if (!existing) {
    existing = createStandaloneHotkeyService({
      initialMode: 'normal',
      attachWindowListener: true,
      syncState: () => {
        const wk = getDocumentWhichKeyController(doc)
        if (!wk) return null
        const st = wk.getState()
        return {
          mode: st.mode,
          preset: st.preset,
          overlayOpen: st.isOpen || st.explorerOpen,
          prefixActive: st.activePath.length > 0 || st.countBuffer.length > 0,
        }
      },
    })
    fallbackServices.set(doc, existing)
  }
  return existing
}

export function provideEditorHostServices(getServices: () => EditorHostServices | undefined): void {
  setContext(EDITOR_HOST_SERVICES_CONTEXT, getServices)
}

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

export function useKeyScope<TCtx = unknown>(options: UseKeyScopeOptions<TCtx>): void {
  const getServices = hasContext(EDITOR_HOST_SERVICES_CONTEXT)
    ? getContext<(() => EditorHostServices | undefined) | undefined>(EDITOR_HOST_SERVICES_CONTEXT)
    : undefined

  $effect(() => {
    const explicitHotkeys =
      typeof options.hotkeys === 'function' ? options.hotkeys() : options.hotkeys
    const contextHotkeys = getServices?.()?.hotkeys
    const el = options.element?.()
    const doc = el?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
    const documentHotkeys = getDocumentHotkeyService(doc)

    const service: EditorHotkeyService | undefined =
      explicitHotkeys ??
      contextHotkeys ??
      documentHotkeys ??
      (doc ? getFallbackHotkeyService(doc) : undefined)

    if (!service) return

    return service.registerKeyScope({
      id: options.id,
      priority: options.priority,
      element: options.element,
      matchesTarget: options.matchesTarget,
      enabled: options.enabled,
      getContext: options.getContext,
      keymap: options.keymap,
    })
  })
}
