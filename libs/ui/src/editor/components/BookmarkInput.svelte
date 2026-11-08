<script lang="ts">
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import type { BookmarkInputProps } from './types'
  import { onMount, onDestroy } from 'svelte'

  // Props ---------------------------------------------------------------------
  let { editor, position, data, onClose, fetchLinkPreview }: BookmarkInputProps = $props()

  // State ---------------------------------------------------------------------
  const replaceData = $derived(
    data && typeof data === 'object' ? (data as { replace?: boolean; url?: string }) : undefined,
  )

  let active = true

  let url = $derived(replaceData?.url ?? '')

  let isLoading = $state(false)

  let error = $state('')

  let dialogElement = $state<HTMLDivElement | null>(null)

  let inputElement = $state<HTMLInputElement>()

  // Lifecycle -----------------------------------------------------------------
  onDestroy(() => {
    active = false
  })

  onMount(() => inputElement?.focus())

  useKeymap(
    {
      Enter: {
        key: 'Enter',
        label: 'Insert Bookmark',
        hidden: true,
        when: ({ event }) => event?.target === inputElement,
        action: () => {
          void submit()
          return true
        },
      },
      Escape: {
        key: 'Escape',
        label: 'Close Bookmark Dialog',
        hidden: true,
        action: () => {
          onClose()
          editor.execCommand('exitToNormal')
          return true
        },
      },
    },
    {
      priority: 'overlay',
      element: () => dialogElement,
      enabled: () => Boolean(dialogElement),
    },
  )

  // Methods -------------------------------------------------------------------
  async function submit() {
    const trimmed = url.trim()
    if (!trimmed) {
      error = 'Please enter a URL'
      return
    }

    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        throw new Error('Unsupported URL protocol')
    } catch {
      error = 'Please enter a valid URL'
      return
    }

    isLoading = true
    error = ''
    try {
      const metadata = fetchLinkPreview
        ? await fetchLinkPreview(trimmed)
        : {
            title: trimmed,
            description: '',
            image: null,
            favicon: null,
            provider: '',
          }
      if (!active) return
      editor.insertOrReplaceBookmark(
        position,
        { url: trimmed, ...metadata },
        Boolean(replaceData?.replace),
      )
      onClose()
    } catch {
      if (active) error = 'Could not load link details. Please try again.'
    } finally {
      if (active) isLoading = false
    }
  }
</script>

<div
  bind:this={dialogElement}
  role="dialog"
  aria-label="Insert bookmark"
  tabindex="-1"
  class="w-80 space-y-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"
>
  <p class="text-sm font-semibold">Insert Bookmark</p>
  <div class="space-y-1">
    <input
      bind:this={inputElement}
      type="url"
      bind:value={url}
      oninput={() => (error = '')}
      placeholder="https://example.com"
      aria-invalid={Boolean(error)}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
    {#if error}
      <div role="alert" class="text-xs leading-tight text-destructive">{error}</div>
    {/if}
  </div>
  <div class="flex justify-end gap-2">
    <button type="button" onclick={onClose} class="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
      >Cancel</button
    >
    <button
      type="button"
      onclick={() => void submit()}
      disabled={isLoading}
      class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {isLoading ? 'Loading…' : 'Insert'}
    </button>
  </div>
</div>
