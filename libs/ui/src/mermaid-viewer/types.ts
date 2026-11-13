export type MermaidViewerFit = 'auto' | 'contain'

export interface MermaidViewerProps {
  /** Mermaid diagram source code. */
  code: string
  /** Debounce delay in milliseconds when `code` changes while a valid diagram is already rendered. */
  debounceMs?: number
  /** Fit mode for the rendered SVG (`'auto'` for standard/fullscreen viewer, `'contain'` for compact in-place windows). */
  fit?: MermaidViewerFit
  /** Current zoom scale factor (0.25 to 4.0). */
  scale?: number
  /** Current horizontal pan offset in pixels. */
  panX?: number
  /** Current vertical pan offset in pixels. */
  panY?: number
  /** Latest syntax or rendering error message, or `null` when valid. */
  error?: string | null
  /** Tab index of the interactive viewport container. */
  tabindex?: number
  /** Accessible label for the diagram viewport. */
  ariaLabel?: string
  /** Optional callback invoked when the viewport scale or pan changes. */
  onviewportchange?: (state: { scale: number; panX: number; panY: number }) => void
  /** Optional focus handler on the viewport container. */
  onfocus?: (event: FocusEvent) => void
  /** Optional keydown handler on the viewport container. */
  onkeydown?: (event: KeyboardEvent) => void
  /** Optional caller class overrides merged onto the viewport container. */
  class?: string
}
