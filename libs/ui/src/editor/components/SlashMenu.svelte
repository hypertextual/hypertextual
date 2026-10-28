<script lang="ts">
  import { Listbox, createListCollection, useListbox } from '@ark-ui/svelte/listbox'
  import { onMount } from 'svelte'
  import * as LucideIcons from 'lucide-svelte'
  import type { Component } from 'svelte'
  import type { SlashMenuProps } from './types'
  import { suggestionSurface, suggestionContent, suggestionItem } from './styles'

  // Props ---------------------------------------------------------------------
  let { items, command }: SlashMenuProps = $props()

  // Derived -------------------------------------------------------------------
  const collection = $derived(
    createListCollection({
      items,
      itemToValue: (item) => item.title,
      itemToString: (item) => item.title,
    }),
  )

  const listbox = useListbox(() => ({
    collection,
    defaultHighlightedValue: items[0]?.title,
    loopFocus: false,
    selectionMode: 'single',
    onValueChange: ({ items: selected }) => {
      if (selected[0]) command(selected[0])
    },
  }))

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const titles = items.map((item) => item.title).join('\u0000')
    if (titles && !items.some((item) => item.title === listbox().highlightedValue))
      listbox().highlightFirst()
  })

  onMount(() => {
    // Tiptap keeps text focus; forward only suggestion keys to Ark's selection state.
    const handleKey = (event: KeyboardEvent) => {
      if (!items.length || event.isComposing) return
      if (event.key === 'ArrowUp') listbox().highlightPrevious()
      else if (event.key === 'ArrowDown') listbox().highlightNext()
      else if (event.key === 'Enter') {
        const value = listbox().highlightedValue
        if (value) listbox().selectValue(value)
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  })

  // Methods -------------------------------------------------------------------
  function getIcon(iconName: string): Component | undefined {
    return (LucideIcons as unknown as Record<string, Component | undefined>)[iconName]
  }
</script>

{#if items.length > 0}
  <Listbox.RootProvider value={listbox} class={suggestionSurface}>
    <Listbox.Content aria-label="Insert block" class={suggestionContent} data-slash-menu-scroll>
      {#each items as item (item.title)}
        {@const IconComponent = getIcon(item.icon === 'YouTube' ? 'Youtube' : item.icon)}
        <Listbox.Item
          {item}
          aria-label={item.title}
          class={suggestionItem}
          data-slash-selected={listbox().highlightedValue === item.title ? '' : undefined}
        >
          <span
            class="inline-flex w-5 justify-center opacity-70"
            data-slash-icon={item.icon}
            aria-hidden="true"
          >
            {#if IconComponent}<IconComponent size={16} />{/if}
          </span>
          <Listbox.ItemText class="min-w-0 flex-1 text-sm">{item.title}</Listbox.ItemText>
        </Listbox.Item>
      {/each}
    </Listbox.Content>
  </Listbox.RootProvider>
{/if}
