<script lang="ts">
  import type { UrlMentionPillProps } from './types'
  import { Link } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { node }: UrlMentionPillProps = $props()

  // State ---------------------------------------------------------------------
  let faviconError = $state(false)

  // Derived -------------------------------------------------------------------
  const url = $derived((node.attrs.url as string | undefined) ?? '')
  const title = $derived((node.attrs.title as string | undefined) ?? '')
  const favicon = $derived(node.attrs.favicon as string | null | undefined)
</script>

<a
  data-node-view-wrapper=""
  style="white-space: normal; text-decoration: none !important; color: inherit; vertical-align: text-bottom; margin-bottom: -0.25rem;"
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  class="inline-flex items-center gap-1.5 px-1.5 py-0.5 mx-0.5 rounded-md transition-colors text-sm no-underline cursor-pointer url-mention-pill-edit"
>
  {#if favicon && !faviconError}
    <img
      src={favicon}
      alt=""
      class="w-3.5 h-3.5 flex-shrink-0"
      onerror={() => (faviconError = true)}
    />
  {:else}
    <Link class="size-3.5 shrink-0" aria-hidden="true" />
  {/if}
  <span>{title}</span>
</a>
