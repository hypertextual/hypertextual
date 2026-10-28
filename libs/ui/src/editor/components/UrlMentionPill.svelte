<script lang="ts">
  import type { UrlMentionPillProps } from './types'
  import { NodeViewWrapper } from 'svelte-tiptap'

  // Props ---------------------------------------------------------------------
  let { node }: UrlMentionPillProps = $props()

  // State ---------------------------------------------------------------------
  let faviconError = $state(false)

  // Derived -------------------------------------------------------------------
  const { url, title, favicon } = $derived(node.attrs)
</script>

<NodeViewWrapper
  as="a"
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  class="inline-flex items-center gap-1.5 px-1.5 py-0.5 mx-0.5 rounded-md transition-colors text-sm no-underline cursor-pointer url-mention-pill-edit"
  style="text-decoration: none !important; color: inherit; vertical-align: text-bottom; margin-bottom: -0.25rem;"
>
  {#if favicon && !faviconError}
    <img
      src={favicon}
      alt=""
      class="w-3.5 h-3.5 flex-shrink-0"
      onerror={() => (faviconError = true)}
    />
  {:else}
    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
      />
    </svg>
  {/if}
  <span>{title}</span>
</NodeViewWrapper>
