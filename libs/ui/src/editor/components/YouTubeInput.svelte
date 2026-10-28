<!-- libs/helical-svelte/src/editor/YouTubeInput.svelte -->
<script lang="ts">
  import type { YouTubeInputProps } from './types'
  import { Play, X } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { editor, position, onClose }: YouTubeInputProps = $props()

  // State ---------------------------------------------------------------------
  let url = $state('')

  let error = $state('')

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
    editor
      .chain()
      .focus()
      .insertContentAt(position, {
        type: 'linkPreview',
        attrs: { url: value, title: 'YouTube video', description: '', image: '', type: 'embed' },
      })
      .run()
    onClose()
  }
</script>

<div
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
    value={url}
    oninput={(event) => {
      url = event.currentTarget.value
      error = ''
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        insert()
      } else if (event.key === 'Escape') onClose()
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
