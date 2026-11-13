<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceFooter } from './styles'
  import type { WindowInplaceFooterProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: WindowInplaceFooterProps = $props()
</script>

<div
  contenteditable={false}
  data-window-inplace-footer=""
  class={cn(windowInplaceFooter, className)}
  {...rest}
>
  {@render children?.()}
</div>
