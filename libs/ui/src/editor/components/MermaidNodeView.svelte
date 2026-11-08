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
  import {
    Splitter,
    SplitterPanel,
    SplitterResizeTrigger,
    useKeymap,
  } from '@cloudvoyant/helical-svelte'
  import {
    Check,
    Copy,
    GitFork,
    Maximize2,
    Minimize2,
    Minus,
    Pencil,
    Plus,
    RotateCcw,
  } from 'lucide-svelte'
  import PipWindow from '../../pip-window/PipWindow.svelte'
  import {
    codeContent,
    mermaidCodeContainer,
    mermaidErrorBanner,
    mermaidFullscreenOverlay,
    mermaidHeader,
    mermaidRootVariants,
    mermaidSplitCodePane,
    mermaidSplitPreviewPane,
    mermaidSplitTextarea,
    mermaidTitle,
    mermaidToolbar,
    mermaidToolbarButton,
    mermaidViewerCanvas,
    mermaidZoomBadge,
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
  let splitTextareaEl = $state<HTMLTextAreaElement | null>(null)
  let splitPreviewEl = $state<HTMLDivElement | null>(null)

  let svgMarkup = $state('')
  let lastValidSvg = $state('')
  let renderError = $state<string | null>(null)
  let isRendering = $state(false)

  let scale = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  let isFullscreen = $state(false)
  let pipMinimized = $state(false)
  let splitFocusPane = $state<'code' | 'preview'>('code')
  let pendingWindowPrefix = false
  let copied = $state(false)
  let isPointerPanning = $state(false)
  let pointerPanStart = { clientX: 0, clientY: 0, startX: 0, startY: 0 }
  let renderSeq = 0

  // Derived -------------------------------------------------------------------
  const sourceCode = $derived(node.textContent)
  const isCodeMode = $derived(mode === 'insert' || mode === 'select')
  const zoomPercent = $derived(`${Math.round(scale * 100)}%`)
  const displaySvg = $derived(svgMarkup || lastValidSvg)
  const canvasTransformStyle = $derived(
    `transform: translate3d(${panX}px, ${panY}px, 0) scale(${scale}); transform-origin: center center;`,
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
      Escape: {
        key: 'Escape',
        label: 'Minimize Mermaid Fullscreen',
        mode: ['normal', 'select', 'insert'],
        hidden: true,
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
        when: () => isCodeMode,
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

  function handleZoomInClick(event: MouseEvent) {
    event.stopPropagation()
    zoomBy(ZOOM_STEP)
  }

  function handleZoomOutClick(event: MouseEvent) {
    event.stopPropagation()
    zoomBy(-ZOOM_STEP)
  }

  function handleZoomResetClick(event: MouseEvent) {
    event.stopPropagation()
    resetViewport()
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
        const pos = getPos?.()
        if (typeof pos === 'number') {
          editor.focus(pos + 1)
        }
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
      splitTextareaEl?.focus()
    } else {
      splitPreviewEl?.focus()
    }
  }

  function focusSplitPane(pane: 'code' | 'preview'): boolean {
    splitFocusPane = pane
    void tick().then(() => {
      if (pane === 'code') {
        splitTextareaEl?.focus()
      } else {
        splitPreviewEl?.focus()
      }
    })
    return true
  }

  function handleSplitCodeInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement
    const pos = getPos?.()
    if (typeof pos === 'number') {
      editor.updateMermaidSource(pos, target.value)
    }
  }

  function handleCodePaneFocus() {
    splitFocusPane = 'code'
  }

  function handlePreviewPaneFocus() {
    splitFocusPane = 'preview'
  }

  function handleSplitWindowPrefix(event: KeyboardEvent): boolean {
    if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
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

  function handleSplitTextareaKeyDown(event: KeyboardEvent) {
    if (handleSplitWindowPrefix(event)) return
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      focusSplitPane('preview')
      return
    }
    if (handleCtrlViewportShortcut(event)) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeFullscreen()
    }
  }

  function handlePreviewKeyDown(event: KeyboardEvent) {
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
      if (event.key === 'Escape' || (!isCodeMode && (event.key === 'f' || event.key === 'q'))) {
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

  function handleCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select')) return
    isPointerPanning = true
    pointerPanStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: panX,
      startY: panY,
    }
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  }

  function handleCanvasPointerMove(event: PointerEvent) {
    if (!isPointerPanning) return
    panX = pointerPanStart.startX + (event.clientX - pointerPanStart.clientX)
    panY = pointerPanStart.startY + (event.clientY - pointerPanStart.clientY)
    syncDatasetState()
  }

  function handleCanvasPointerUp(event: PointerEvent) {
    if (!isPointerPanning) return
    isPointerPanning = false
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  }

  function portalToEditorRegion(overlayEl: HTMLElement) {
    const region =
      wrapperEl?.closest<HTMLElement>('[role="region"]') ??
      wrapperEl?.closest<HTMLElement>('.editor-container')
    if (!region) return {}
    const previousOverflow = region.style.overflow
    const previousPosition = region.style.position
    if (getComputedStyle(region).position === 'static') {
      region.style.position = 'relative'
    }
    overlayEl.style.top = `${region.scrollTop}px`
    overlayEl.style.left = '0px'
    overlayEl.style.width = '100%'
    overlayEl.style.height = '100%'
    region.style.overflow = 'hidden'
    region.appendChild(overlayEl)

    return {
      destroy() {
        region.style.overflow = previousOverflow
        region.style.position = previousPosition
        if (overlayEl.parentNode === region) {
          region.removeChild(overlayEl)
        }
      },
    }
  }
</script>

<div
  bind:this={wrapperEl}
  data-node-view-wrapper=""
  data-mermaid-node=""
  data-mermaid-mode={mode}
  data-mermaid-scale={scale}
  data-mermaid-pan-x={panX}
  data-mermaid-pan-y={panY}
  data-mermaid-fullscreen={isFullscreen ? 'true' : 'false'}
  role="none"
  style="white-space: normal;"
  class={mermaidRootVariants({ mode })}
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
          data-mermaid-zoom-out=""
          aria-label="Zoom out diagram"
          title="Zoom out (- / Ctrl+-)"
          class={mermaidToolbarButton}
          onclick={handleZoomOutClick}
        >
          <Minus class="size-3.5" />
        </button>
        <span data-mermaid-zoom-percent="" data-mermaid-zoom-badge="" class={mermaidZoomBadge}
          >{zoomPercent}</span
        >
        <button
          type="button"
          data-mermaid-zoom-in=""
          aria-label="Zoom in diagram"
          title="Zoom in (+ / Ctrl+=)"
          class={mermaidToolbarButton}
          onclick={handleZoomInClick}
        >
          <Plus class="size-3.5" />
        </button>
        <button
          type="button"
          data-mermaid-zoom-reset=""
          aria-label="Reset diagram zoom"
          title="Reset zoom and pan (0 / Ctrl+0)"
          class={mermaidToolbarButton}
          onclick={handleZoomResetClick}
        >
          <RotateCcw class="size-3.5" />
        </button>
        <button
          type="button"
          data-mermaid-edit=""
          aria-label="Edit Mermaid diagram"
          title="Edit Mermaid diagram (Enter / i)"
          class={mermaidToolbarButton}
          onclick={handleEditClick}
        >
          <Pencil class="size-3.5" />
          <span>Edit</span>
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
        aria-label={isFullscreen ? 'Minimize Mermaid diagram' : 'Fullscreen Mermaid diagram'}
        title={isFullscreen ? 'Minimize (Esc)' : 'Fullscreen (f / Mod+Enter)'}
        class={mermaidToolbarButton}
        onclick={handleToggleFullscreenClick}
      >
        {#if isFullscreen}
          <Minimize2 class="size-3.5" />
          <span>Minimize</span>
        {:else}
          <Maximize2 class="size-3.5" />
          <span>Fullscreen</span>
        {/if}
      </button>
    </div>
  </div>

  {#if !isCodeMode}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      contenteditable={false}
      data-mermaid-viewer=""
      data-mermaid-viewport=""
      data-modal-ignore-pointer=""
      class={cn(mermaidViewerCanvas, 'cursor-grab active:cursor-grabbing')}
      onpointerdown={handleCanvasPointerDown}
      onpointermove={handleCanvasPointerMove}
      onpointerup={handleCanvasPointerUp}
    >
      {#if displaySvg}
        <div
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
      {#if renderError}
        <div data-mermaid-error="" class={cn(mermaidErrorBanner, 'absolute right-3 bottom-3')}>
          {renderError}
        </div>
      {/if}
    </div>
  {/if}

  <div
    data-mermaid-code=""
    class={cn(codeBlockBodyBase, isCodeMode ? mermaidCodeContainer : 'sr-only')}
  >
    <pre class={cn(codeBlockContentBase, codeContent)}><code
        data-node-view-content=""
        class={node.textContent.length === 0 ? 'block' : undefined}
        style="white-space: pre-wrap;"></code></pre>

    {#if isCodeMode}
      <PipWindow
        title="Preview"
        scope="container"
        placement="bottom-right"
        bind:minimized={pipMinimized}
        draggable={true}
        boundaryEl={wrapperEl}
        onfullscreen={openFullscreen}
      >
        {#snippet actions()}
          <button
            type="button"
            data-pip-zoom-out=""
            aria-label="Zoom out preview"
            class={mermaidToolbarButton}
            onclick={handleZoomOutClick}
          >
            <Minus class="size-3" />
          </button>
          <span data-pip-zoom-percent="" data-mermaid-zoom-badge="" class={mermaidZoomBadge}
            >{zoomPercent}</span
          >
          <button
            type="button"
            data-pip-zoom-in=""
            aria-label="Zoom in preview"
            class={mermaidToolbarButton}
            onclick={handleZoomInClick}
          >
            <Plus class="size-3" />
          </button>
          <button
            type="button"
            data-pip-zoom-reset=""
            aria-label="Reset preview zoom"
            title="Reset zoom & pan"
            class={mermaidToolbarButton}
            onclick={handleZoomResetClick}
          >
            <RotateCcw class="size-3" />
          </button>
        {/snippet}

        <div
          data-pip-diagram=""
          data-mermaid-canvas=""
          class={cn(mermaidSvgBase, 'max-h-40 w-full transition-transform duration-75')}
          style={canvasTransformStyle}
        >
          {#if displaySvg}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html displaySvg}
          {:else}
            <span class="text-xs text-muted-foreground">Empty diagram</span>
          {/if}
        </div>
      </PipWindow>
    {/if}
  </div>

  {#if isFullscreen}
    <div
      use:portalToEditorRegion
      role="dialog"
      aria-modal="false"
      aria-label={isCodeMode ? 'Mermaid Fullscreen Split-Pane Editor' : 'Mermaid Fullscreen Viewer'}
      contenteditable={false}
      data-mermaid-fullscreen-surface=""
      data-mermaid-fullscreen-mode={isCodeMode ? 'split' : 'viewer'}
      data-modal-ignore-pointer=""
      class={mermaidFullscreenOverlay}
    >
      <div class={mermaidHeader} data-editor-controls>
        <span class={mermaidTitle}>
          <GitFork class="size-3.5" />
          <span>{isCodeMode ? 'Mermaid — Split View' : 'Mermaid — Fullscreen Viewer'}</span>
        </span>

        <div class={mermaidToolbar}>
          <button
            type="button"
            data-mermaid-fullscreen-zoom-out=""
            aria-label="Zoom out diagram"
            title="Zoom out (- / Ctrl+-)"
            class={mermaidToolbarButton}
            onclick={handleZoomOutClick}
          >
            <Minus class="size-3.5" />
          </button>
          <span
            data-mermaid-fullscreen-zoom-percent=""
            data-mermaid-zoom-badge=""
            class={mermaidZoomBadge}>{zoomPercent}</span
          >
          <button
            type="button"
            data-mermaid-fullscreen-zoom-in=""
            aria-label="Zoom in diagram"
            title="Zoom in (+ / Ctrl+=)"
            class={mermaidToolbarButton}
            onclick={handleZoomInClick}
          >
            <Plus class="size-3.5" />
          </button>
          <button
            type="button"
            data-mermaid-fullscreen-zoom-reset=""
            aria-label="Reset diagram zoom"
            title="Reset zoom and pan (0 / Ctrl+0)"
            class={mermaidToolbarButton}
            onclick={handleZoomResetClick}
          >
            <RotateCcw class="size-3.5" />
          </button>

          {#if !isCodeMode}
            <button
              type="button"
              data-mermaid-fullscreen-edit=""
              aria-label="Edit Mermaid diagram"
              title="Edit Mermaid diagram (Enter / i)"
              class={mermaidToolbarButton}
              onclick={handleEditClick}
            >
              <Pencil class="size-3.5" />
              <span>Edit</span>
            </button>
          {/if}

          <button
            type="button"
            data-mermaid-minimize=""
            aria-label="Minimize Mermaid diagram"
            title="Minimize (Esc)"
            class={mermaidToolbarButton}
            onclick={handleToggleFullscreenClick}
          >
            <Minimize2 class="size-3.5" />
            <span>Minimize</span>
          </button>
        </div>
      </div>

      {#if isCodeMode}
        <Splitter
          panels={[
            { id: 'code', minSize: 20 },
            { id: 'preview', minSize: 20 },
          ]}
          defaultSize={[50, 50]}
          class="min-h-0 flex-1"
        >
          <SplitterPanel id="code" paneDisabled={true} class="h-full min-h-0">
            <div
              data-mermaid-split-pane="code"
              data-pane-focused={splitFocusPane === 'code' ? 'true' : 'false'}
              class={mermaidSplitCodePane}
            >
              <textarea
                bind:this={splitTextareaEl}
                data-mermaid-split-code=""
                aria-label="Mermaid source code"
                value={sourceCode}
                class={mermaidSplitTextarea}
                onfocus={handleCodePaneFocus}
                oninput={handleSplitCodeInput}
                onkeydown={handleSplitTextareaKeyDown}
              ></textarea>
            </div>
          </SplitterPanel>

          <SplitterResizeTrigger id="code:preview" />

          <SplitterPanel id="preview" paneDisabled={true} class="h-full min-h-0">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              bind:this={splitPreviewEl}
              tabindex="0"
              role="region"
              aria-label="Mermaid diagram preview"
              data-mermaid-split-pane="preview"
              data-mermaid-split-preview=""
              data-pane-focused={splitFocusPane === 'preview' ? 'true' : 'false'}
              class={cn(mermaidSplitPreviewPane, 'cursor-grab active:cursor-grabbing')}
              onfocus={handlePreviewPaneFocus}
              onkeydown={handlePreviewKeyDown}
              onpointerdown={handleCanvasPointerDown}
              onpointermove={handleCanvasPointerMove}
              onpointerup={handleCanvasPointerUp}
            >
              {#if displaySvg}
                <div
                  data-mermaid-fullscreen-canvas=""
                  data-mermaid-canvas=""
                  class={cn(mermaidSvgBase, 'transition-transform duration-75')}
                  style={canvasTransformStyle}
                >
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html displaySvg}
                </div>
              {/if}
              {#if renderError}
                <div
                  data-mermaid-error=""
                  class={cn(mermaidErrorBanner, 'absolute right-4 bottom-4')}
                >
                  {renderError}
                </div>
              {/if}
            </div>
          </SplitterPanel>
        </Splitter>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={splitPreviewEl}
          tabindex="0"
          role="region"
          aria-label="Mermaid fullscreen diagram canvas"
          data-mermaid-fullscreen-viewer=""
          class={cn(mermaidSplitPreviewPane, 'flex-1 cursor-grab active:cursor-grabbing')}
          onkeydown={handlePreviewKeyDown}
          onpointerdown={handleCanvasPointerDown}
          onpointermove={handleCanvasPointerMove}
          onpointerup={handleCanvasPointerUp}
        >
          {#if displaySvg}
            <div
              data-mermaid-fullscreen-canvas=""
              data-mermaid-canvas=""
              class={cn(mermaidSvgBase, 'transition-transform duration-75')}
              style={canvasTransformStyle}
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html displaySvg}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
