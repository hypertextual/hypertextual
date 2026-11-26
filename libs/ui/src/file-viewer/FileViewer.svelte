<script lang="ts">
  import { ExternalLink, ImagePlus, Maximize2, Minimize2, X } from 'lucide-svelte'
  import { WindowInplace, WindowInplaceBody } from '../window-inplace'
  import DrawioXmlRenderer from './DrawioXmlRenderer.svelte'
  import ImageRenderer from './ImageRenderer.svelte'
  import { fileViewerStyles } from './styles'
  import type { FileViewerProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    kind,
    title,
    src = '',
    srcset,
    sizes,
    xml = '',
    alt = '',
    externalAppLabel = 'Open',
    replaceLabel,
    removeLabel,
    standalone = false,
    mode = 'normal',
    fullscreen = $bindable(false),
    scale = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    viewerScriptUrl = '/vendor/drawio/viewer-static.min.js',
    onopenexternal,
    onreplace,
    onremove,
    onviewportchange,
    onfocus,
    onkeydown,
    class: className,
  }: FileViewerProps = $props()

  // State ---------------------------------------------------------------------
  const PAN_STEP = 48
  const ZOOM_STEP = 0.25

  let windowInplace = $state<ReturnType<typeof WindowInplace> | null>(null)
  let imageRenderer = $state<ReturnType<typeof ImageRenderer> | null>(null)
  let xmlRenderer = $state<ReturnType<typeof DrawioXmlRenderer> | null>(null)

  // Derived -------------------------------------------------------------------
  const isDrawio = $derived(kind === 'drawio-image' || kind === 'drawio-xml')
  const resolvedReplaceLabel = $derived(replaceLabel ?? (isDrawio ? 'Replace diagram' : 'Replace image'))
  const resolvedRemoveLabel = $derived(removeLabel ?? (isDrawio ? 'Remove diagram' : 'Remove image'))
  const showInsertOverlay = $derived(!standalone && mode === 'insert')

  // Methods -------------------------------------------------------------------
  export function getElement(): HTMLElement | null {
    return windowInplace?.getElement() ?? null
  }

  export function focus() {
    if (kind === 'drawio-xml') {
      xmlRenderer?.focus()
    } else {
      imageRenderer?.focus()
    }
  }

  export function zoomBy(delta = ZOOM_STEP): boolean {
    return kind === 'drawio-xml'
      ? (xmlRenderer?.zoomBy(delta) ?? false)
      : (imageRenderer?.zoomBy(delta) ?? false)
  }

  export function panBy(dx = 0, dy = PAN_STEP): boolean {
    return kind === 'drawio-xml'
      ? (xmlRenderer?.panBy(dx, dy) ?? false)
      : (imageRenderer?.panBy(dx, dy) ?? false)
  }

  export function resetViewport(): boolean {
    return kind === 'drawio-xml'
      ? (xmlRenderer?.resetViewport() ?? false)
      : (imageRenderer?.resetViewport() ?? false)
  }

  function handleOpenExternalClick(event: MouseEvent) {
    event.stopPropagation()
    onopenexternal?.()
  }

  function handleReplaceClick(event: MouseEvent) {
    event.stopPropagation()
    onreplace?.()
  }

  function handleRemoveClick(event: MouseEvent) {
    event.stopPropagation()
    onremove?.()
  }

  function handleToggleFullscreenClick(event: MouseEvent) {
    event.stopPropagation()
    fullscreen = !fullscreen
  }

  function handleStandaloneKeyDown(event: KeyboardEvent) {
    onkeydown?.(event)
    if (event.defaultPrevented || !standalone) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'h' || event.key === 'H' || event.key === 'ArrowLeft') {
      event.preventDefault()
      panBy(-PAN_STEP, 0)
    } else if (event.key === 'j' || event.key === 'J' || event.key === 'ArrowDown') {
      event.preventDefault()
      panBy(0, PAN_STEP)
    } else if (event.key === 'k' || event.key === 'K' || event.key === 'ArrowUp') {
      event.preventDefault()
      panBy(0, -PAN_STEP)
    } else if (event.key === 'l' || event.key === 'L' || event.key === 'ArrowRight') {
      event.preventDefault()
      panBy(PAN_STEP, 0)
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(ZOOM_STEP)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomBy(-ZOOM_STEP)
    } else if (event.key === '0') {
      event.preventDefault()
      resetViewport()
    } else if (event.key === 'f') {
      event.preventDefault()
      fullscreen = !fullscreen
    } else if ((event.key === 'Escape' || event.key === 'q') && fullscreen) {
      event.preventDefault()
      fullscreen = false
    } else if (event.key === 'Enter' || event.key === 'i') {
      event.preventDefault()
      onopenexternal?.()
    }
  }
</script>

<WindowInplace
  bind:this={windowInplace}
  bind:fullscreen
  data-file-viewer=""
  data-file-viewer-kind={kind}
  data-drawio-scale={scale}
  data-drawio-pan-x={panX}
  data-drawio-pan-y={panY}
  data-drawio-fullscreen={fullscreen ? 'true' : 'false'}
  class={fileViewerStyles.rootVariants({ standalone, class: className })}
>
  <WindowInplaceBody class="relative flex-1">
    {#if kind === 'drawio-xml'}
      <DrawioXmlRenderer
        bind:this={xmlRenderer}
        {xml}
        {viewerScriptUrl}
        bind:scale
        bind:panX
        bind:panY
        tabindex={standalone || fullscreen ? 0 : -1}
        ariaLabel={`${title} preview`}
        {onviewportchange}
        {onfocus}
        onkeydown={handleStandaloneKeyDown}
        class={fullscreen || standalone
          ? fileViewerStyles.fullscreenCanvas
          : fileViewerStyles.drawioCanvas}
      />
    {:else}
      <ImageRenderer
        bind:this={imageRenderer}
        {src}
        {srcset}
        {sizes}
        alt={alt || title}
        isFullscreen={fullscreen || standalone}
        bind:scale
        bind:panX
        bind:panY
        tabindex={standalone || fullscreen ? 0 : -1}
        ariaLabel={`${title} preview`}
        {onviewportchange}
        {onfocus}
        onkeydown={handleStandaloneKeyDown}
        class={fullscreen || standalone
          ? fileViewerStyles.fullscreenCanvas
          : isDrawio
            ? fileViewerStyles.drawioCanvas
            : fileViewerStyles.canvas}
      />
    {/if}

    {#if !standalone}
      <button
        type="button"
        data-file-viewer-fullscreen=""
        onclick={handleToggleFullscreenClick}
        class={`${fileViewerStyles.floatingFullscreenButton} ${fullscreen || showInsertOverlay ? 'opacity-100' : 'opacity-0 group-hover/file-viewer:opacity-100 focus:opacity-100'}`}
        aria-label={fullscreen ? 'Minimize preview' : 'Maximize preview'}
        title={fullscreen ? 'Minimize preview' : 'Maximize preview'}
      >
        {#if fullscreen}
          <Minimize2 class="size-3.5" aria-hidden="true" />
        {:else}
          <Maximize2 class="size-3.5" aria-hidden="true" />
        {/if}
      </button>
    {/if}

    {#if showInsertOverlay}
      <div class={fileViewerStyles.insertOverlay} data-file-viewer-insert-overlay="">
        <div class={fileViewerStyles.insertActions} data-editor-controls="">
          {#if onreplace}
            <button
              type="button"
              onclick={handleReplaceClick}
              class={fileViewerStyles.actionButton}
              aria-label={resolvedReplaceLabel}
            >
              <ImagePlus class="size-3.5" aria-hidden="true" />
              <span>Replace</span>
            </button>
          {/if}

          {#if onopenexternal}
            <button
              type="button"
              data-drawio-cta=""
              data-file-viewer-open=""
              onclick={handleOpenExternalClick}
              class={fileViewerStyles.actionButton}
              aria-label={externalAppLabel}
            >
              <ExternalLink class="size-3.5" aria-hidden="true" />
              <span>{externalAppLabel}</span>
            </button>
          {/if}

          {#if onremove}
            <button
              type="button"
              onclick={handleRemoveClick}
              class={fileViewerStyles.removeActionButton}
              aria-label={resolvedRemoveLabel}
              title={resolvedRemoveLabel}
            >
              <X class="size-3.5" aria-hidden="true" />
              <span>Remove</span>
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </WindowInplaceBody>
</WindowInplace>
