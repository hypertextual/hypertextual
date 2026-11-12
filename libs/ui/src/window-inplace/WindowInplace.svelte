<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceVariants } from './styles'
  import type { WindowInplaceProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    fullscreen = $bindable(false),
    children,
    class: className,
    style: callerStyle,
    ...rest
  }: WindowInplaceProps = $props()

  // State ---------------------------------------------------------------------
  let rootEl = $state<HTMLDivElement | null>(null)
  let fullscreenRect = $state<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )

  // Derived -------------------------------------------------------------------
  const rootStyle = $derived.by(() => {
    const base = typeof callerStyle === 'string' && callerStyle ? `${callerStyle}; ` : ''
    if (fullscreen && fullscreenRect) {
      return `${base}white-space: normal; top: ${fullscreenRect.top}px; left: ${fullscreenRect.left}px; width: ${fullscreenRect.width}px; height: ${fullscreenRect.height}px;`
    }
    return `${base}white-space: normal;`
  })

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (!fullscreen || !rootEl) {
      fullscreenRect = null
      return
    }
    const region =
      rootEl.closest<HTMLElement>('[role="region"]') ??
      rootEl.closest<HTMLElement>('.editor-container')
    if (!region) return
    const previousOverflow = region.style.overflow
    region.style.overflow = 'hidden'
    const updateRect = () => {
      const rect = region.getBoundingClientRect()
      fullscreenRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    }
    updateRect()
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateRect) : null
    resizeObserver?.observe(region)
    window.addEventListener('resize', updateRect)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateRect)
      region.style.overflow = previousOverflow
    }
  })

  // Methods -------------------------------------------------------------------
  export function getElement(): HTMLDivElement | null {
    return rootEl
  }
</script>

<div
  bind:this={rootEl}
  data-window-inplace=""
  data-window-inplace-fullscreen={fullscreen ? 'true' : 'false'}
  style={rootStyle}
  class={cn(windowInplaceVariants({ fullscreen }), className)}
  {...rest}
>
  {@render children?.()}
</div>
