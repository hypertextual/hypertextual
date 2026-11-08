import {
  getDocumentWhichKeyController,
  subscribeDocumentWhichKeyController,
  type KeymapMode,
  type WhichKeyNode,
} from '@cloudvoyant/helical-ui'
import type { EditorHostServices, EditorHotkeyService, Keymap, KeyScopeOptions } from 'core-ts'
import { getContext, hasContext, setContext } from 'svelte'

const EDITOR_HOST_SERVICES_CONTEXT = Symbol.for('hypertextual.editor-host-services')

function toWhichKeyNodes<TCtx>(
  keymap: Keymap<TCtx> | (() => Keymap<TCtx>),
  getContextValue: () => TCtx,
): () => Record<string, WhichKeyNode> {
  return () => {
    const resolved = typeof keymap === 'function' ? keymap() : keymap
    const nodes: Record<string, WhichKeyNode> = {}
    for (const [rawKey, binding] of Object.entries(resolved)) {
      if (!binding) continue
      const normalizedKey = rawKey.replace(/-(?=.)/g, '+')
      const mode: KeymapMode | KeymapMode[] = binding.mode
        ? Array.isArray(binding.mode)
          ? ([...binding.mode] as KeymapMode[])
          : (binding.mode as KeymapMode)
        : ['normal', 'select', 'insert']
      const node: WhichKeyNode = {
        key: normalizedKey,
        label: binding.label,
        description: binding.description,
        category: binding.category,
        mode,
        hidden: !binding.category,
        when: binding.when
          ? (cmdCtx) => (cmdCtx.event ? binding.when!(getContextValue(), cmdCtx.event) : false)
          : undefined,
        action: (cmdCtx) => (cmdCtx.event ? binding.run(getContextValue(), cmdCtx.event) : false),
      }
      nodes[normalizedKey] = node
      if (normalizedKey !== rawKey) {
        nodes[rawKey] = node
      }
    }
    if ((nodes.Home || nodes.End) && !nodes.g) {
      const gotoChildren: Record<string, WhichKeyNode> = {}
      if (nodes.Home) gotoChildren.Home = nodes.Home
      if (nodes.End) gotoChildren.End = nodes.End
      nodes.g = {
        key: 'g',
        label: '+goto',
        group: 'Goto',
        hidden: true,
        children: gotoChildren,
      }
    }
    return nodes
  }
}

/**
 * Registers a `KeyScopeOptions` layer directly on the document's active
 * `WhichKeyController` and re-syncs if the root controller re-mounts.
 */
export function registerKeyScopeWithWhichKey<TCtx = unknown>(
  options: KeyScopeOptions<TCtx>,
): () => void {
  if (typeof document === 'undefined') return () => {}
  const nodesGetter = toWhichKeyNodes(options.keymap, options.getContext)
  let unregister: (() => void) | undefined
  const sync = () => {
    unregister?.()
    unregister = getDocumentWhichKeyController(document)?.registerKeymap(options.id, nodesGetter, {
      priority: options.priority,
      enabled: options.enabled,
      element: options.element
        ? () => {
            const el = options.element!()
            if (!el || !options.matchesTarget || typeof document === 'undefined') return el
            const activeEl = document.activeElement
            if (activeEl && !el.contains(activeEl) && options.matchesTarget(activeEl, activeEl)) {
              return activeEl instanceof HTMLElement ? activeEl : document.body
            }
            return el
          }
        : undefined,
      matchesTarget: options.matchesTarget
        ? (target) => {
            const el = options.element?.()
            const activeEl = typeof document !== 'undefined' ? document.activeElement : null
            if (
              el &&
              ((target instanceof Node && el.contains(target)) ||
                (activeEl instanceof Node && el.contains(activeEl)))
            ) {
              return true
            }
            return options.matchesTarget!(target, activeEl)
          }
        : undefined,
    })
  }
  sync()
  const unsubDoc = subscribeDocumentWhichKeyController(document, sync)
  return () => {
    unsubDoc()
    unregister?.()
  }
}

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
 * component via `WhichKeyController.registerKeymap` (or an injected
 * `EditorHotkeyService`).
 */
export function useKeyScope<TCtx = unknown>(options: UseKeyScopeOptions<TCtx>): void {
  const getServices = hasContext(EDITOR_HOST_SERVICES_CONTEXT)
    ? getContext<(() => EditorHostServices | undefined) | undefined>(EDITOR_HOST_SERVICES_CONTEXT)
    : undefined

  $effect(() => {
    const explicitHotkeys =
      typeof options.hotkeys === 'function' ? options.hotkeys() : options.hotkeys
    const service = explicitHotkeys ?? getServices?.()?.hotkeys
    if (service) {
      return service.registerKeyScope({
        id: options.id,
        priority: options.priority,
        element: options.element,
        matchesTarget: options.matchesTarget,
        enabled: options.enabled,
        getContext: options.getContext,
        keymap: options.keymap,
      })
    }

    return registerKeyScopeWithWhichKey(options)
  })
}
