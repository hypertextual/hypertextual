<script lang="ts">
  import { Button } from '@cloudvoyant/helical-svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import { Sun, Moon, Monitor } from 'lucide-svelte'
  import { themeService } from './themeService.svelte'
  import { themeToggleButtonVariants } from './styles'
  import type { ThemeToggleProps } from './types'

  // Props ---------------------------------------------------------------------
  let { theme = themeService, class: className }: ThemeToggleProps = $props()

  // Methods -------------------------------------------------------------------
  function handleClick(): void {
    theme.cycleThemeMode()
  }
</script>

<Button
  variant="text"
  size="sm"
  class={cn(themeToggleButtonVariants(), className)}
  aria-label={`Theme: ${theme.themeMode}`}
  title={`Theme: ${theme.themeMode}`}
  onclick={handleClick}
>
  {#if theme.themeMode === 'light'}
    <Sun size={14} strokeWidth={1.5} />
  {:else if theme.themeMode === 'dark'}
    <Moon size={14} strokeWidth={1.5} />
  {:else}
    <Monitor size={14} strokeWidth={1.5} />
  {/if}
</Button>
