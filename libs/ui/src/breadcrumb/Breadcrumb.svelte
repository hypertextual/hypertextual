<script lang="ts">
  import { Ark } from '@ark-ui/svelte/factory'
  import { cn } from '@cloudvoyant/helical-ui'
  import { ChevronRight } from 'lucide-svelte'
  import type { BreadcrumbProps } from './types'
  import { breadcrumbRoot, breadcrumbList, breadcrumbItem, breadcrumbCurrent } from './styles'

  // Props ---------------------------------------------------------------------
  let { items, label = 'Breadcrumb', title, class: className }: BreadcrumbProps = $props()
</script>

<Ark as="nav" aria-label={label} {title} class={cn(breadcrumbRoot, className)}>
  <Ark as="ol" class={breadcrumbList}>
    {#each items as item, index (index)}
      <Ark as="li" class={breadcrumbItem}>
        {#if index > 0}<ChevronRight class="size-3 shrink-0" aria-hidden="true" />{/if}
        <span
          aria-current={index === items.length - 1 ? 'page' : undefined}
          title={index === items.length - 1 ? title : item}
          class={index === items.length - 1 ? breadcrumbCurrent : 'truncate'}>{item}</span
        >
      </Ark>
    {/each}
  </Ark>
</Ark>
