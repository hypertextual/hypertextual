<script lang="ts">
  import { tick } from 'svelte'
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import { FileViewer } from '../../file-viewer'
  import { captionInput, imageSurface } from './styles'
  import type { ImageNodeViewProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    node,
    editable,
    mode,
    subtextRange,
    deleteNode,
    updateAttributes,
    editor,
    getPos,
  }: ImageNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  let fileViewer = $state<ReturnType<typeof FileViewer> | null>(null)
  let wrapperEl = $state<HTMLDivElement | null>(null)
  let captionFocused = $state(false)
  let isFullscreen = $state(false)
  let scale = $state(1)
  let panX = $state(0)
  let panY = $state(0)

  // Derived -------------------------------------------------------------------
  const src = $derived(String(node.attrs.src ?? ''))
  const srcset = $derived(node.attrs.srcset as string | undefined)
  const alt = $derived(String(node.attrs.alt ?? ''))
  let caption = $derived(String(node.attrs.caption ?? ''))

  const portableSource = $derived(editor.services.media?.toPortableSource(src) ?? src)
  const canOpenExternal = $derived(
    Boolean(
      editor.services.openExternal &&
        portableSource &&
        !/^https?:|^data:|^blob:/i.test(portableSource),
    ),
  )
  const imageTitle = $derived.by(() => {
    const clean = portableSource.split(/[?#]/)[0] ?? ''
    return clean.split('/').pop() || alt || 'Image'
  })

  // Lifecycle -----------------------------------------------------------------
  useKeymap(
    () => ({
      Escape: {
        key: 'Escape',
        label: 'Minimize Image Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
      f: {
        key: 'f',
        label: 'Minimize Image Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
      q: {
        key: 'q',
        label: 'Minimize Image Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
    }),
    {
      priority: 'overlay',
      enabled: () => isFullscreen,
    },
  )

  // Methods -------------------------------------------------------------------
  function closeFullscreen(): boolean {
    if (!isFullscreen) return false
    isFullscreen = false
    return true
  }

  function handleOpenExternal() {
    if (!canOpenExternal) return
    void editor.services.openExternal?.(portableSource)
  }

  function handleReplaceImage() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos === 'number') {
      editor.openOverlay('image', {
        position: pos,
        data: { replace: true, src },
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

  $effect(() => {
    const hostEl = wrapperEl?.closest<HTMLElement>('.node-imageNode') ?? wrapperEl
    if (!hostEl) return
    const onFullscreenEvent = () => {
      isFullscreen = !isFullscreen
    }
    hostEl.addEventListener('htmd:image-fullscreen', onFullscreenEvent)
    return () => hostEl.removeEventListener('htmd:image-fullscreen', onFullscreenEvent)
  })

  $effect(() => {
    if (isFullscreen) {
      void tick().then(() => fileViewer?.focus())
    }
  })
</script>

<div
  bind:this={wrapperEl}
  data-node-view-wrapper=""
  data-image-node=""
  role="none"
  style="white-space: normal;"
  class={imageSurface}
  contenteditable={false}
>
  <figure class="m-0">
    <FileViewer
      bind:this={fileViewer}
      kind="image"
      title={imageTitle}
      {src}
      {srcset}
      sizes="(max-width: 768px) 100vw, 720px"
      {alt}
      {mode}
      externalAppLabel="Open"
      replaceLabel="Replace image"
      removeLabel="Remove image"
      bind:fullscreen={isFullscreen}
      bind:scale
      bind:panX
      bind:panY
      onopenexternal={canOpenExternal ? handleOpenExternal : undefined}
      onreplace={handleReplaceImage}
      onremove={deleteNode}
      class="my-0"
    />

    {#if editable || caption.length > 0}
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
