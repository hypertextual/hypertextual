<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { usePipWindowContext } from './PipWindowContext.svelte'
  import { pipWindowTitle } from './styles'
  import type { PipWindowTitleProps } from './types'

  // Props ---------------------------------------------------------------------
  let { children, class: className, ...rest }: PipWindowTitleProps = $props()

  // State ---------------------------------------------------------------------
  const ctx = usePipWindowContext()
</script>

<span data-pip-title="" class={cn(pipWindowTitle, className)} {...rest}>
  {#if children}
    {@render children()}
  {:else}
    {ctx?.title ?? 'Preview'}
  {/if}
</span>
