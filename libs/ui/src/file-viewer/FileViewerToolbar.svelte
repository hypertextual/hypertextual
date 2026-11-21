<script lang="ts">
  import { ExternalLink, Maximize2, Minimize2, RefreshCw, Workflow } from 'lucide-svelte'
  import { WindowInplaceToolbar } from '../window-inplace'
  import { fileViewerStyles } from './styles'
  import type { FileViewerToolbarProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    kind,
    externalAppLabel,
    isFullscreen,
    canOpenExternal,
    canRefresh,
    onopenexternal,
    onrefresh,
    ontogglefullscreen,
  }: FileViewerToolbarProps = $props()

  // Derived -------------------------------------------------------------------
  const isDrawio = $derived(kind === 'drawio-image' || kind === 'drawio-xml')
</script>

<WindowInplaceToolbar data-editor-controls="">
  {#if canOpenExternal}
    <button
      type="button"
      data-file-viewer-open-external=""
      onclick={onopenexternal}
      class={fileViewerStyles.toolbarButton}
      aria-label={externalAppLabel}
      title={externalAppLabel}
    >
      {#if isDrawio}
        <Workflow class="size-3.5" aria-hidden="true" />
      {:else}
        <ExternalLink class="size-3.5" aria-hidden="true" />
      {/if}
      <span>{externalAppLabel}</span>
    </button>
  {/if}

  {#if canRefresh}
    <button
      type="button"
      data-file-viewer-refresh=""
      onclick={onrefresh}
      class={fileViewerStyles.toolbarIconButton}
      aria-label="Refresh preview"
      title="Refresh preview"
    >
      <RefreshCw class="size-3.5" aria-hidden="true" />
    </button>
  {/if}

  <button
    type="button"
    data-file-viewer-fullscreen=""
    onclick={ontogglefullscreen}
    class={fileViewerStyles.toolbarIconButton}
    aria-label={isFullscreen ? 'Minimize preview' : 'Maximize preview'}
    title={isFullscreen ? 'Minimize preview' : 'Maximize preview'}
  >
    {#if isFullscreen}
      <Minimize2 class="size-3.5" aria-hidden="true" />
    {:else}
      <Maximize2 class="size-3.5" aria-hidden="true" />
    {/if}
  </button>
</WindowInplaceToolbar>
