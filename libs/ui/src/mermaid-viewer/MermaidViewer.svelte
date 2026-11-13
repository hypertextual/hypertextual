<script lang="ts">
  import { untrack } from 'svelte'
  import { cn, mermaidLoadingBase, renderMermaidSource } from '@cloudvoyant/helical-ui'
  import { mermaidViewerCanvasVariants, mermaidViewerViewport } from './styles'
  import type { MermaidViewerProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    code,
    debounceMs = 0,
    fit = 'auto',
    scale = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    error = $bindable<string | null>(null),
    tabindex = -1,
    ariaLabel = 'Mermaid diagram preview',
    onviewportchange,
    onfocus,
    onkeydown,
    class: className,
  }: MermaidViewerProps = $props()

  // State ---------------------------------------------------------------------
  const PAN_STEP = 48
  const ZOOM_STEP = 0.25
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4.0

  let viewportEl = $state<HTMLDivElement | null>(null)
  let svgMarkup = $state('')
  let lastValidSvg = $state('')
  let isRendering = $state(false)
  let isPointerPanning = $state(false)
  let pointerPanStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }
  let activePointers = new Map<number, { clientX: number; clientY: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = 1
  let renderSeq = 0

  // Derived -------------------------------------------------------------------
  const displaySvg = $derived(svgMarkup || lastValidSvg)
  const canvasTransformStyle = $derived(
    `transform: translate3d(${panX}px, ${panY}px, 0) scale(${scale}); transform-origin: center center;`,
  )

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const trimmed = code.trim()
    if (!trimmed) {
      svgMarkup = ''
      error = null
      return
    }
    const delay = untrack(() => (debounceMs > 0 && lastValidSvg ? debounceMs : 0))
    const timer = setTimeout(() => {
      void renderDiagram(trimmed)
    }, delay)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
    const observer = new MutationObserver(() => {
      const trimmed = code.trim()
      if (trimmed) void renderDiagram(trimmed)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  })

  // Methods -------------------------------------------------------------------
  async function renderDiagram(source: string) {
    const seq = ++renderSeq
    isRendering = true
    try {
      const rendered = await renderMermaidSource(source)
      if (!lastValidSvg) {
        lastValidSvg = rendered
      }
      if (seq !== renderSeq) return
      svgMarkup = rendered
      lastValidSvg = rendered
      error = null
    } catch (err) {
      if (seq !== renderSeq) return
      error = err instanceof Error ? err.message : 'Invalid Mermaid syntax'
    } finally {
      if (seq === renderSeq) {
        isRendering = false
      }
    }
  }

  function notifyViewportChange() {
    onviewportchange?.({ scale, panX, panY })
  }

  export function focus() {
    viewportEl?.focus()
  }

  export function zoomBy(delta = ZOOM_STEP): boolean {
    scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((scale + delta) * 100) / 100))
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
      scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
      notifyViewportChange()
    }
  }

  function handleCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select')) return
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
        scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
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
  data-mermaid-viewport=""
  data-modal-ignore-pointer=""
  class={cn(mermaidViewerViewport, className)}
  {onfocus}
  {onkeydown}
  onwheel={handleCanvasWheel}
  onpointerdown={handleCanvasPointerDown}
  onpointermove={handleCanvasPointerMove}
  onpointerup={handleCanvasPointerUp}
  onpointercancel={handleCanvasPointerUp}
>
  {#if displaySvg}
    <div
      data-mermaid-canvas=""
      class={mermaidViewerCanvasVariants({ fit })}
      style={canvasTransformStyle}
    >
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html displaySvg}
    </div>
  {:else if isRendering}
    <div class={mermaidLoadingBase}>Rendering diagram...</div>
  {:else if fit === 'contain'}
    <span class="text-xs text-muted-foreground">Empty diagram</span>
  {/if}
</div>
