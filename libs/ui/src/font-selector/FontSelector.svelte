<script lang="ts">
  import { Button } from '@cloudvoyant/helical-svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import { EDITOR_FONTS, type FontSelectorProps } from './types'
  import { fontSelectorButtonVariants } from './styles'

  // Props ---------------------------------------------------------------------
  let { value, fonts = EDITOR_FONTS, onchange, class: className }: FontSelectorProps = $props()

  // Methods -------------------------------------------------------------------
  function cycle() {
    if (!fonts.length) return
    const index = fonts.indexOf(value)
    const next = fonts[(index + 1) % fonts.length] ?? fonts[0]
    if (next) onchange?.(next)
  }
</script>

<Button
  variant="text"
  size="sm"
  class={cn(fontSelectorButtonVariants(), className)}
  aria-label={`Editor font: ${value} (click to cycle)`}
  title={`Editor font: ${value} (click to cycle)`}
  onclick={cycle}
>
  {value}
</Button>
