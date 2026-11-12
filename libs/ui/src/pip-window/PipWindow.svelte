<script lang="ts">
  import { Portal } from '@ark-ui/svelte/portal'
  import { cn } from '@cloudvoyant/helical-ui'
  import { setPipWindowContext } from './PipWindowContext.svelte'
  import { pipWindowVariants } from './styles'
  import type { PipWindowProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    title = 'Preview',
    open = true,
    scope = 'container',
    boundaryEl = null,
    placement = 'top-right',
    minimized = $bindable(false),
    draggable = false,
    resizable = false,
    onminimizechange,
    onfullscreen,
    children,
    class: className,
  }: PipWindowProps = $props()

  // State ---------------------------------------------------------------------
  let rootEl = $state<HTMLDivElement | null>(null)
  let dragOffset = $state<{ x: number; y: number }>({ x: 0, y: 0 })
  let isDragging = $state(false)
  let dragStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }

  setPipWindowContext({
    get title() {
      return title
    },
    get minimized() {
      return minimized
    },
    get draggable() {
      return draggable
    },
    get hasFullscreen() {
      return Boolean(onfullscreen)
    },
    toggleMinimize: handleToggleMinimize,
    triggerFullscreen: handleFullscreen,
    onHeaderPointerDown: handleHeaderPointerDown,
    onHeaderPointerMove: handleHeaderPointerMove,
    onHeaderPointerUp: handleHeaderPointerUp,
  })

  // Derived -------------------------------------------------------------------
  const rootClass = $derived(
    cn(
      pipWindowVariants({ scope, placement, minimized }),
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
      data-pip-window=""
      data-pip-scope={scope}
      data-pip-placement={placement}
      data-pip-minimized={minimized ? 'true' : 'false'}
      data-modal-ignore-pointer=""
      class={rootClass}
      style={transformStyle}
    >
      {@render children?.()}
    </div>
  </Portal>
{/if}
