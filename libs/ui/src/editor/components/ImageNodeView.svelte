<script lang="ts">
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'
  import { useKeyScope } from '../../key-scope/useKeyScope.svelte'
  import { ImagePlus, X } from 'lucide-svelte'
  import { createSubscriber } from 'svelte/reactivity'

  // Props ---------------------------------------------------------------------
  let { node, deleteNode, updateAttributes, editor, getPos }: ImageNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const subscribe = createSubscriber((update) => editor.subscribe(update))
  let wrapperEl = $state<HTMLDivElement | null>(null)
  let captionFocused = $state(false)

  let captionInputEl = $state<HTMLInputElement>()

  let replaceBtnEl = $state<HTMLButtonElement>()

  let removeBtnEl = $state<HTMLButtonElement>()

  // Derived -------------------------------------------------------------------
  const editable = $derived.by(() => {
    subscribe()
    return editor.isEditable && editor.isInsertMode
  })
  const src = $derived(node.attrs.src as string | undefined)
  const srcset = $derived(node.attrs.srcset as string | undefined)
  const alt = $derived(node.attrs.alt as string | undefined)

  let caption = $derived((node.attrs.caption as string | undefined) || '')

  const modalSubtext = $derived.by(() => {
    subscribe()
    const st = editor.getSubtextCursor()
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

  // Lifecycle -----------------------------------------------------------------
  useKeyScope({
    id: 'widget:image',
    priority: 'widget',
    element: () => wrapperEl,
    enabled: () => editable && Boolean(wrapperEl),
    hotkeys: () => editor.services.hotkeys,
    getContext: () => null,
    keymap: {
      Tab: {
        id: 'image.tabNext',
        key: 'Tab',
        label: 'Next Image Control',
        run: (_ctx, event) => {
          const target = event.target
          if (target === captionInputEl && replaceBtnEl) {
            replaceBtnEl.focus()
            return true
          }
          if (target === replaceBtnEl && removeBtnEl) {
            removeBtnEl.focus()
            return true
          }
          if (target === removeBtnEl && captionInputEl) {
            captionInputEl.focus()
            return true
          }
          return false
        },
      },
      'Shift+Tab': {
        id: 'image.tabPrev',
        key: 'Shift+Tab',
        label: 'Previous Image Control',
        run: (_ctx, event) => {
          const target = event.target
          if (target === captionInputEl && removeBtnEl) {
            removeBtnEl.focus()
            return true
          }
          if (target === replaceBtnEl && captionInputEl) {
            captionInputEl.focus()
            return true
          }
          if (target === removeBtnEl && replaceBtnEl) {
            replaceBtnEl.focus()
            return true
          }
          return false
        },
      },
      ArrowUp: {
        id: 'image.focusBefore',
        key: 'ArrowUp',
        label: 'Focus Above Image',
        run: (_ctx, event) => {
          const target = event.target
          const pos = getPos()
          if (typeof pos !== 'number') return false
          if (target === captionInputEl) {
            updateAttributes({ caption })
            editor.focusBeforePosition(pos)
            return true
          }
          if (target === replaceBtnEl || target === removeBtnEl) {
            editor.focusBeforePosition(pos)
            return true
          }
          return false
        },
      },
      ArrowDown: {
        id: 'image.focusAfter',
        key: 'ArrowDown',
        label: 'Focus Below Image',
        run: (_ctx, event) => {
          const target = event.target
          const pos = getPos()
          if (typeof pos !== 'number') return false
          if (target === captionInputEl) {
            updateAttributes({ caption })
            editor.focusAfterPosition(pos + node.nodeSize)
            return true
          }
          if (target === replaceBtnEl || target === removeBtnEl) {
            captionInputEl?.focus()
            return true
          }
          return false
        },
      },
      Enter: {
        id: 'image.splitCaption',
        key: 'Enter',
        label: 'Split Caption to Paragraph',
        run: (_ctx, event) => {
          if (event.target !== captionInputEl || !captionInputEl) return false
          const pos = getPos()
          if (typeof pos !== 'number') return false
          const cursorIdx = captionInputEl.selectionStart ?? caption.length
          const leftText = caption.slice(0, cursorIdx)
          const rightText = caption.slice(cursorIdx)

          caption = leftText
          updateAttributes({ caption: leftText })

          const posAfter = pos + node.nodeSize
          editor.splitImageCaptionToParagraph(posAfter, rightText)
          return true
        },
      },
    },
  })

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

  function handleCaptionBlur() {
    captionFocused = false
    updateAttributes({ caption })
  }
</script>

<div
  bind:this={wrapperEl}
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
          bind:this={replaceBtnEl}
          type="button"
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-background/90 border border-border px-3 py-1.5 text-xs font-medium text-foreground shadow-sm flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors cursor-pointer z-10"
          onclick={handleReplaceImage}
          aria-label="Replace image"
        >
          <ImagePlus class="size-3.5" aria-hidden="true" />
          <span>Replace</span>
        </button>
        <button
          bind:this={removeBtnEl}
          type="button"
          class="absolute top-2 right-2 w-7 h-7 rounded-full bg-background border border-border text-foreground shadow-sm flex items-center justify-center hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:border-ring focus:ring-2 focus:ring-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring outline-none transition-colors cursor-pointer z-10"
          onclick={deleteNode}
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
</div>
