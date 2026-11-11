<script lang="ts">
  import { Portal } from '@ark-ui/svelte/portal'
  import { cn } from '@cloudvoyant/helical-ui'
  import { Maximize2, Minimize2, Minus } from 'lucide-svelte'
  import {
    windowInplaceBody,
    windowInplaceControlButton,
    windowInplaceControls,
    windowInplaceHeader,
    windowInplaceTitle,
    windowInplaceVariants,
  } from './styles'
  import type { WindowInplaceProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    title = 'Preview',
    open = true,
    scope = 'container',
    boundaryEl = null,
    placement = 'top-right',
    showHeader = true,
    minimized = $bindable(false),
    draggable = false,
    resizable = false,
    onminimizechange,
    onfullscreen,
    actions,
    children,
    class: className,
  }: WindowInplaceProps = $props()

  // State ---------------------------------------------------------------------
  let rootEl = $state<HTMLDivElement | null>(null)
  let dragOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 })
  let isDragging = $state(false)
  let dragStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }

  // Derived -------------------------------------------------------------------
  const rootClass = $derived(
    cn(
      windowInplaceVariants({ scope, placement, minimized }),
      resizable && !minimized ? 'resize overflow-auto' : undefined,
      className,
    ),
  )

  const transformStyle = $derived(
    dragOffset.x !== 0 || dragOffset.y !== 0
      ? `transform: translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0);`
      : undefined,
  )

  // Methods -------------------------------------------------------------------
  function handleToggleMinimize(event: MouseEvent) {
    event.stopPropagation()
    const next = !minimized
    minimized = next
    onminimizechange?.(next)
  }

  function handleFullscreen(event: MouseEvent) {
    event.stopPropagation()
    onfullscreen?.()
  }

  function handleHeaderPointerDown(event: PointerEvent) {
    if (!draggable || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, input, select, a, [role="button"]')) return
    isDragging = true
    dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: dragOffset.x,
      startY: dragOffset.y,
    }
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  }

  function handleHeaderPointerMove(event: PointerEvent) {
    if (!isDragging) return
    let nextX = dragStart.startX + (event.clientX - dragStart.clientX)
    let nextY = dragStart.startY + (event.clientY - dragStart.clientY)
    const container =
      boundaryEl ?? (scope === 'container' ? (rootEl?.offsetParent as HTMLElement | null) : null)
    if (container && rootEl) {
      const minX = -rootEl.offsetLeft
      const maxX = Math.max(minX, container.clientWidth - rootEl.offsetLeft - rootEl.offsetWidth)
      const minY = -rootEl.offsetTop
      const maxY = Math.max(minY, container.clientHeight - rootEl.offsetTop - rootEl.offsetHeight)
      nextX = Math.max(minX, Math.min(maxX, nextX))
      nextY = Math.max(minY, Math.min(maxY, nextY))
    }
    dragOffset = { x: nextX, y: nextY }
  }

  function handleHeaderPointerUp(event: PointerEvent) {
    if (!isDragging) return
    isDragging = false
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  }
</script>

{#if open}
  <Portal disabled={scope !== 'viewport'}>
    <div
      bind:this={rootEl}
      role="group"
      aria-label={title}
      contenteditable={false}
      data-window-inplace=""
      data-window-inplace-scope={scope}
      data-window-inplace-placement={placement}
      data-window-inplace-minimized={minimized ? 'true' : 'false'}
      data-pip-window=""
      data-pip-scope={scope}
      data-pip-placement={placement}
      data-pip-minimized={minimized ? 'true' : 'false'}
      data-modal-ignore-pointer=""
      class={rootClass}
      style={transformStyle}
    >
      {#if showHeader}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          data-window-inplace-header=""
          data-pip-header=""
          data-minimized={minimized ? 'true' : 'false'}
          class={cn(
            windowInplaceHeader,
            draggable ? 'cursor-grab active:cursor-grabbing' : undefined,
          )}
          onpointerdown={handleHeaderPointerDown}
          onpointermove={handleHeaderPointerMove}
          onpointerup={handleHeaderPointerUp}
        >
          <span class={windowInplaceTitle}>{title}</span>
          <div class={windowInplaceControls} data-editor-controls>
            {#if actions}
              {@render actions()}
            {/if}
            <button
              type="button"
              data-window-inplace-minimize=""
              data-pip-minimize=""
              aria-label={minimized ? `Expand ${title}` : `Minimize ${title}`}
              title={minimized ? `Expand ${title}` : `Minimize ${title}`}
              class={windowInplaceControlButton}
              onclick={handleToggleMinimize}
            >
              {#if minimized}
                <Maximize2 class="size-3" />
              {:else}
                <Minus class="size-3" />
              {/if}
            </button>
            {#if onfullscreen}
              <button
                type="button"
                data-window-inplace-fullscreen=""
                data-pip-fullscreen=""
                aria-label={`Fullscreen ${title}`}
                title={`Fullscreen ${title}`}
                class={windowInplaceControlButton}
                onclick={handleFullscreen}
              >
                <Minimize2 class="size-3 rotate-45" />
              </button>
            {/if}
          </div>
        </div>
      {/if}

      {#if !minimized}
        <div data-window-inplace-body="" data-pip-body="" class={windowInplaceBody}>
          {@render children()}
        </div>
      {/if}
    </div>
  </Portal>
{/if}
