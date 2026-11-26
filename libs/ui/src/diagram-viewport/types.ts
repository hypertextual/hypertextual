import type { Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export interface PanZoomViewportState {
  scale: number
  panX: number
  panY: number
}

export interface PanZoomViewportProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  scale?: number
  panX?: number
  panY?: number
  minZoom?: number
  maxZoom?: number
  tabindex?: number
  ariaLabel?: string
  canvasClass?: string
  canvasDataAttr?: string
  viewportDataAttr?: string
  onviewportchange?: (state: PanZoomViewportState) => void
  children?: Snippet
}
