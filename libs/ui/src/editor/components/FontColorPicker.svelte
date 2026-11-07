<script lang="ts">
  import { textColors, highlightColors } from './styles'
  import type { FontColorPickerProps } from './types'

  // Props ---------------------------------------------------------------------
  let { editor, visible = $bindable(false), mode = 'color' }: FontColorPickerProps = $props()

  // Methods -------------------------------------------------------------------
  function selectColor(colorId: string) {
    if (mode === 'highlight') {
      const entry = highlightColors.find((color) => color.id === colorId)
      editor.execCommand('toggleHighlight', entry?.preview ?? colorId)
    } else {
      const entry = textColors.find((c) => c.id === colorId)
      editor.execCommand('setColor', entry?.preview ?? colorId)
    }
    visible = false
  }

  function clearColor() {
    if (mode === 'highlight') {
      editor.execCommand('unsetHighlight')
    } else {
      editor.execCommand('unsetColor')
    }
    visible = false
  }
</script>

{#if visible}
  <div
    class="absolute z-50 mt-2 w-48 rounded-lg border bg-background text-foreground p-1 shadow-lg"
  >
    <div class="text-xs font-medium text-muted-foreground px-3 py-2">
      {mode === 'highlight' ? 'Highlight' : 'Color'}
    </div>
    <div class="flex flex-col">
      <!-- None/Clear option -->
      <button
        type="button"
        class="flex items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
        onclick={clearColor}
      >
        <div
          class="h-5 w-5 rounded border border-border flex-shrink-0 flex items-center justify-center"
        >
          <span class="text-xs text-muted-foreground">×</span>
        </div>
        <span>None</span>
      </button>
      <!-- Color options -->
      {#each mode === 'highlight' ? highlightColors : textColors as color (color.id)}
        <button
          type="button"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors text-left"
          onclick={() => selectColor(color.id)}
        >
          <div
            class="h-5 w-5 rounded border border-border flex-shrink-0"
            style="background-color: {color.preview}"
          ></div>
          <span>{color.name}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
