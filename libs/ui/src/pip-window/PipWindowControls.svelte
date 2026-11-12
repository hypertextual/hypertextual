<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { Maximize2, Minimize2, Minus } from 'lucide-svelte'
  import { usePipWindowContext } from './PipWindowContext.svelte'
  import { pipWindowControlButton, pipWindowControls } from './styles'
  import type { PipWindowControlsProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: PipWindowControlsProps = $props()

  // State ---------------------------------------------------------------------
  const ctx = usePipWindowContext()
</script>

<div data-pip-controls="" data-editor-controls class={cn(pipWindowControls, className)} {...rest}>
  {@render children?.()}
  <button
    type="button"
    data-pip-minimize=""
    aria-label={ctx?.minimized
      ? `Expand ${ctx.title}`
      : `Minimize ${ctx?.title ?? 'Preview'}`}
    title={ctx?.minimized ? `Expand ${ctx.title}` : `Minimize ${ctx?.title ?? 'Preview'}`}
    class={pipWindowControlButton}
    onclick={ctx?.toggleMinimize}
  >
    {#if ctx?.minimized}
      <Maximize2 class="size-3" />
    {:else}
      <Minus class="size-3" />
    {/if}
  </button>
  {#if ctx?.hasFullscreen}
    <button
      type="button"
      data-pip-fullscreen=""
      aria-label={`Fullscreen ${ctx.title}`}
      title={`Fullscreen ${ctx.title}`}
      class={pipWindowControlButton}
      onclick={ctx.triggerFullscreen}
    >
      <Minimize2 class="size-3 rotate-45" />
    </button>
  {/if}
</div>
