<script lang="ts">
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'
  import { isEditorInInsertMode, subscribeToEditorTransactions } from '../core'
  import { NodeViewWrapper } from 'svelte-tiptap'
  import { X } from 'lucide-svelte'
  import { createSubscriber } from 'svelte/reactivity'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode, updateAttributes, editor, getPos }: ImageNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const subscribe = createSubscriber((update) => subscribeToEditorTransactions(editor, update))
  let captionFocused = $state(false)

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && isEditorInInsertMode(editor)
  })
  const { src, srcset, alt } = $derived(node.attrs)

  let caption = $derived(node.attrs.caption || '')

  // Methods -------------------------------------------------------------------
  function handleCaptionBlur() {
    captionFocused = false
    updateAttributes({ caption })
  }

  function handleCaptionKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const removeBtn = (event.currentTarget as HTMLElement)
        .closest('.image-node-view')
        ?.querySelector<HTMLButtonElement>('button[aria-label="Remove image"]')
      if (removeBtn) {
        event.preventDefault()
        event.stopPropagation()
        removeBtn.focus()
        return
      }
    }
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
    {#if editable || caption}
      <figcaption class="mt-2">
        {#if editable}
          <input
            type="text"
            aria-label="Image caption"
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
        {:else}
          <span>{caption}</span>
        {/if}
      </figcaption>
    {/if}
  </figure>

  {#if editable}<button
      type="button"
      class="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer z-10"
      onclick={deleteNode}
      onkeydown={(event) => {
        if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const cap = (event.currentTarget as HTMLElement)
            .closest('.image-node-view')
            ?.querySelector<HTMLInputElement>('input.caption-input')
          if (cap) {
            event.preventDefault()
            event.stopPropagation()
            cap.focus()
          }
        }
      }}
      aria-label="Remove image"
    >
      <X class="size-3.5" aria-hidden="true" />
    </button>{/if}
</NodeViewWrapper>
