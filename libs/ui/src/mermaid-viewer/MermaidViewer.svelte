<script lang="ts">
  import { untrack } from 'svelte'
  import { mermaidLoadingBase, renderMermaidSource } from '@cloudvoyant/helical-ui'
  import { PanZoomViewport } from '../diagram-viewport'
  import { mermaidViewerCanvasVariants } from './styles'
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
  let viewport = $state<ReturnType<typeof PanZoomViewport> | null>(null)
  let svgMarkup = $state('')
  let lastValidSvg = $state('')
  let isRendering = $state(false)
  let renderSeq = 0

  // Derived -------------------------------------------------------------------
  const displaySvg = $derived(svgMarkup || lastValidSvg)

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
  {onviewportchange}
  {onfocus}
  {onkeydown}
  data-mermaid-viewport=""
  class={className}
>
  {#if displaySvg}
    <div data-mermaid-canvas="" class={mermaidViewerCanvasVariants({ fit })}>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html displaySvg}
    </div>
  {:else if isRendering}
    <div class={mermaidLoadingBase}>Rendering diagram...</div>
  {:else if fit === 'contain'}
    <span class="text-xs text-muted-foreground">Empty diagram</span>
  {/if}
</PanZoomViewport>
