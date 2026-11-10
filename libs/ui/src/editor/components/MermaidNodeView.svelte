<script lang="ts">
  import { tick, untrack } from 'svelte'
  import {
    cn,
    codeBlockBodyBase,
    codeBlockContentBase,
    mermaidLoadingBase,
    mermaidSvgBase,
    renderMermaidSource,
  } from '@cloudvoyant/helical-ui'
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import { Check, Copy, GitFork, Maximize2, Minimize2, Pencil } from 'lucide-svelte'
  import PipWindow from '../../pip-window/PipWindow.svelte'
  import {
    codeContent,
    mermaidCodeContainer,
    mermaidErrorFooter,
    mermaidFullscreenOverlay,
    mermaidHeader,
    mermaidPipSvgFit,
    mermaidRootVariants,
    mermaidSplitCodePane,
    mermaidSplitPreviewPane,
    mermaidTitle,
    mermaidToolbar,
    mermaidToolbarButton,
    mermaidViewerCanvas,
  } from './styles'
  import type { MermaidNodeViewProps } from './types'

  // Props ---------------------------------------------------------------------
  let { editor, node, mode, getPos }: MermaidNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const PAN_STEP = 48
  const ZOOM_STEP = 0.25
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4.0

  let wrapperEl = $state<HTMLDivElement | null>(null)
  let splitPreviewEl = $state<HTMLDivElement | null>(null)

  let svgMarkup = $state('')
  let lastValidSvg = $state('')
  let renderError = $state<string | null>(null)
  let isRendering = $state(false)

  let scale = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  let isFullscreen = $state(false)
  let fullscreenRect = $state<{ top: number; left: number; width: number; height: number } | null>(
    null,
  )
  let splitFocusPane = $state<'code' | 'preview'>('code')
  let pendingWindowPrefix = false
  let copied = $state(false)
  let isPointerPanning = $state(false)
  let pointerPanStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }
  let activePointers = new Map<number, { clientX: number; clientY: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = 1
  let renderSeq = 0

  // Derived -------------------------------------------------------------------
  const sourceCode = $derived(node.textContent)
  const isCodeMode = $derived(mode === 'insert' || mode === 'select')
  const displaySvg = $derived(svgMarkup || lastValidSvg)
  const canvasTransformStyle = $derived(
    `transform: translate3d(${panX}px, ${panY}px, 0) scale(${scale}); transform-origin: center center;`,
  )
  const wrapperStyle = $derived(
    isFullscreen && fullscreenRect
      ? `white-space: normal; top: ${fullscreenRect.top}px; left: ${fullscreenRect.left}px; width: ${fullscreenRect.width}px; height: ${fullscreenRect.height}px;`
      : 'white-space: normal;',
  )

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const code = sourceCode.trim()
    if (!code) {
      svgMarkup = ''
      renderError = null
      return
    }
    const delay = untrack(() => (isCodeMode && lastValidSvg ? 120 : 0))
    const timer = setTimeout(() => {
      void renderDiagram(code)
    }, delay)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    const hostEl = wrapperEl?.closest<HTMLElement>('.node-mermaid') ?? wrapperEl
    if (!hostEl) return
    const onViewportEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          state?: { scale: number; panX: number; panY: number; fullscreen: boolean }
        }>
      ).detail
      if (!detail?.state) return
      scale = detail.state.scale
      panX = detail.state.panX
      panY = detail.state.panY
      if (detail.state.fullscreen !== isFullscreen) {
        isFullscreen = detail.state.fullscreen
        if (isFullscreen) {
          void focusInitialFullscreenSurface()
        }
      }
    }
    hostEl.addEventListener('htmd:mermaid-viewport', onViewportEvent)
    return () => hostEl.removeEventListener('htmd:mermaid-viewport', onViewportEvent)
  })

  $effect(() => {
    if (!isFullscreen || !wrapperEl) {
      fullscreenRect = null
      return
    }
    const region =
      wrapperEl.closest<HTMLElement>('[role="region"]') ??
      wrapperEl.closest<HTMLElement>('.editor-container')
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

  $effect(() => {
    const codeMode = isCodeMode
    const fullscreen = isFullscreen
    if (!fullscreen) return
    void tick().then(() => {
      if (codeMode) {
        splitFocusPane = 'code'
        focusCodeEditor()
      } else {
        splitPreviewEl?.focus()
      }
    })
  })

  $effect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
    const observer = new MutationObserver(() => {
      const code = sourceCode.trim()
      if (code) void renderDiagram(code)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  })

  useKeymap(
    () => ({
      'Control+h': {
        key: 'Control+h',
        label: 'Pan Mermaid Left',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => panBy(-PAN_STEP, 0),
      },
      'Control+j': {
        key: 'Control+j',
        label: 'Pan Mermaid Down',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => panBy(0, PAN_STEP),
      },
      'Control+k': {
        key: 'Control+k',
        label: 'Pan Mermaid Up',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => panBy(0, -PAN_STEP),
      },
      'Control+l': {
        key: 'Control+l',
        label: 'Pan Mermaid Right',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => panBy(PAN_STEP, 0),
      },
      'Control+=': {
        key: 'Control+=',
        label: 'Zoom In Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => zoomBy(ZOOM_STEP),
      },
      'Control++': {
        key: 'Control++',
        label: 'Zoom In Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => zoomBy(ZOOM_STEP),
      },
      'Control+-': {
        key: 'Control+-',
        label: 'Zoom Out Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => zoomBy(-ZOOM_STEP),
      },
      'Control+0': {
        key: 'Control+0',
        label: 'Reset Mermaid Zoom',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => resetViewport(),
      },
      'Mod+Enter': {
        key: 'Mod+Enter',
        label: 'Minimize Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => closeFullscreen(),
      },
      'Control+Shift+f': {
        key: 'Control+Shift+f',
        label: 'Minimize Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => closeFullscreen(),
      },
      'Control+Shift+F': {
        key: 'Control+Shift+F',
        label: 'Minimize Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => closeFullscreen(),
      },
      Tab: {
        key: 'Tab',
        label: 'Toggle Mermaid Split Pane Focus',
        mode: ['select', 'insert'],
        hidden: true,
        when: () => isCodeMode,
        action: () => focusSplitPane(splitFocusPane === 'code' ? 'preview' : 'code'),
      },
      Escape: {
        key: 'Escape',
        label: 'Minimize Mermaid Fullscreen',
        mode: 'normal',
        hidden: true,
        when: () => !isCodeMode,
        action: () => closeFullscreen(),
      },
      f: {
        key: 'f',
        label: 'Minimize Mermaid Fullscreen',
        mode: 'normal',
        hidden: true,
        when: () => !isCodeMode,
        action: () => closeFullscreen(),
      },
      q: {
        key: 'q',
        label: 'Minimize Mermaid Fullscreen',
        mode: 'normal',
        hidden: true,
        when: () => !isCodeMode,
        action: () => closeFullscreen(),
      },
      Enter: {
        key: 'Enter',
        label: 'Edit Mermaid Diagram',
        mode: 'normal',
        hidden: true,
        when: () => !isCodeMode,
        action: () => enterEditMode(),
      },
      i: {
        key: 'i',
        label: 'Edit Mermaid Code',
        mode: ['normal', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => {
          if (!isCodeMode) return enterEditMode()
          return focusSplitPane('code')
        },
      },
      h: {
        key: 'h',
        label: 'Pan Mermaid Left',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => pendingWindowPrefix || !isCodeMode || splitFocusPane === 'preview',
        action: () => {
          if (pendingWindowPrefix) {
            pendingWindowPrefix = false
            return focusSplitPane('code')
          }
          return panBy(-PAN_STEP, 0)
        },
      },
      j: {
        key: 'j',
        label: 'Pan Mermaid Down',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => panBy(0, PAN_STEP),
      },
      k: {
        key: 'k',
        label: 'Pan Mermaid Up',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => panBy(0, -PAN_STEP),
      },
      l: {
        key: 'l',
        label: 'Pan Mermaid Right',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => pendingWindowPrefix || !isCodeMode || splitFocusPane === 'preview',
        action: () => {
          if (pendingWindowPrefix) {
            pendingWindowPrefix = false
            return focusSplitPane('preview')
          }
          return panBy(PAN_STEP, 0)
        },
      },
      w: {
        key: 'w',
        label: 'Cycle Mermaid Split Pane',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => pendingWindowPrefix,
        action: () => {
          pendingWindowPrefix = false
          return focusSplitPane(splitFocusPane === 'code' ? 'preview' : 'code')
        },
      },
      z: {
        key: 'z',
        label: 'Minimize Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => pendingWindowPrefix,
        action: () => {
          pendingWindowPrefix = false
          return closeFullscreen()
        },
      },
      '+': {
        key: '+',
        label: 'Zoom In Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => zoomBy(ZOOM_STEP),
      },
      '=': {
        key: '=',
        label: 'Zoom In Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => zoomBy(ZOOM_STEP),
      },
      '-': {
        key: '-',
        label: 'Zoom Out Mermaid',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => zoomBy(-ZOOM_STEP),
      },
      '0': {
        key: '0',
        label: 'Reset Mermaid Zoom',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        when: () => !isCodeMode || splitFocusPane === 'preview',
        action: () => resetViewport(),
      },
      'Control+w': {
        key: 'Control+w',
        label: '+window',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
        action: () => {
          pendingWindowPrefix = true
          return true
        },
      },
    }),
    {
      priority: 'overlay',
      enabled: () => isFullscreen,
    },
  )

  // Methods -------------------------------------------------------------------
  async function renderDiagram(code: string) {
    const seq = ++renderSeq
    isRendering = true
    try {
      const rendered = await renderMermaidSource(code)
      if (seq !== renderSeq) return
      svgMarkup = rendered
      lastValidSvg = rendered
      renderError = null
    } catch (err) {
      if (seq !== renderSeq) return
      renderError = err instanceof Error ? err.message : 'Invalid Mermaid syntax'
    } finally {
      if (seq === renderSeq) {
        isRendering = false
      }
    }
  }

  function syncDatasetState() {
    const hostEl = wrapperEl?.closest<HTMLElement>('.node-mermaid') ?? wrapperEl
    if (!hostEl) return
    hostEl.dataset.mermaidScale = String(scale)
    hostEl.dataset.mermaidPanX = String(panX)
    hostEl.dataset.mermaidPanY = String(panY)
    hostEl.dataset.mermaidFullscreen = String(isFullscreen)
  }

  function zoomBy(delta: number): boolean {
    scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((scale + delta) * 100) / 100))
    syncDatasetState()
    return true
  }

  function panBy(dx: number, dy: number): boolean {
    panX += dx
    panY += dy
    syncDatasetState()
    return true
  }

  function resetViewport(): boolean {
    scale = 1
    panX = 0
    panY = 0
    syncDatasetState()
    return true
  }

  function focusCodeEditor() {
    const pos = getPos?.()
    if (typeof pos === 'number') {
      editor.focus(pos + 1)
    }
  }

  function openFullscreen(): boolean {
    isFullscreen = true
    syncDatasetState()
    void focusInitialFullscreenSurface()
    return true
  }

  function closeFullscreen(): boolean {
    if (!isFullscreen) return false
    isFullscreen = false
    syncDatasetState()
    void tick().then(() => {
      if (isCodeMode) {
        focusCodeEditor()
      } else {
        const region = wrapperEl?.closest<HTMLElement>('[role="region"]')
        region?.focus({ preventScroll: true })
      }
    })
    return true
  }

  function handleToggleFullscreenClick(event: MouseEvent) {
    event.stopPropagation()
    if (isFullscreen) {
      closeFullscreen()
    } else {
      openFullscreen()
    }
  }

  function enterEditMode(): boolean {
    const pos = getPos?.()
    const entered = editor.enterCompoundBlock()
    if (!entered) {
      editor.setEditable(true)
      if (typeof pos === 'number') {
        editor.focus(pos + 1)
      }
    }
    if (isFullscreen) {
      void focusSplitPane('code')
    }
    return true
  }

  function handleEditClick(event: MouseEvent) {
    event.stopPropagation()
    enterEditMode()
  }

  async function focusInitialFullscreenSurface() {
    await tick()
    if (isCodeMode) {
      splitFocusPane = 'code'
      focusCodeEditor()
    } else {
      splitPreviewEl?.focus()
    }
  }

  function focusSplitPane(pane: 'code' | 'preview'): boolean {
    splitFocusPane = pane
    void tick().then(() => {
      if (pane === 'code') {
        focusCodeEditor()
      } else {
        splitPreviewEl?.focus()
      }
    })
    return true
  }

  function handleCodePaneFocus() {
    splitFocusPane = 'code'
  }

  function handlePreviewPaneFocus() {
    splitFocusPane = 'preview'
  }

  function handleSplitWindowPrefix(event: KeyboardEvent): boolean {
    if (
      event.key === 'Control' ||
      event.key === 'Shift' ||
      event.key === 'Alt' ||
      event.key === 'Meta'
    ) {
      return false
    }
    if (pendingWindowPrefix) {
      pendingWindowPrefix = false
      if (event.key === 'l' || event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        focusSplitPane('preview')
        return true
      }
      if (event.key === 'h' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        focusSplitPane('code')
        return true
      }
      if (event.key === 'w') {
        event.preventDefault()
        event.stopPropagation()
        focusSplitPane(splitFocusPane === 'code' ? 'preview' : 'code')
        return true
      }
      if (event.key === 'z') {
        event.preventDefault()
        event.stopPropagation()
        closeFullscreen()
        return true
      }
      return false
    }
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'w') {
      event.preventDefault()
      event.stopPropagation()
      pendingWindowPrefix = true
      return true
    }
    return false
  }

  function handleCtrlViewportShortcut(event: KeyboardEvent): boolean {
    if (!event.ctrlKey || event.altKey || event.metaKey) return false
    if (event.key === 'h') {
      event.preventDefault()
      event.stopPropagation()
      panBy(-PAN_STEP, 0)
      return true
    }
    if (event.key === 'j') {
      event.preventDefault()
      event.stopPropagation()
      panBy(0, PAN_STEP)
      return true
    }
    if (event.key === 'k') {
      event.preventDefault()
      event.stopPropagation()
      panBy(0, -PAN_STEP)
      return true
    }
    if (event.key === 'l') {
      event.preventDefault()
      event.stopPropagation()
      panBy(PAN_STEP, 0)
      return true
    }
    if (event.key === '=' || event.key === '+') {
      event.preventDefault()
      event.stopPropagation()
      zoomBy(ZOOM_STEP)
      return true
    }
    if (event.key === '-') {
      event.preventDefault()
      event.stopPropagation()
      zoomBy(-ZOOM_STEP)
      return true
    }
    if (event.key === '0') {
      event.preventDefault()
      event.stopPropagation()
      resetViewport()
      return true
    }
    return false
  }

  function handlePreviewKeyDown(event: KeyboardEvent) {
    if (!isFullscreen) return
    if (handleSplitWindowPrefix(event)) return
    if (event.key === 'Tab') {
      if (isCodeMode) {
        event.preventDefault()
        event.stopPropagation()
        focusSplitPane('code')
      }
      return
    }
    if (handleCtrlViewportShortcut(event)) return
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'i' && isCodeMode) {
        event.preventDefault()
        event.stopPropagation()
        focusSplitPane('code')
        return
      }
      if (event.key === 'h' || event.key === 'H' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        panBy(-PAN_STEP, 0)
        return
      }
      if (event.key === 'j' || event.key === 'J' || event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        panBy(0, PAN_STEP)
        return
      }
      if (event.key === 'k' || event.key === 'K' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        panBy(0, -PAN_STEP)
        return
      }
      if (event.key === 'l' || event.key === 'L' || event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        panBy(PAN_STEP, 0)
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        event.stopPropagation()
        zoomBy(ZOOM_STEP)
        return
      }
      if (event.key === '-') {
        event.preventDefault()
        event.stopPropagation()
        zoomBy(-ZOOM_STEP)
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        event.stopPropagation()
        resetViewport()
        return
      }
      if (!isCodeMode && (event.key === 'Escape' || event.key === 'f' || event.key === 'q')) {
        event.preventDefault()
        event.stopPropagation()
        closeFullscreen()
      }
    }
  }

  function handleCopyClick(event: MouseEvent) {
    event.stopPropagation()
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(sourceCode).then(() => {
        copied = true
        setTimeout(() => {
          copied = false
        }, 1500)
      })
    }
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
      syncDatasetState()
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
        syncDatasetState()
      }
      return
    }
    if (!isPointerPanning) return
    panX = pointerPanStart.startX + (event.clientX - pointerPanStart.clientX)
    panY = pointerPanStart.startY + (event.clientY - pointerPanStart.clientY)
    syncDatasetState()
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

<div
  bind:this={wrapperEl}
  data-node-view-wrapper=""
  data-code-block=""
  data-mermaid-node=""
  data-mermaid-mode={mode}
  data-mermaid-scale={scale}
  data-mermaid-pan-x={panX}
  data-mermaid-pan-y={panY}
  data-mermaid-fullscreen={isFullscreen ? 'true' : 'false'}
  data-mermaid-fullscreen-surface={isFullscreen ? '' : undefined}
  data-mermaid-fullscreen-mode={isFullscreen ? (isCodeMode ? 'split' : 'viewer') : undefined}
  role="none"
  style={wrapperStyle}
  class={cn(mermaidRootVariants({ mode }), isFullscreen ? mermaidFullscreenOverlay : undefined)}
>
  <div contenteditable={false} class={mermaidHeader} data-editor-controls>
    <span class={mermaidTitle}>
      <GitFork class="size-3.5" />
      <span>Mermaid</span>
    </span>

    <div class={mermaidToolbar}>
      {#if !isCodeMode}
        <button
          type="button"
          data-mermaid-edit=""
          data-mermaid-fullscreen-edit={isFullscreen ? '' : undefined}
          aria-label="Edit Mermaid diagram"
          title="Edit Mermaid diagram (Enter / i)"
          class={mermaidToolbarButton}
          onclick={handleEditClick}
        >
          <Pencil class="size-3.5" />
        </button>
      {:else}
        <button
          type="button"
          data-mermaid-copy=""
          aria-label="Copy Mermaid source"
          title="Copy Mermaid source"
          class={mermaidToolbarButton}
          onclick={handleCopyClick}
        >
          {#if copied}
            <Check class="size-3.5" />
          {:else}
            <Copy class="size-3.5" />
          {/if}
        </button>
      {/if}

      <button
        type="button"
        data-mermaid-fullscreen=""
        data-mermaid-minimize={isFullscreen ? '' : undefined}
        aria-label={isFullscreen ? 'Minimize Mermaid diagram' : 'Fullscreen Mermaid diagram'}
        title={isFullscreen ? 'Minimize (Esc)' : 'Fullscreen (f / Mod+Enter)'}
        class={mermaidToolbarButton}
        onclick={handleToggleFullscreenClick}
      >
        {#if isFullscreen}
          <Minimize2 class="size-3.5" />
        {:else}
          <Maximize2 class="size-3.5" />
        {/if}
      </button>
    </div>
  </div>

  <div
    data-mermaid-body=""
    class={cn('relative flex min-h-0 w-full flex-1', isFullscreen && isCodeMode ? 'flex-row' : 'flex-col')}
  >
    <div
      data-mermaid-code=""
      data-mermaid-split-pane={isFullscreen && isCodeMode ? 'code' : undefined}
      data-mermaid-split-code={isFullscreen && isCodeMode ? '' : undefined}
      data-pane-focused={isFullscreen && isCodeMode ? (splitFocusPane === 'code' ? 'true' : 'false') : undefined}
      onfocusin={handleCodePaneFocus}
      class={cn(
        codeBlockBodyBase,
        !isCodeMode
          ? 'sr-only'
          : isFullscreen
            ? mermaidSplitCodePane
            : mermaidCodeContainer,
      )}
    >
      <pre class={cn(codeBlockContentBase, codeContent, 'h-full min-h-64 w-full flex-1')}><code
          data-node-view-content=""
          class={node.textContent.length === 0 ? 'block' : undefined}
          style="white-space: pre-wrap;"></code></pre>

      {#if isCodeMode && !isFullscreen}
        <PipWindow
          title="Preview"
          scope="container"
          placement="top-right"
          showHeader={false}
          boundaryEl={wrapperEl}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            data-pip-diagram=""
            data-mermaid-viewport=""
            class="relative flex h-full w-full cursor-grab items-center justify-center overflow-hidden touch-none active:cursor-grabbing"
            onwheel={handleCanvasWheel}
            onpointerdown={handleCanvasPointerDown}
            onpointermove={handleCanvasPointerMove}
            onpointerup={handleCanvasPointerUp}
            onpointercancel={handleCanvasPointerUp}
          >
            <div
              data-mermaid-canvas=""
              class={cn(mermaidSvgBase, mermaidPipSvgFit, 'transition-transform duration-75')}
              style={canvasTransformStyle}
            >
              {#if displaySvg}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html displaySvg}
              {:else}
                <span class="text-xs text-muted-foreground">Empty diagram</span>
              {/if}
            </div>
          </div>
        </PipWindow>
      {/if}
    </div>

    {#if !isCodeMode || isFullscreen}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={splitPreviewEl}
        tabindex={isFullscreen ? 0 : -1}
        role="region"
        aria-label="Mermaid diagram preview"
        contenteditable={false}
        data-mermaid-viewer={!isFullscreen && !isCodeMode ? '' : undefined}
        data-mermaid-fullscreen-viewer={isFullscreen && !isCodeMode ? '' : undefined}
        data-mermaid-split-pane={isFullscreen && isCodeMode ? 'preview' : undefined}
        data-mermaid-split-preview={isFullscreen && isCodeMode ? '' : undefined}
        data-mermaid-viewport=""
        data-pane-focused={isFullscreen && isCodeMode ? (splitFocusPane === 'preview' ? 'true' : 'false') : undefined}
        data-modal-ignore-pointer=""
        class={cn(
          isFullscreen
            ? isCodeMode
              ? mermaidSplitPreviewPane
              : 'relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-card p-6 outline-none'
            : mermaidViewerCanvas,
          'cursor-grab touch-none active:cursor-grabbing',
        )}
        onfocus={handlePreviewPaneFocus}
        onkeydown={handlePreviewKeyDown}
        onwheel={handleCanvasWheel}
        onpointerdown={handleCanvasPointerDown}
        onpointermove={handleCanvasPointerMove}
        onpointerup={handleCanvasPointerUp}
        onpointercancel={handleCanvasPointerUp}
      >
        {#if displaySvg}
          <div
            data-mermaid-fullscreen-canvas={isFullscreen ? '' : undefined}
            data-mermaid-canvas=""
            class={cn(mermaidSvgBase, 'transition-transform duration-75')}
            style={canvasTransformStyle}
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html displaySvg}
          </div>
        {:else if isRendering}
          <div class={mermaidLoadingBase}>Rendering diagram...</div>
        {/if}
      </div>
    {/if}
  </div>

  {#if renderError}
    <div
      contenteditable={false}
      data-mermaid-error=""
      data-mermaid-footer=""
      class={cn(mermaidErrorFooter, isFullscreen ? 'rounded-b-none' : 'rounded-b-lg')}
    >
      {renderError}
    </div>
  {/if}
</div>
