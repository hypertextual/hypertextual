<script lang="ts">
  import { Menu, useMenuContext } from '@ark-ui/svelte/menu'
  import { tick, type Snippet } from 'svelte'
  let { children }: { children?: Snippet } = $props()
  const menu = useMenuContext()
  $effect(() => {
    if (menu().open) void tick().then(() => requestAnimationFrame(() => menu().reposition()))
  })
</script>

<Menu.Positioner class="helical-context-menu-positioner">
  {@render children?.()}
</Menu.Positioner>
