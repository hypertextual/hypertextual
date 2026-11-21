<script lang="ts">
  import { Tabs } from '@ark-ui/svelte/tabs'
  import { cn } from '@cloudvoyant/helical-ui'
  import { X } from 'lucide-svelte'
  import { tick } from 'svelte'
  import { tabsStyles } from './styles'
  import type { TabsProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    items,
    value,
    ariaLabel = 'Open documents',
    size = 'sm',
    class: className = '',
    onchange,
    onclose,
  }: TabsProps = $props()

  // State ---------------------------------------------------------------------
  let listRef = $state<HTMLDivElement | null>(null)

  // Derived -------------------------------------------------------------------
  const rootClasses = $derived(cn(tabsStyles.root, className))
  const listClasses = $derived(cn(tabsStyles.list({ size })))
  const triggerClasses = $derived(cn(tabsStyles.trigger({ size })))

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const activeValue = value
    if (!activeValue || !listRef) return
    void tick().then(() => {
      const target = listRef?.querySelector<HTMLElement>(
        `[data-tab-id=${JSON.stringify(activeValue)}]`,
      )
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  })

  // Methods -------------------------------------------------------------------
  function handleValueChange(details: { value: string }): void {
    onchange(details.value)
  }

  function handleTriggerMouseDown(event: MouseEvent, itemValue: string): void {
    if (event.button === 1 && onclose) {
      event.preventDefault()
      onclose(itemValue)
      return
    }
    event.preventDefault()
  }

  function handleCloseClick(event: MouseEvent, itemValue: string): void {
    event.stopPropagation()
    onclose?.(itemValue)
  }
</script>

<Tabs.Root value={value ?? undefined} onValueChange={handleValueChange} class={rootClasses}>
  <Tabs.List bind:ref={listRef} aria-label={ariaLabel} class={listClasses}>
    {#each items as item (item.value)}
      <div
        class={tabsStyles.itemContainer({ size })}
        data-selected={value === item.value ? '' : undefined}
        data-dirty={item.dirty ? 'true' : undefined}
        data-tab-id={item.value}
      >
        <Tabs.Trigger
          value={item.value}
          tabindex={-1}
          title={item.title ?? item.label}
          class={triggerClasses}
          onmousedown={(event) => handleTriggerMouseDown(event, item.value)}
        >
          <span class="truncate">{item.label}</span>
          {#if item.dirty}
            <span
              class={tabsStyles.dirtyIndicator}
              aria-label="Unsaved changes"
              title="Unsaved changes"
            ></span>
          {/if}
        </Tabs.Trigger>
        {#if item.closable !== false && onclose}
          <button
            type="button"
            tabindex={-1}
            class={tabsStyles.closeButton}
            aria-label={`Close ${item.label}`}
            onmousedown={(event) => event.preventDefault()}
            onclick={(event) => handleCloseClick(event, item.value)}
          >
            <X size={11} strokeWidth={1.75} />
          </button>
        {/if}
      </div>
    {/each}
  </Tabs.List>
</Tabs.Root>
