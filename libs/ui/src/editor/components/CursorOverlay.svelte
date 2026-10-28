<!-- libs/helical-svelte/src/editor/CursorOverlay.svelte -->
<script lang="ts">
  import type { EditorOverlayBinding } from '../core'
  import type { CursorOverlayProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    editor,
    position,
    width,
    height,
    gap,
    viewportGap,
    placement,
    align,
    lockScroll = true,
    children,
  }: CursorOverlayProps = $props()

  // State ---------------------------------------------------------------------
  let surface = $state<HTMLDivElement | null>(null)

  let binding: EditorOverlayBinding | undefined

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (!surface) return
    const attached = editor.storage.editorOverlays.attach(surface, {
      anchor: () => position,
      width,
      height,
      gap,
      viewportGap,
      placement,
      align,
      lockScroll,
    })
    binding = attached
    return () => {
      attached.destroy()
      binding = undefined
    }
  })

  $effect(() => {
    position
    binding?.update()
  })
</script>

<div bind:this={surface} data-cursor-overlay class="fixed z-50">
  {@render children()}
</div>
