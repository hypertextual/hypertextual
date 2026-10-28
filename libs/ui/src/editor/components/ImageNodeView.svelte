<script lang="ts">
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'
  import { NodeViewWrapper } from 'svelte-tiptap'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode, updateAttributes, editor, getPos }: ImageNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  let captionFocused = $state(false)

  // Derived -------------------------------------------------------------------
  const { src, srcset, alt } = $derived(node.attrs)

  let caption = $derived(node.attrs.caption || '')

  // Methods -------------------------------------------------------------------
  function handleCaptionBlur() {
    captionFocused = false
    updateAttributes({ caption })
  }

  function handleCaptionKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      updateAttributes({ caption })
      const pos = (getPos as () => number)()
      editor
        .chain()
        .focus()
        .setTextSelection(Math.max(pos - 1, 0))
        .run()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      updateAttributes({ caption })
      const posAfter = (getPos as () => number)() + node.nodeSize
      editor.chain().focus().setTextSelection(posAfter).run()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const input = event.currentTarget as HTMLInputElement
      const cursorIdx = input.selectionStart ?? caption.length
      const leftText = caption.slice(0, cursorIdx)
      const rightText = caption.slice(cursorIdx)

      caption = leftText
      updateAttributes({ caption: leftText })

      const posAfter = (getPos as () => number)() + node.nodeSize
      editor
        .chain()
        .focus()
        .insertContentAt(posAfter, {
          type: 'paragraph',
          content: rightText ? [{ type: 'text', text: rightText }] : [],
        })
        .setTextSelection(posAfter + 1)
        .run()
    }
  }
</script>

<NodeViewWrapper class={imageSurface} contenteditable={false}>
  <figure class="m-0">
    <img
      {src}
      {srcset}
      sizes="(max-width: 768px) 100vw, 720px"
      alt={alt || ''}
      class="w-full object-cover"
      draggable="false"
    />
    <figcaption class="mt-2">
      <input
        type="text"
        bind:value={caption}
        onfocus={() => {
          captionFocused = true
        }}
        onblur={handleCaptionBlur}
        onkeydown={handleCaptionKeydown}
        placeholder={captionFocused ? '' : 'Add a caption…'}
        style="background: transparent; box-shadow: none; outline: none;"
        class={captionInput}
      />
    </figcaption>
  </figure>

  <button
    type="button"
    class="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
    onclick={deleteNode}
    aria-label="Remove image"
  >
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  </button>
</NodeViewWrapper>
