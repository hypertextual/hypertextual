<script lang="ts">
  import { Listbox, createListCollection, useListbox } from '@ark-ui/svelte/listbox'
  import type { MentionListElement } from 'htmd-ts'
  import { useKeyScope } from '../../key-scope/useKeyScope.svelte'
  import type { MentionListProps } from './types'
  import { suggestionSurface, suggestionContent, suggestionItem } from './styles'

  // Props ---------------------------------------------------------------------
  let { items = [], command }: MentionListProps = $props()

  // State ---------------------------------------------------------------------
  let element = $state<HTMLElement | null>(null)

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
    if (!element) return
    const target = element as MentionListElement
    target.__mentionListKeyDown = onKeyDown
    return () => {
      delete target.__mentionListKeyDown
    }
  })

  $effect(() => {
    if (items.length && !items.some((item) => item.id === listbox().highlightedValue))
      listbox().highlightFirst()
  })

  useKeyScope({
    id: 'overlay:mention-list',
    priority: 'overlay',
    enabled: () => items.length > 0,
    getContext: () => null,
    keymap: () => ({
      ArrowUp: {
        id: 'mentionList.previous',
        key: 'ArrowUp',
        label: 'Previous Mention',
        run: (_ctx, event) => onKeyDown(event),
      },
      'Shift-Tab': {
        id: 'mentionList.previousTab',
        key: 'Shift-Tab',
        label: 'Previous Mention',
        run: (_ctx, event) => onKeyDown(event),
      },
      ArrowDown: {
        id: 'mentionList.next',
        key: 'ArrowDown',
        label: 'Next Mention',
        run: (_ctx, event) => onKeyDown(event),
      },
      Tab: {
        id: 'mentionList.nextTab',
        key: 'Tab',
        label: 'Next Mention',
        run: (_ctx, event) => onKeyDown(event),
      },
      Enter: {
        id: 'mentionList.select',
        key: 'Enter',
        label: 'Select Mention',
        run: (_ctx, event) => onKeyDown(event),
      },
    }),
  })

  // Methods -------------------------------------------------------------------
  function onKeyDown(event: KeyboardEvent) {
    if (!items.length) return false
    if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))
      listbox().highlightPrevious()
    else if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))
      listbox().highlightNext()
    else if (event.key === 'Enter') {
      const value = listbox().highlightedValue
      if (value) listbox().selectValue(value)
    } else return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  export function ref() {
    return { onKeyDown }
  }
</script>

<div bind:this={element}>
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
