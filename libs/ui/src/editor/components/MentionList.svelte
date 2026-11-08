<script lang="ts">
  import { Listbox, createListCollection, useListbox } from '@ark-ui/svelte/listbox'
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import type { MentionListProps } from './types'
  import { suggestionSurface, suggestionContent, suggestionItem } from './styles'

  // Props ---------------------------------------------------------------------
  let { items = [], command }: MentionListProps = $props()

  // Derived -------------------------------------------------------------------
  const collection = $derived(
    createListCollection({
      items,
      itemToValue: (item) => item.id,
      itemToString: (item) => item.label,
    }),
  )

  const listbox = useListbox(() => ({
    collection,
    defaultHighlightedValue: items[0]?.id,
    loopFocus: false,
    onValueChange: ({ items: selected }) => {
      const item = selected[0]
      if (item)
        command({
          id: item.id,
          label: item.label,
          type: item.type,
          seriesId: item.seriesId || null,
        })
    },
  }))

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (items.length && !items.some((item) => item.id === listbox().highlightedValue))
      listbox().highlightFirst()
  })

  useKeymap(
    () => ({
      ArrowUp: {
        key: 'ArrowUp',
        label: 'Previous Mention',
        hidden: true,
        action: ({ event }) => (event ? onKeyDown(event) : false),
      },
      'Shift+Tab': {
        key: 'Shift+Tab',
        label: 'Previous Mention',
        hidden: true,
        action: ({ event }) => (event ? onKeyDown(event) : false),
      },
      ArrowDown: {
        key: 'ArrowDown',
        label: 'Next Mention',
        hidden: true,
        action: ({ event }) => (event ? onKeyDown(event) : false),
      },
      Tab: {
        key: 'Tab',
        label: 'Next Mention',
        hidden: true,
        action: ({ event }) => (event ? onKeyDown(event) : false),
      },
      Enter: {
        key: 'Enter',
        label: 'Select Mention',
        hidden: true,
        action: ({ event }) => (event ? onKeyDown(event) : false),
      },
    }),
    {
      priority: 'overlay',
      enabled: () => items.length > 0,
    },
  )

  // Methods -------------------------------------------------------------------
  function onKeyDown(event: KeyboardEvent) {
    if (!items.length || event.isComposing) return false
    if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))
      listbox().highlightPrevious()
    else if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))
      listbox().highlightNext()
    else if (event.key === 'Enter') {
      const value = listbox().highlightedValue
      if (value) listbox().selectValue(value)
    } else return false
    return true
  }
</script>

<div>
  <Listbox.RootProvider value={listbox} class={suggestionSurface}>
    <Listbox.Content aria-label="Mentions" class={suggestionContent}>
      {#if items.length === 0}
        <div class="p-3 text-center text-sm text-muted-foreground">No results</div>
      {:else}
        {#each items as item (item.id)}
          <Listbox.Item
            {item}
            class={suggestionItem}
            data-slash-selected={listbox().highlightedValue === item.id ? '' : undefined}
          >
            <Listbox.ItemText class="min-w-0 flex-1 truncate text-sm">{item.label}</Listbox.ItemText
            >
            <span class="text-xs italic text-muted-foreground">{item.type}</span>
          </Listbox.Item>
        {/each}
      {/if}
    </Listbox.Content>
  </Listbox.RootProvider>
</div>
