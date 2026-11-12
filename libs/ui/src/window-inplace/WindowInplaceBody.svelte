<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceBody } from './styles'
  import type { WindowInplaceBodyProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: WindowInplaceBodyProps = $props()
</script>

<div data-window-inplace-body="" class={cn(windowInplaceBody, className)} {...rest}>
  {@render children?.()}
</div>
