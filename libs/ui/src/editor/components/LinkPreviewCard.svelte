<script lang="ts">
  import type { LinkPreviewCardProps } from './types'
  import { YouTube, YoutubeTimestamps } from '@cloudvoyant/helical-svelte'
  import { youtubeSurface } from './styles'
  import { Link, X } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { node, editable, subtextRange, editor, getPos, updateAttributes, deleteNode }: LinkPreviewCardProps =
    $props()

  // State ---------------------------------------------------------------------
  let imageError = $state(false)
  let faviconError = $state(false)

  // Derived -------------------------------------------------------------------
  const url = $derived((node.attrs.url as string | undefined) ?? '')
  const title = $derived((node.attrs.title as string | undefined) ?? '')
  const description = $derived((node.attrs.description as string | undefined) ?? '')
  const image = $derived(node.attrs.image as string | null | undefined)
  const favicon = $derived(node.attrs.favicon as string | null | undefined)
  const type = $derived((node.attrs.type as string | undefined) ?? 'bookmark')

  let draftUrl = $derived(String(url ?? ''))

  const hostname = $derived.by(() => {
    try {
      return new URL(String(url ?? '')).hostname
    } catch {
      return String(url ?? '')
    }
  })

  const chapters = $derived.by(() => {
    try {
      const parsed = new URL(String(url))
      const value =
        parsed.searchParams.get('t') ??
        parsed.searchParams.get('start') ??
        parsed.hash.replace(/^#t=/, '')
      if (!value) return []
      const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value)
      const seconds = /^\d+$/.test(value)
        ? Number(value)
        : match
          ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
          : 0
      return seconds > 0 ? [{ t: seconds, label: 'Start here' }] : []
    } catch {
      return []
    }
  })

  // Methods -------------------------------------------------------------------
  function openBookmarkDialog(event?: MouseEvent) {
    event?.preventDefault()
    if (!editable) return
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos === 'number') {
      editor.openOverlay('bookmark', {
        position: pos,
        data: { replace: true, url: String(url ?? '') },
      })
    }
  }

  function commitBookmarkUrl() {
    const trimmed = draftUrl.trim()
    if (!trimmed || trimmed === String(url ?? '')) {
      draftUrl = String(url ?? '')
      return
    }
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol')
      }
    } catch {
      draftUrl = String(url ?? '')
      return
    }

    updateAttributes({
      url: trimmed,
      ...(title === url || !title ? { title: trimmed } : {}),
    })

    void editor
      .fetchLinkPreview(trimmed)
      .then((metadata) => {
        if (metadata) {
          updateAttributes({ url: trimmed, type: 'bookmark', ...metadata })
        }
      })
      .catch(() => {})
  }

  function commitYouTubeUrl() {
    const trimmed = draftUrl.trim()
    if (!trimmed || trimmed === String(url ?? '')) {
      draftUrl = String(url ?? '')
      return
    }
    try {
      new URL(trimmed)
      updateAttributes({ url: trimmed })
    } catch {
      draftUrl = String(url ?? '')
    }
  }
</script>

<div
  data-node-view-wrapper=""
  role="none"
  style="white-space: normal;"
  class="link-preview group relative my-4"
  data-type={type}
  contenteditable={false}
>
  {#if type === 'bookmark'}
    <a
      data-bookmark-edit
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onclick={(event) => {
        if ((event.target as Element | null)?.closest('input')) {
          event.preventDefault()
          return
        }
        openBookmarkDialog(event)
      }}
      class="flex overflow-hidden rounded-lg border border-border/70 bg-muted/40 transition-colors hover:bg-muted [[data-pm-modal-node-selection]_&]:bg-transparent bookmark-card-edit"
      style="text-decoration: none !important; color: inherit;"
    >
      <div class="flex-1 min-w-0 flex flex-col justify-between px-3 py-2.5">
        <div>
          <div class="text-base font-semibold mb-1 line-clamp-1">{title}</div>
          {#if description}
            <p class="text-xs text-muted-foreground mb-2 line-clamp-2 leading-snug">
              {description}
            </p>
          {/if}
        </div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto">
          {#if favicon && !faviconError}
            <img
              src={favicon}
              alt=""
              class="w-3.5 h-3.5 flex-shrink-0"
              onerror={() => (faviconError = true)}
            />
          {:else}
            <Link class="size-3 shrink-0" aria-hidden="true" />
          {/if}
          {#if editable}
            <input
              type="url"
              aria-label="Bookmark URL"
              bind:value={draftUrl}
              onclick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onblur={commitBookmarkUrl}
              class="w-full min-w-0 bg-transparent text-xs text-muted-foreground outline-none focus:text-foreground"
            />
          {:else if subtextRange}
            <span data-bookmark-url-text class="truncate text-xs opacity-80"
              >{draftUrl.slice(0, subtextRange.from)}<span
                class="pm-modal-cursor"
                data-pm-modal-cursor="normal"
                >{draftUrl.slice(subtextRange.from, subtextRange.to) || '\u00a0'}</span
              >{draftUrl.slice(subtextRange.to)}</span
            >
          {:else}
            <span data-bookmark-url-text class="truncate text-xs opacity-80">{hostname}</span>
          {/if}
        </div>
      </div>
      {#if image && !imageError}
        <div class="flex-shrink-0 w-48 aspect-video bg-muted">
          <img
            src={image}
            alt={title}
            class="w-full h-full object-cover"
            onerror={() => (imageError = true)}
          />
        </div>
      {/if}
    </a>
  {:else if type === 'embed'}
    <div class="relative" data-modal-ignore-pointer="true">
      <YouTube {url} class={youtubeSurface}>
        {#if chapters.length}<YoutubeTimestamps {chapters} />{/if}
      </YouTube>
      {#if editable}
        <div
          class="absolute top-2 left-2 right-11 z-10 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
        >
          <Link class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="url"
            aria-label="YouTube URL"
            bind:value={draftUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            onblur={commitYouTubeUrl}
            class="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if editable}<button
      type="button"
      aria-label="Remove preview"
      class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background border border-border text-foreground shadow-sm cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-opacity z-10"
      onclick={deleteNode}
    >
      <X class="size-3.5" aria-hidden="true" />
    </button>{/if}
</div>
