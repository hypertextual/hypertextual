<script lang="ts">
  import { PanZoomViewport } from '../diagram-viewport'
  import type { PanZoomViewportState } from '../diagram-viewport/types'
  import { fileViewerStyles } from './styles'

  // Props ---------------------------------------------------------------------
  interface ImageRendererProps {
    src: string
    srcset?: string
    sizes?: string
    alt?: string
    isFullscreen?: boolean
    scale?: number
    panX?: number
    panY?: number
    tabindex?: number
    ariaLabel?: string
    onviewportchange?: (state: PanZoomViewportState) => void
    onfocus?: (event: FocusEvent) => void
    onkeydown?: (event: KeyboardEvent) => void
    class?: string
  }

  let {
    src,
    srcset,
    sizes,
    alt = '',
    isFullscreen = false,
    scale = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    tabindex = -1,
    ariaLabel = 'File preview',
    onviewportchange,
    onfocus,
    onkeydown,
    class: className,
  }: ImageRendererProps = $props()

  // State ---------------------------------------------------------------------
  let viewport = $state<ReturnType<typeof PanZoomViewport> | null>(null)

  // Methods -------------------------------------------------------------------
  export function focus() {
    viewport?.focus()
  }

  export function zoomBy(delta = 0.25): boolean {
    return viewport?.zoomBy(delta) ?? false
  }

  export function panBy(dx = 0, dy = 48): boolean {
    return viewport?.panBy(dx, dy) ?? false
  }

  export function resetViewport(): boolean {
    return viewport?.resetViewport() ?? false
  }
</script>

<PanZoomViewport
  bind:this={viewport}
  bind:scale
  bind:panX
  bind:panY
  {tabindex}
  {ariaLabel}
  canvasClass={isFullscreen ? 'flex h-full w-full items-center justify-center' : 'w-full'}
  {onviewportchange}
  {onfocus}
  {onkeydown}
  data-file-viewer-viewport=""
  class={className}
>
  <img
    {src}
    {srcset}
    {sizes}
    {alt}
    draggable="false"
    data-file-viewer-image=""
    class={isFullscreen ? fileViewerStyles.fullscreenImage : fileViewerStyles.image}
  />
</PanZoomViewport>
