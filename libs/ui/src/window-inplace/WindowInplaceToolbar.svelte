<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceToolbar } from './styles'
  import type { WindowInplaceToolbarProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: WindowInplaceToolbarProps = $props()
</script>

<div data-window-inplace-toolbar="" class={cn(windowInplaceToolbar, className)} {...rest}>
  {@render children?.()}
</div>
