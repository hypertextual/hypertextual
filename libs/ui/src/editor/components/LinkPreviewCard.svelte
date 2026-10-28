<script lang="ts">
  import type { LinkPreviewCardProps } from './types'
  import { NodeViewWrapper } from 'svelte-tiptap'
  import { YouTube, YoutubeTimestamps } from '@cloudvoyant/helical-svelte'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode }: LinkPreviewCardProps = $props()

  // State ---------------------------------------------------------------------
  let imageError = $state(false)

  let faviconError = $state(false)

  // Derived -------------------------------------------------------------------
  const { url, title, description, image, favicon, type } = $derived(node.attrs)
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
</script>

<NodeViewWrapper class="link-preview relative my-4" data-type={type}>
  {#if type === 'bookmark'}
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex overflow-hidden rounded-lg border border-border/70 bg-muted/40 transition-colors hover:bg-muted bookmark-card-edit"
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
            <svg class="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
              />
            </svg>
          {/if}
          <span class="truncate text-xs opacity-80">{new URL(url).hostname}</span>
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
    <YouTube {url} {title}>
      {#if chapters.length}<YoutubeTimestamps {chapters} />{/if}
    </YouTube>
  {/if}

  <button
    type="button"
    class="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted border-none cursor-pointer text-xl leading-none opacity-0 transition-opacity hover:opacity-100"
    onclick={deleteNode}
  >
    ×
  </button>
</NodeViewWrapper>
