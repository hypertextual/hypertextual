<script lang="ts">
  import type { HtmdOverlayBinding } from 'htmd-ts'
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

  let binding: HtmdOverlayBinding | undefined

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (!surface) return
    const attached = editor.attachOverlaySurface(surface, {
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
    void position
    binding?.update()
  })
</script>

<div bind:this={surface} data-cursor-overlay class="fixed z-50">
  {@render children()}
</div>
