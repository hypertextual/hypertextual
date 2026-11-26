<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { panZoomViewportStyles } from './styles'
  import type { PanZoomViewportProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    scale = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    minZoom = 0.25,
    maxZoom = 4.0,
    tabindex = -1,
    ariaLabel = 'Diagram viewport',
    canvasClass,
    onviewportchange,
    onfocus,
    onkeydown,
    class: className,
    children,
    ...rest
  }: PanZoomViewportProps = $props()

  // State ---------------------------------------------------------------------
  const PAN_STEP = 48
  const ZOOM_STEP = 0.25

  let viewportEl = $state<HTMLDivElement | null>(null)
  let isPointerPanning = $state(false)
  let pointerPanStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }
  let activePointers = new Map<number, { clientX: number; clientY: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = 1

  // Derived -------------------------------------------------------------------
  const canvasTransformStyle = $derived(
    `transform: translate3d(${panX}px, ${panY}px, 0) scale(${scale}); transform-origin: center center;`,
  )

  // Methods -------------------------------------------------------------------
  function notifyViewportChange() {
    onviewportchange?.({ scale, panX, panY })
  }

  export function focus() {
    viewportEl?.focus()
  }

  export function zoomBy(delta = ZOOM_STEP): boolean {
    scale = Math.max(minZoom, Math.min(maxZoom, Math.round((scale + delta) * 100) / 100))
    notifyViewportChange()
    return true
  }

  export function panBy(dx = 0, dy = PAN_STEP): boolean {
    panX += dx
    panY += dy
    notifyViewportChange()
    return true
  }

  export function resetViewport(): boolean {
    scale = 1
    panX = 0
    panY = 0
    notifyViewportChange()
    return true
  }

  function getTouchDistance(): number {
    const pts = Array.from(activePointers.values())
    if (pts.length < 2) return 0
    return Math.hypot(pts[1]!.clientX - pts[0]!.clientX, pts[1]!.clientY - pts[0]!.clientY)
  }

  function handleCanvasWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const factor = event.deltaY < 0 ? 1.1 : 0.9
      const next = Math.round(scale * factor * 100) / 100
      scale = Math.max(minZoom, Math.min(maxZoom, next))
      notifyViewportChange()
    }
  }

  function handleCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select, a')) return
    event.preventDefault()
    event.stopPropagation()
    activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)

    if (activePointers.size === 2) {
      isPointerPanning = false
      pinchStartDistance = getTouchDistance()
      pinchStartScale = scale
      return
    }

    if (activePointers.size === 1) {
      isPointerPanning = true
      pointerPanStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        startX: panX,
        startY: panY,
      }
    }
  }

  function handleCanvasPointerMove(event: PointerEvent) {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    }
    if (activePointers.size >= 2 && pinchStartDistance > 0) {
      const dist = getTouchDistance()
      if (dist > 0) {
        const next = Math.round(pinchStartScale * (dist / pinchStartDistance) * 100) / 100
        scale = Math.max(minZoom, Math.min(maxZoom, next))
        notifyViewportChange()
      }
      return
    }
    if (!isPointerPanning) return
    panX = pointerPanStart.startX + (event.clientX - pointerPanStart.clientX)
    panY = pointerPanStart.startY + (event.clientY - pointerPanStart.clientY)
    notifyViewportChange()
  }

  function handleCanvasPointerUp(event: PointerEvent) {
    activePointers.delete(event.pointerId)
    if (activePointers.size < 2) {
      pinchStartDistance = 0
    }
    if (activePointers.size === 0) {
      isPointerPanning = false
    }
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={viewportEl}
  {tabindex}
  role="group"
  aria-label={ariaLabel}
  contenteditable={false}
  data-pan-zoom-viewport=""
  data-modal-ignore-pointer=""
  class={cn(panZoomViewportStyles.viewport, className)}
  {onfocus}
  {onkeydown}
  onwheel={handleCanvasWheel}
  onpointerdown={handleCanvasPointerDown}
  onpointermove={handleCanvasPointerMove}
  onpointerup={handleCanvasPointerUp}
  onpointercancel={handleCanvasPointerUp}
  {...rest}
>
  <div
    data-pan-zoom-canvas=""
    class={cn(panZoomViewportStyles.canvas, canvasClass)}
    style={canvasTransformStyle}
  >
    {@render children?.()}
  </div>
</div>
