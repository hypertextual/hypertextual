<script lang="ts">
  import { Check, Copy, Maximize2, Minimize2, Pencil } from 'lucide-svelte'
  import { WindowInplaceToolbar } from '../../../window-inplace'
  import { mermaidEditorStyles } from './styles'
  import type { MermaidToolbarProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    isCodeMode,
    isFullscreen,
    sourceCode,
    onedit,
    ontogglefullscreen,
  }: MermaidToolbarProps = $props()

  // State ---------------------------------------------------------------------
  let copied = $state(false)

  // Methods -------------------------------------------------------------------
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
</script>

<WindowInplaceToolbar>
  {#if !isCodeMode}
    <button
      type="button"
      data-mermaid-edit=""
      aria-label="Edit Mermaid diagram"
      title="Edit Mermaid diagram (Enter / i)"
      class={mermaidEditorStyles.toolbarButton}
      onclick={onedit}
    >
      <Pencil class="size-3.5" />
    </button>
  {:else}
    <button
      type="button"
      data-mermaid-copy=""
      aria-label="Copy Mermaid source"
      title="Copy Mermaid source"
      class={mermaidEditorStyles.toolbarButton}
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
    class={mermaidEditorStyles.toolbarButton}
    onclick={ontogglefullscreen}
  >
    {#if isFullscreen}
      <Minimize2 class="size-3.5" />
    {:else}
      <Maximize2 class="size-3.5" />
    {/if}
  </button>
</WindowInplaceToolbar>
