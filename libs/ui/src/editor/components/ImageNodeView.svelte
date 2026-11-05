<script lang="ts">
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'
  import {
    isEditorInInsertMode,
    modalKeymapPluginKey,
    subscribeToEditorTransactions,
  } from '../core'
  import { NodeViewWrapper } from 'svelte-tiptap'
  import { ImagePlus, X } from 'lucide-svelte'
  import { createSubscriber } from 'svelte/reactivity'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode, updateAttributes, editor, getPos }: ImageNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const subscribe = createSubscriber((update) => subscribeToEditorTransactions(editor, update))
  let captionFocused = $state(false)

  let captionInputEl = $state<HTMLInputElement>()

  let replaceBtnEl = $state<HTMLButtonElement>()

  let removeBtnEl = $state<HTMLButtonElement>()

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && isEditorInInsertMode(editor)
  })
  const { src, srcset, alt } = $derived(node.attrs)

  let caption = $derived(node.attrs.caption || '')

  const modalSubtext = $derived.by(() => {
    subscribe()
    const st = modalKeymapPluginKey.getState(editor.state)?.subtextCursor
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (!st || st.kind !== 'imageCaption' || st.pos !== pos) return null
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

  // Methods -------------------------------------------------------------------
  function handleReplaceImage() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos === 'number') {
      editor.commands.openOverlay('image', {
        position: pos,
        data: { replace: true, src: String(src ?? '') },
      })
    }
  }

  function handleCaptionBlur() {
    captionFocused = false
    updateAttributes({ caption })
  }

  function handleCaptionKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const targetBtn = event.shiftKey ? removeBtnEl : replaceBtnEl
      if (targetBtn) {
        event.preventDefault()
        event.stopPropagation()
        targetBtn.focus()
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
          bind:this={replaceBtnEl}
          type="button"
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/90 border border-border px-3 py-1.5 text-xs font-medium text-foreground shadow-sm flex items-center gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-opacity cursor-pointer z-10"
          onclick={handleReplaceImage}
          onkeydown={(event) => {
            if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const nextEl = event.shiftKey ? captionInputEl : removeBtnEl
              if (nextEl) {
                event.preventDefault()
                event.stopPropagation()
                nextEl.focus()
              }
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              event.stopPropagation()
              captionInputEl?.focus()
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              const pos = (getPos as () => number)()
              editor.chain().focus().setTextSelection(Math.max(pos - 1, 0)).run()
            }
          }}
          aria-label="Replace image"
        >
          <ImagePlus class="size-3.5" aria-hidden="true" />
          <span>Replace</span>
        </button>
        <button
          bind:this={removeBtnEl}
          type="button"
          class="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border text-foreground shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-opacity cursor-pointer z-10"
          onclick={deleteNode}
          onkeydown={(event) => {
            if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const nextEl = event.shiftKey ? replaceBtnEl : captionInputEl
              if (nextEl) {
                event.preventDefault()
                event.stopPropagation()
                nextEl.focus()
              }
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              event.stopPropagation()
              captionInputEl?.focus()
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              const pos = (getPos as () => number)()
              editor.chain().focus().setTextSelection(Math.max(pos - 1, 0)).run()
            }
          }}
          aria-label="Remove image"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      {/if}
    </div>
    {#if editable || caption || modalCharRange}
      <figcaption class="mt-2">
        {#if editable}
          <input
            bind:this={captionInputEl}
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
        {:else if modalCharRange}
          <span data-image-caption-text
            >{caption.slice(0, modalCharRange.from)}<span
              class="pm-modal-cursor"
              data-pm-modal-cursor="normal"
              >{caption.slice(modalCharRange.from, modalCharRange.to) || '\u00a0'}</span
            >{caption.slice(modalCharRange.to)}</span
          >
        {:else}
          <span data-image-caption-text>{caption}</span>
        {/if}
      </figcaption>
    {/if}
  </figure>
</NodeViewWrapper>
