<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { usePipWindowContext } from './PipWindowContext.svelte'
  import { pipWindowHeader } from './styles'
  import type { PipWindowHeaderProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: PipWindowHeaderProps = $props()

  // State ---------------------------------------------------------------------
  const ctx = usePipWindowContext()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  data-pip-header=""
  data-minimized={ctx?.minimized ? 'true' : 'false'}
  class={cn(
    pipWindowHeader,
    ctx?.draggable ? 'cursor-grab active:cursor-grabbing' : undefined,
    className,
  )}
  onpointerdown={ctx?.onHeaderPointerDown}
  onpointermove={ctx?.onHeaderPointerMove}
  onpointerup={ctx?.onHeaderPointerUp}
  {...rest}
>
  {@render children?.()}
</div>
