<script lang="ts">
  import ContextMenuPositioner from './ContextMenuPositioner.svelte'
  import { Menu } from '@ark-ui/svelte/menu'
  import { Portal } from '@ark-ui/svelte/portal'
  import type { Snippet } from 'svelte'
  let {
    children,
    items,
    onaction,
  }: {
    children: Snippet<[Record<string, unknown>]>
    items: { value: string; label: string; shortcut?: string; destructive?: boolean }[]
    onaction: (value: string) => void
  } = $props()
</script>

<Menu.Root onSelect={({ value }) => onaction(value)} positioning={{ placement: 'bottom-start' }}>
  <Menu.ContextTrigger>
    {#snippet asChild(props)}
      <div {...props()}>{@render children({})}</div>
    {/snippet}
  </Menu.ContextTrigger>
  <Portal>
    <ContextMenuPositioner>
      <Menu.Content class="helical-context-menu">
        {#each items as item (item.value)}
          <Menu.Item
            value={item.value}
            class="helical-context-menu-item"
            data-destructive={item.destructive || undefined}
          >
            <span>{item.label}</span>
            {#if item.shortcut}<span class="menu-shortcut">{item.shortcut}</span>{/if}
          </Menu.Item>
        {/each}
      </Menu.Content>
    </ContextMenuPositioner>
  </Portal>
</Menu.Root>

<style>
  :global(.helical-context-menu-positioner) {
    z-index: 100 !important;
  }
  :global(.helical-context-menu) {
    z-index: 50;
    min-width: 164px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--popover, var(--background));
    color: var(--popover-foreground, var(--foreground));
    box-shadow: 0 4px 12px #0002;
    outline: none;
  }
  :global(.helical-context-menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 25px;
    padding: 3px 8px;
    border-radius: 2px;
    font-size: 12px;
    cursor: default;
  }
  :global(.helical-context-menu-item[data-highlighted]) {
    background: var(--accent);
    color: var(--accent-foreground);
  }
  :global(.helical-context-menu-item[data-destructive]) {
    color: var(--destructive);
  }
  :global(.helical-context-menu .menu-shortcut) {
    opacity: 0.55;
    font-size: 10px;
  }
</style>
