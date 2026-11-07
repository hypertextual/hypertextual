import type { EditorHostServices, EditorHotkeyService, KeyScopeOptions } from 'core-ts'
import { getContext, hasContext, setContext } from 'svelte'

const EDITOR_HOST_SERVICES_CONTEXT = Symbol.for('hypertextual.editor-host-services')

/**
 * Provides `EditorHostServices` in Svelte component context for descendant
 * editor surfaces, panes, and popovers.
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
    const service = explicitHotkeys ?? getServices?.()?.hotkeys
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
