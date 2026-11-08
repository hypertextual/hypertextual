import type { Snippet } from 'svelte'

export type PipWindowScope = 'container' | 'viewport'

export type PipWindowPlacement = 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left'

export interface PipWindowProps {
  /** Window header title text. */
  title?: string
  /** Whether the PiP window is visible. */
  open?: boolean
  /** Positioning scope (`'container'` for `absolute` inside parent `div`, `'viewport'` for `fixed`). */
  scope?: PipWindowScope
  /** Optional explicit boundary container element when `draggable` is enabled. */
  boundaryEl?: HTMLElement | null
  /** Initial corner anchor inside the scoped container or viewport. */
  placement?: PipWindowPlacement
  /** Whether the body is collapsed to a header-only pill. */
  minimized?: boolean
  /** Whether pointer dragging on the header bar is enabled. */
  draggable?: boolean
  /** Whether resize handles are enabled. */
  resizable?: boolean
  /** Callback invoked when the minimize/restore button is toggled. */
  onminimizechange?: (minimized: boolean) => void
  /** Callback invoked when the Fullscreen button is activated. */
  onfullscreen?: () => void
  /** Optional header action controls rendered before Minimize and Fullscreen. */
  actions?: Snippet
  /** Main body content rendered when not minimized. */
  children: Snippet
  /** Optional caller class overrides merged via `cn`. */
  class?: string
}
