<script lang="ts">
  import type { LinkPreviewCardProps } from './types'
  import {
    isEditorInInsertMode,
    modalKeymapPluginKey,
    subscribeToEditorTransactions,
    type LinkPreviewFetcher,
  } from '../core'
  import { NodeViewWrapper } from 'svelte-tiptap'
  import { YouTube, YoutubeTimestamps } from '@cloudvoyant/helical-svelte'
  import { youtubeSurface } from './styles'
  import { Link, X } from 'lucide-svelte'
  import { createSubscriber } from 'svelte/reactivity'

  // Props ---------------------------------------------------------------------
  let { node, editor, getPos, updateAttributes, deleteNode }: LinkPreviewCardProps = $props()

  // State ---------------------------------------------------------------------
  const subscribe = createSubscriber((update) => subscribeToEditorTransactions(editor, update))
  let imageError = $state(false)

  let faviconError = $state(false)

  let urlInputEl = $state<HTMLInputElement>()

  let removeBtnEl = $state<HTMLButtonElement>()

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && isEditorInInsertMode(editor)
  })
  const { url, title, description, image, favicon, type } = $derived(node.attrs)

  let draftUrl = $derived(String(url ?? ''))

  const hostname = $derived.by(() => {
    try {
      return new URL(String(url ?? '')).hostname
    } catch {
      return String(url ?? '')
    }
  })

  const modalSubtext = $derived.by(() => {
    subscribe()
    const st = modalKeymapPluginKey.getState(editor.state)?.subtextCursor
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (!st || st.kind !== 'linkPreviewUrl' || st.pos !== pos) return null
    return st
  })

  const modalCharRange = $derived.by(() => {
    if (!modalSubtext) return null
    if (typeof modalSubtext.anchorOffset === 'number') {
      const from = Math.min(modalSubtext.anchorOffset, modalSubtext.offset)
      const to = Math.max(modalSubtext.anchorOffset, modalSubtext.offset)
      return { from, to: Math.max(from + 1, to) }
    }
    return { from: modalSubtext.offset, to: modalSubtext.offset + 1 }
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
      editor.commands.openOverlay('bookmark', {
        position: pos,
        data: { replace: true, url: String(url ?? '') },
      })
    }
  }

  function focusBefore() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos !== 'number') return
    editor
      .chain()
      .focus()
      .setTextSelection(Math.max(0, pos - 1))
      .run()
  }

  function focusAfter() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos !== 'number') return
    const posAfter = Math.min(editor.state.doc.content.size, pos + node.nodeSize)
    editor.chain().focus().setTextSelection(posAfter).run()
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

    const fetcher = (
      editor.storage as unknown as {
        linkPreview?: { fetchLinkPreview?: LinkPreviewFetcher }
      }
    ).linkPreview?.fetchLinkPreview
    if (fetcher) {
      void fetcher(trimmed)
        .then((metadata) => {
          updateAttributes({ url: trimmed, type: 'bookmark', ...metadata })
        })
        .catch(() => {})
    }
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

  function handleBookmarkUrlKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (removeBtnEl) {
        event.preventDefault()
        event.stopPropagation()
        commitBookmarkUrl()
        removeBtnEl.focus()
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      commitBookmarkUrl()
      focusBefore()
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      commitBookmarkUrl()
      focusAfter()
    }
  }

  function handleYouTubeUrlKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (removeBtnEl) {
        event.preventDefault()
        event.stopPropagation()
        commitYouTubeUrl()
        removeBtnEl.focus()
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      commitYouTubeUrl()
      focusBefore()
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      commitYouTubeUrl()
      focusAfter()
    }
  }
</script>

<NodeViewWrapper class="link-preview group relative my-4" data-type={type} contenteditable={false}>
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
              bind:this={urlInputEl}
              type="url"
              aria-label="Bookmark URL"
              bind:value={draftUrl}
              onclick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onblur={commitBookmarkUrl}
              onkeydown={handleBookmarkUrlKeydown}
              class="w-full min-w-0 bg-transparent text-xs text-muted-foreground outline-none focus:text-foreground"
            />
          {:else if modalCharRange}
            <span data-bookmark-url-text class="truncate text-xs opacity-80"
              >{draftUrl.slice(0, modalCharRange.from)}<span
                class="pm-modal-cursor"
                data-pm-modal-cursor="normal"
                >{draftUrl.slice(modalCharRange.from, modalCharRange.to) || '\u00a0'}</span
              >{draftUrl.slice(modalCharRange.to)}</span
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
          class="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
        >
          <Link class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            bind:this={urlInputEl}
            type="url"
            aria-label="YouTube URL"
            bind:value={draftUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            onblur={commitYouTubeUrl}
            onkeydown={handleYouTubeUrlKeydown}
            class="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if editable}<button
      bind:this={removeBtnEl}
      type="button"
      aria-label="Remove preview"
      class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background border border-border text-foreground shadow-sm cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-opacity z-10"
      onclick={deleteNode}
      onkeydown={(event) => {
        if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
          if (urlInputEl) {
            event.preventDefault()
            event.stopPropagation()
            urlInputEl.focus()
          }
        }
      }}
    >
      <X class="size-3.5" aria-hidden="true" />
    </button>{/if}
</NodeViewWrapper>
