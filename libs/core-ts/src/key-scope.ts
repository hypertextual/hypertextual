import type {
  EditorCommandDefinition,
  EditorHotkeyService,
  EditorMode,
  EditorPreset,
  KeyBinding,
  Keymap,
  KeyScopeOptions,
  KeyScopePriority,
} from './types.js'

const PRIORITY_RANK: Record<KeyScopePriority, number> = {
  overlay: 0,
  widget: 1,
  extension: 2,
  editor: 3,
  pane: 4,
  global: 5,
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

export function normalizeKeyEvent(event: KeyboardEvent): string {
  const rawKey = event.key === ' ' ? 'Space' : event.key
  if (MODIFIER_KEYS.has(rawKey)) return rawKey

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.metaKey) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && (rawKey.length > 1 || event.ctrlKey || event.metaKey || event.altKey)) {
    parts.push('Shift')
  }
  const normalizedKey =
    rawKey.length === 1 && (event.ctrlKey || event.metaKey || event.altKey)
      ? rawKey.toLowerCase()
      : rawKey
  parts.push(normalizedKey)
  return parts.join('+')
}

export function candidateKeysForEvent(event: KeyboardEvent): string[] {
  const rawKey = event.key === ' ' ? 'Space' : event.key
  if (MODIFIER_KEYS.has(rawKey)) return [rawKey]

  const candidates = new Set<string>()
  const primary = normalizeKeyEvent(event)
  candidates.add(primary)
  candidates.add(primary.replaceAll('+', '-'))

  const normalizedKey =
    rawKey.length === 1 && (event.ctrlKey || event.metaKey || event.altKey)
      ? rawKey.toLowerCase()
      : rawKey

  if (event.metaKey || event.ctrlKey) {
    const modParts = ['Mod']
    if (event.altKey) modParts.push('Alt')
    if (event.shiftKey) modParts.push('Shift')
    modParts.push(normalizedKey)
    candidates.add(modParts.join('+'))
    candidates.add(modParts.join('-'))
  }

  return [...candidates]
}

interface RegisteredScope {
  order: number
  options: KeyScopeOptions<unknown>
}

interface HasContains {
  contains?: (other: unknown) => boolean
}

function nodeContains(container: unknown, target: unknown): boolean {
  if (!container || !target) return false
  if (container === target) return true
  const maybeContainer = container as HasContains
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

    const candidates = candidateKeysForEvent(event)
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

      for (const keyCandidate of candidates) {
        const binding = keymap[keyCandidate]
        if (!binding) continue
        if (!matchesMode(binding.mode, mode)) continue
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

export type StandaloneEditorHotkeyService = EditorHotkeyService & {
  setOverlayOpen(open: boolean): void
  destroy(): void
}

export function createStandaloneHotkeyService(options?: {
  initialMode?: EditorMode
  initialPreset?: EditorPreset
  attachWindowListener?: boolean
  syncState?: () => {
    mode?: EditorMode
    preset?: EditorPreset
    overlayOpen?: boolean
    prefixActive?: boolean
  } | null
}): StandaloneEditorHotkeyService {
  const dispatcher = new KeyScopeDispatcher()
  const commands = new Map<string, EditorCommandDefinition>()
  const listeners = new Set<
    (state: { mode: EditorMode; preset: EditorPreset; overlayOpen: boolean }) => void
  >()

  let mode: EditorMode = options?.initialMode ?? 'normal'
  let preset: EditorPreset = options?.initialPreset ?? 'helix'
  let overlayOpen = false
  let prefixActive = false

  const syncFromExternal = () => {
    const ext = options?.syncState?.()
    if (!ext) return
    if (ext.mode !== undefined) mode = ext.mode
    if (ext.preset !== undefined) preset = ext.preset
    if (ext.overlayOpen !== undefined) overlayOpen = ext.overlayOpen
    if (ext.prefixActive !== undefined) prefixActive = ext.prefixActive
  }

  const emit = () => {
    const snapshot = { mode, preset, overlayOpen }
    for (const listener of listeners) listener(snapshot)
  }

  const handleWindowKeyDown = (event: KeyboardEvent) => {
    service.dispatchKeyDown(event)
  }

  if (options?.attachWindowListener && typeof window !== 'undefined') {
    window.addEventListener('keydown', handleWindowKeyDown, true)
  }

  const service: EditorHotkeyService & { setOverlayOpen(open: boolean): void; destroy(): void } = {
    getMode: () => mode,
    setMode(nextMode: EditorMode) {
      if (mode === nextMode) return
      mode = nextMode
      emit()
    },
    getPreset: () => preset,
    setPreset(nextPreset: EditorPreset) {
      if (preset === nextPreset) return
      preset = nextPreset
      emit()
    },
    isOverlayOpen: () => overlayOpen,
    setOverlayOpen(nextOpen: boolean) {
      if (overlayOpen === nextOpen) return
      overlayOpen = nextOpen
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    registerKeyScope(scopeOptions) {
      return dispatcher.register(scopeOptions)
    },
    registerCommand(command) {
      commands.set(command.id, command)
      return () => {
        commands.delete(command.id)
      }
    },
    registerModalTarget() {
      return () => {}
    },
    focusPane() {
      return false
    },
    dispatchKeyDown(event: KeyboardEvent): boolean {
      syncFromExternal()
      return dispatcher.dispatch(event, mode, { overlayOpen, prefixActive })
    },
    getActiveBindings() {
      syncFromExternal()
      return dispatcher.getActiveBindings(mode)
    },
    destroy() {
      if (options?.attachWindowListener && typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleWindowKeyDown, true)
      }
      listeners.clear()
      commands.clear()
    },
  }

  return service
}

const documentHotkeyServices = new WeakMap<Document, EditorHotkeyService>()

export function setDocumentHotkeyService(
  doc: Document | null | undefined,
  service: EditorHotkeyService | null,
): () => void {
  if (!doc) return () => {}
  if (service) {
    documentHotkeyServices.set(doc, service)
  } else {
    documentHotkeyServices.delete(doc)
  }
  return () => {
    if (documentHotkeyServices.get(doc) === service) {
      documentHotkeyServices.delete(doc)
    }
  }
}

export function getDocumentHotkeyService(doc?: Document | null): EditorHotkeyService | undefined {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!targetDoc) return undefined
  return documentHotkeyServices.get(targetDoc)
}
