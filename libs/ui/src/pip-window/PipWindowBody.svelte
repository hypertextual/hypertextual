<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { usePipWindowContext } from './PipWindowContext.svelte'
  import { pipWindowBody } from './styles'
  import type { PipWindowBodyProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: PipWindowBodyProps = $props()

  // State ---------------------------------------------------------------------
  const ctx = usePipWindowContext()
</script>

{#if !ctx?.minimized}
  <div data-pip-body="" class={cn(pipWindowBody, className)} {...rest}>
    {@render children?.()}
  </div>
{/if}
