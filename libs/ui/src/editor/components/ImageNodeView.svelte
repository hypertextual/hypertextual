<script lang="ts">
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'
  import { ImagePlus, X } from 'lucide-svelte'

  // Props ---------------------------------------------------------------------
  let { node, editable, subtextRange, deleteNode, updateAttributes, editor, getPos }: ImageNodeViewProps =
    $props()

  // State ---------------------------------------------------------------------
  let captionFocused = $state(false)

  // Derived -------------------------------------------------------------------
  const src = $derived(node.attrs.src as string | undefined)
  const srcset = $derived(node.attrs.srcset as string | undefined)
  const alt = $derived(node.attrs.alt as string | undefined)

  let caption = $derived((node.attrs.caption as string | undefined) || '')

  // Methods -------------------------------------------------------------------
  function handleReplaceImage() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos === 'number') {
      editor.openOverlay('image', {
        position: pos,
        data: { replace: true, src: String(src ?? '') },
      })
    }
  }

  function handleCaptionInput(event: Event & { currentTarget: HTMLInputElement }) {
    caption = event.currentTarget.value
    updateAttributes({ caption })
  }

  function handleCaptionBlur() {
    captionFocused = false
    updateAttributes({ caption })
  }
</script>

<div
  data-node-view-wrapper=""
  role="none"
  style="white-space: normal;"
  class={imageSurface}
  contenteditable={false}
>
  <figure class="m-0">
    <div class="relative">
      <img
        {src}
        {srcset}
        sizes="(max-width: 768px) 100vw, 720px"
        alt={alt || ''}
        class="w-full object-cover"
        draggable="false"
      />
      {#if editable}
        <button
          type="button"
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/90 border border-border px-3 py-1.5 text-xs font-medium text-foreground shadow-sm flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors cursor-pointer z-10"
          onclick={handleReplaceImage}
          aria-label="Replace image"
        >
          <ImagePlus class="size-3.5" aria-hidden="true" />
          <span>Replace</span>
        </button>
        <button
          type="button"
          class="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border text-foreground shadow-sm flex items-center justify-center hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors cursor-pointer z-10"
          onclick={deleteNode}
          aria-label="Remove image"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      {/if}
    </div>
    {#if editable || caption || subtextRange}
      <figcaption class="mt-2">
        {#if editable}
          <input
            type="text"
            aria-label="Image caption"
            bind:value={caption}
            oninput={handleCaptionInput}
            onfocus={() => {
              captionFocused = true
            }}
            onblur={handleCaptionBlur}
            placeholder={captionFocused ? '' : 'Add a caption…'}
            style="background: transparent; box-shadow: none; outline: none;"
            class={captionInput}
          />
        {:else if subtextRange}
          <span data-image-caption-text
            >{caption.slice(0, subtextRange.from)}<span
              class="pm-modal-cursor"
              data-pm-modal-cursor="normal"
              >{caption.slice(subtextRange.from, subtextRange.to) || '\u00a0'}</span
            >{caption.slice(subtextRange.to)}</span
          >
        {:else}
          <span data-image-caption-text>{caption}</span>
        {/if}
      </figcaption>
    {/if}
  </figure>
</div>
