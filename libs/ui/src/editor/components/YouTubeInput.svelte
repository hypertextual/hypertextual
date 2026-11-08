<script lang="ts">
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import type { YouTubeInputProps } from './types'
  import { Play, X } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { editor, position, onClose }: YouTubeInputProps = $props()

  // State ---------------------------------------------------------------------
  let dialogElement = $state<HTMLDivElement | null>(null)
  let inputElement = $state<HTMLInputElement | null>(null)

  let url = $state('')

  let error = $state('')

  // Lifecycle -----------------------------------------------------------------
  useKeymap(
    {
      Enter: {
        key: 'Enter',
        label: 'Embed YouTube Video',
        hidden: true,
        when: ({ event }) => Boolean(inputElement && event?.target === inputElement),
        action: () => {
          insert()
          return true
        },
      },
      Escape: {
        key: 'Escape',
        label: 'Close YouTube Dialog',
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
  function isYouTubeUrl(value: string): boolean {
    try {
      const host = new URL(value).hostname.replace(/^www\./, '')
      return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
    } catch {
      return false
    }
  }

  function insert() {
    const value = url.trim()
    if (!isYouTubeUrl(value)) {
      error = 'Enter a valid YouTube URL.'
      return
    }
    editor.insertYouTubeEmbed(position, value)
    onClose()
  }
</script>

<div
  bind:this={dialogElement}
  role="dialog"
  aria-label="Embed YouTube video"
  class="w-80 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
>
  <div class="mb-2 flex items-center justify-between">
    <span class="flex items-center gap-2 text-sm font-medium">
      <Play class="size-5 fill-current text-danger" aria-hidden="true" data-youtube-logo />
      Embed YouTube video
    </span>
    <button
      type="button"
      onclick={onClose}
      aria-label="Close YouTube input"
      class="rounded p-1 hover:bg-accent"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
  <input
    bind:this={inputElement}
    value={url}
    oninput={(event) => {
      url = event.currentTarget.value
      error = ''
    }}
    placeholder="https://youtube.com/watch?v=…"
    aria-label="YouTube URL"
    aria-invalid={Boolean(error)}
    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
  />
  {#if error}<div role="alert" class="mt-1 text-xs leading-tight text-destructive">
      {error}
    </div>{/if}
  <div class="mt-3 flex justify-end gap-2">
    <button
      type="button"
      onclick={onClose}
      class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={insert}
      class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      Embed
    </button>
  </div>
</div>
