import { matchesKeyboardEvent } from '@tanstack/hotkeys'
import type { EditorMode, KeyBinding, Keymap, KeyScopeOptions, KeyScopePriority } from './types.js'

const PRIORITY_RANK: Record<KeyScopePriority, number> = {
  overlay: 0,
  widget: 1,
  extension: 2,
  editor: 3,
  pane: 4,
  global: 5,
}

/**
 * Checks whether a DOM `KeyboardEvent` matches a keymap key or chord string
 * (`'Escape'`, `'Shift-Tab'`, `'Mod-b'`, `'a'`, `'A'`) via `@tanstack/hotkeys`.
 */
export function matchesKeyBinding(event: KeyboardEvent, key: string): boolean {
  if (!key) return false
  if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return event.key === key
  }
  const chord = key.replace(/-(?=.)/g, '+') as Parameters<typeof matchesKeyboardEvent>[1]
  return (
    matchesKeyboardEvent(event, chord, 'mac') || matchesKeyboardEvent(event, chord, 'windows')
  )
}

interface RegisteredScope {
  order: number
  options: KeyScopeOptions<unknown>
}

function nodeContains(container: unknown, target: unknown): boolean {
  if (!container || !target) return false
  if (container === target) return true
  const maybeContainer = container as { contains?: (other: unknown) => boolean }
  if (typeof maybeContainer.contains === 'function') {
    try {
      return maybeContainer.contains(target)
    } catch {
      return false
    }
  }
  return false
}

function matchesMode(
  bindingMode: EditorMode | readonly EditorMode[] | undefined,
  activeMode: EditorMode,
): boolean {
  if (!bindingMode) return true
  if (Array.isArray(bindingMode)) return bindingMode.includes(activeMode)
  return bindingMode === activeMode
}

function resolveKeymap<TCtx>(keymap: Keymap<TCtx> | (() => Keymap<TCtx>)): Keymap<TCtx> {
  return typeof keymap === 'function' ? keymap() : keymap
}

/**
 * Dispatches keyboard events across active DOM scopes ordered by overlay status,
 * innermost DOM containment, priority tier, and registration recency.
 */
export class KeyScopeDispatcher {
  private scopes = new Map<number, RegisteredScope>()
  private nextOrder = 1

  register<TCtx>(options: KeyScopeOptions<TCtx>): () => void {
    const order = this.nextOrder++
    this.scopes.set(order, {
      order,
      options: options as KeyScopeOptions<unknown>,
    })
    return () => {
      this.scopes.delete(order)
    }
  }

  private getSortedActiveScopes(
    event?: KeyboardEvent,
    overlayOnly = false,
  ): Array<{ scope: RegisteredScope; element: HTMLElement | null }> {
    const eventTarget = event?.target ?? null
    const activeEl =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null

    const active: Array<{ scope: RegisteredScope; element: HTMLElement | null }> = []

    for (const scope of this.scopes.values()) {
      const { options } = scope
      if (overlayOnly && options.priority !== 'overlay') continue
      if (options.enabled && !options.enabled()) continue

      let element: HTMLElement | null = null
      if (options.element) {
        element = options.element()
        if (event && (eventTarget || activeEl)) {
          if (!element) continue
          const inTarget = nodeContains(element, eventTarget)
          const inActive = nodeContains(element, activeEl)
          const matchedExtra = options.matchesTarget?.(eventTarget, activeEl) ?? false
          if (!inTarget && !inActive && !matchedExtra) continue
        }
      }
      active.push({ scope, element })
    }

    active.sort((a, b) => {
      const aOverlay = a.scope.options.priority === 'overlay'
      const bOverlay = b.scope.options.priority === 'overlay'
      if (aOverlay !== bOverlay) return aOverlay ? -1 : 1

      if (a.element && b.element && a.element !== b.element) {
        if (nodeContains(b.element, a.element)) return -1
        if (nodeContains(a.element, b.element)) return 1
      }

      const rankDiff =
        PRIORITY_RANK[a.scope.options.priority] - PRIORITY_RANK[b.scope.options.priority]
      if (rankDiff !== 0) return rankDiff

      return b.scope.order - a.scope.order
    })

    return active
  }

  dispatch(
    event: KeyboardEvent,
    mode: EditorMode,
    options?: { overlayOpen?: boolean; prefixActive?: boolean },
  ): boolean {
    if (event.isComposing) return false

    const overlayOnly = Boolean(options?.overlayOpen)
    const prefixActive = Boolean(options?.prefixActive)
    const activeScopes = this.getSortedActiveScopes(event, overlayOnly)

    for (const { scope } of activeScopes) {
      if (
        prefixActive &&
        scope.options.priority !== 'overlay' &&
        event.key !== 'Escape' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        continue
      }

      const keymap = resolveKeymap(scope.options.keymap)
      const ctx = scope.options.getContext()

      for (const [key, binding] of Object.entries(keymap)) {
        if (!binding) continue
        if (!matchesMode(binding.mode, mode)) continue
        if (!matchesKeyBinding(event, key) && !matchesKeyBinding(event, binding.key)) continue
        if (binding.when && !binding.when(ctx, event)) continue
        if (binding.run(ctx, event)) {
          event.preventDefault()
          event.stopPropagation()
          return true
        }
      }
    }

    return false
  }

  getActiveBindings(mode?: EditorMode): KeyBinding<unknown>[] {
    const activeScopes = this.getSortedActiveScopes()
    const result: KeyBinding<unknown>[] = []
    for (const { scope } of activeScopes) {
      const keymap = resolveKeymap(scope.options.keymap)
      for (const binding of Object.values(keymap)) {
        if (mode && !matchesMode(binding.mode, mode)) continue
        result.push(binding)
      }
    }
    return result
  }
}
