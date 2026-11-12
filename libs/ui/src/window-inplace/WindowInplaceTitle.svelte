<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceTitle } from './styles'
  import type { WindowInplaceTitleProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: WindowInplaceTitleProps = $props()
</script>

<span data-window-inplace-title="" class={cn(windowInplaceTitle, className)} {...rest}>
  {@render children?.()}
</span>
