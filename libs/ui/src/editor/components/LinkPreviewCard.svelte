<script lang="ts">
  import type { LinkPreviewCardProps } from './types'
  import { NodeViewWrapper } from 'svelte-tiptap'
  import { YouTube, YoutubeTimestamps } from '@cloudvoyant/helical-svelte'
  import { youtubeSurface } from './styles'
  import { Link, X } from 'lucide-svelte'
  import { getContext } from 'svelte'
  import { editorModeKey, type EditorMode } from './mode'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode }: LinkPreviewCardProps = $props()
  const mode = getContext<EditorMode>(editorModeKey)

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
            <Link class="size-3 shrink-0" aria-hidden="true" />
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
    <YouTube {url} {title} class={youtubeSurface}>
      {#if chapters.length}<YoutubeTimestamps {chapters} />{/if}
    </YouTube>
  {/if}

  {#if mode.editable}<button
      type="button"
      aria-label="Remove preview"
      class="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-muted border-none cursor-pointer opacity-0 transition-opacity hover:opacity-100"
      onclick={deleteNode}
    >
      <X class="size-4" aria-hidden="true" />
    </button>{/if}
</NodeViewWrapper>
