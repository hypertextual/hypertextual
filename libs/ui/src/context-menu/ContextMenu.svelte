<script lang="ts">
  import type { ContextMenuProps } from './types'
  import ContextMenuPositioner from './ContextMenuPositioner.svelte'
  import { Menu } from '@ark-ui/svelte/menu'
  import { Portal } from '@ark-ui/svelte/portal'
  import { cn } from '@cloudvoyant/helical-ui'
  import {
    contextMenuContentBase,
    contextMenuItemVariants,
    contextMenuShortcutBase,
  } from './styles'
  // Props ---------------------------------------------------------------------
  let { children, items, onaction, size = 'sm', class: className = '' }: ContextMenuProps = $props()
</script>

<Menu.Root onSelect={({ value }) => onaction(value)} positioning={{ placement: 'bottom-start' }}>
  <Menu.ContextTrigger>
    {#snippet asChild(props)}
      <div {...props()}>{@render children({})}</div>
    {/snippet}
  </Menu.ContextTrigger>
  <Portal>
    <ContextMenuPositioner>
      <Menu.Content class={cn(contextMenuContentBase, className)}>
        {#each items as item (item.value)}
          <Menu.Item
            value={item.value}
            class={contextMenuItemVariants({ size, destructive: item.destructive })}
            data-destructive={item.destructive || undefined}
          >
            <span>{item.label}</span>
            {#if item.shortcut}<span class={contextMenuShortcutBase}>{item.shortcut}</span>{/if}
          </Menu.Item>
        {/each}
      </Menu.Content>
    </ContextMenuPositioner>
  </Portal>
</Menu.Root>
