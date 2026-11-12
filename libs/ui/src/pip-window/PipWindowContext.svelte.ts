import { getContext, setContext } from 'svelte'

export interface PipWindowContextValue {
  readonly title: string
  readonly minimized: boolean
  readonly draggable: boolean
  readonly hasFullscreen: boolean
  toggleMinimize: (event: MouseEvent) => void
  triggerFullscreen: (event: MouseEvent) => void
  onHeaderPointerDown: (event: PointerEvent) => void
  onHeaderPointerMove: (event: PointerEvent) => void
  onHeaderPointerUp: (event: PointerEvent) => void
}

const PIP_WINDOW_KEY = Symbol('pip-window-context')

/**
 * Provides the parent `PipWindow` state and pointer handlers to compound subcomponents.
 */
export function setPipWindowContext(value: PipWindowContextValue): void {
  setContext(PIP_WINDOW_KEY, value)
}

/**
 * Reads the enclosing `PipWindow` context from a compound subcomponent.
 */
export function usePipWindowContext(): PipWindowContextValue | undefined {
  return getContext<PipWindowContextValue | undefined>(PIP_WINDOW_KEY)
}
