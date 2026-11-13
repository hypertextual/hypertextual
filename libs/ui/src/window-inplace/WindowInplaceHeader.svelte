<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { windowInplaceHeader } from './styles'
  import type { WindowInplaceHeaderProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: WindowInplaceHeaderProps = $props()
</script>

<div
  contenteditable={false}
  data-window-inplace-header=""
  data-editor-controls
  class={cn(windowInplaceHeader, className)}
  {...rest}
>
  {@render children?.()}
</div>
