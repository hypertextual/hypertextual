<script lang="ts">
  import { tick } from 'svelte'
  import { useKeymap } from '@cloudvoyant/helical-svelte'
  import { FileViewer, type FileViewerKind } from '../../../file-viewer'
  import { captionInput } from '../styles'
  import type { DrawioNodeViewProps } from './types'

  // Props ---------------------------------------------------------------------
  let {
    editor,
    node,
    editable,
    mode,
    selected,
    subtextRange,
    getPos,
    updateAttributes,
    deleteNode,
  }: DrawioNodeViewProps = $props()

  // State ---------------------------------------------------------------------
  const PAN_STEP = 48
  const ZOOM_STEP = 0.25
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4.0

  let fileViewer = $state<ReturnType<typeof FileViewer> | null>(null)
  let wrapperEl = $state<HTMLDivElement | null>(null)

  let scale = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  let isFullscreen = $state(false)
  let isBlockActive = $state(false)
  let captionFocused = $state(false)
  let displaySrcOverride = $state<string | null>(null)
  let xmlSource = $state('')
  let pendingExternalRefresh = false

  // Derived -------------------------------------------------------------------
  const nodeSrc = $derived(String(node.attrs.src ?? ''))
  const effectiveSrc = $derived(displaySrcOverride ?? nodeSrc)
  const alt = $derived(String(node.attrs.alt ?? ''))
  let caption = $derived(String(node.attrs.caption ?? ''))

  const portableSource = $derived(
    editor.services.media?.toPortableSource(nodeSrc) ?? nodeSrc,
  )

  const viewerKind = $derived<FileViewerKind>(
    portableSource.toLowerCase().endsWith('.drawio') ||
      effectiveSrc.startsWith('data:application/vnd.jgraph.mxfile')
      ? 'drawio-xml'
      : 'drawio-image',
  )

  const diagramTitle = $derived.by(() => {
    const clean = portableSource.split(/[?#]/)[0] ?? ''
    const base = clean.split('/').pop()
    return base || 'Draw.io'
  })

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    // Reset local override when the underlying node src attribute changes (e.g. Replace).
    void nodeSrc
    displaySrcOverride = null
  })

  $effect(() => {
    if (viewerKind !== 'drawio-xml') {
      xmlSource = ''
      return
    }
    void loadXmlFromSource(effectiveSrc)
  })

  $effect(() => {
    if (typeof window === 'undefined') return
    const onFocus = () => {
      if (!pendingExternalRefresh) return
      pendingExternalRefresh = false
      void handleRefresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  })

  $effect(() => {
    syncActiveState()
    return editor.subscribe(syncActiveState)
  })

  $effect(() => {
    const hostEl = wrapperEl?.closest<HTMLElement>('.node-drawio') ?? wrapperEl
    if (!hostEl) return
    const onViewportEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          state?: { scale: number; panX: number; panY: number; fullscreen: boolean }
        }>
      ).detail
      if (!detail?.state) return
      scale = detail.state.scale
      panX = detail.state.panX
      panY = detail.state.panY
      if (detail.state.fullscreen !== isFullscreen) {
        isFullscreen = detail.state.fullscreen
        if (isFullscreen) {
          void tick().then(() => fileViewer?.focus())
        }
      }
    }
    hostEl.addEventListener('htmd:drawio-viewport', onViewportEvent)
    return () => hostEl.removeEventListener('htmd:drawio-viewport', onViewportEvent)
  })

  useKeymap(
    () => ({
      Space: {
        key: 'Space',
        label: '+leader',
        group: 'Leader',
        category: 'Leader',
        mode: ['normal', 'select'],
        children: {
          d: {
            key: 'd',
            label: '+drawio',
            group: 'Draw.io',
            category: 'Draw.io',
            children: {
              f: {
                key: 'f',
                label: 'Toggle Draw.io Fullscreen',
                category: 'Draw.io',
                action: () => toggleFullscreen(),
              },
            },
          },
          w: {
            key: 'w',
            label: '+window',
            group: 'Window',
            category: 'Window',
            children: {
              z: {
                key: 'z',
                label: 'Toggle Draw.io Maximize',
                category: 'Window',
                action: () => toggleFullscreen(),
              },
            },
          },
        },
      },
      'Control+w': {
        key: 'Control+w',
        label: '+window',
        group: 'Window',
        category: 'Window',
        mode: ['normal', 'select', 'insert'],
        children: {
          z: {
            key: 'z',
            label: 'Toggle Draw.io Maximize',
            category: 'Window',
            action: () => toggleFullscreen(),
          },
        },
      },
    }),
    {
      priority: 'extension',
      enabled: () => isBlockActive || isFullscreen,
    },
  )

  useKeymap(
    () => ({
      Escape: {
        key: 'Escape',
        label: 'Minimize Draw.io Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
      f: {
        key: 'f',
        label: 'Minimize Draw.io Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
      q: {
        key: 'q',
        label: 'Minimize Draw.io Fullscreen',
        mode: 'normal',
        hidden: true,
        action: () => closeFullscreen(),
      },
      h: {
        key: 'h',
        label: 'Pan Draw.io Left',
        mode: 'normal',
        hidden: true,
        action: () => panBy(-PAN_STEP, 0),
      },
      j: {
        key: 'j',
        label: 'Pan Draw.io Down',
        mode: 'normal',
        hidden: true,
        action: () => panBy(0, PAN_STEP),
      },
      k: {
        key: 'k',
        label: 'Pan Draw.io Up',
        mode: 'normal',
        hidden: true,
        action: () => panBy(0, -PAN_STEP),
      },
      l: {
        key: 'l',
        label: 'Pan Draw.io Right',
        mode: 'normal',
        hidden: true,
        action: () => panBy(PAN_STEP, 0),
      },
      '+': {
        key: '+',
        label: 'Zoom In Draw.io',
        mode: 'normal',
        hidden: true,
        action: () => zoomBy(ZOOM_STEP),
      },
      '=': {
        key: '=',
        label: 'Zoom In Draw.io',
        mode: 'normal',
        hidden: true,
        action: () => zoomBy(ZOOM_STEP),
      },
      '-': {
        key: '-',
        label: 'Zoom Out Draw.io',
        mode: 'normal',
        hidden: true,
        action: () => zoomBy(-ZOOM_STEP),
      },
      '0': {
        key: '0',
        label: 'Reset Draw.io Zoom',
        mode: 'normal',
        hidden: true,
        action: () => resetViewport(),
      },
    }),
    {
      priority: 'overlay',
      enabled: () => isFullscreen,
    },
  )

  // Methods -------------------------------------------------------------------
  async function loadXmlFromSource(url: string) {
    if (!url) {
      xmlSource = ''
      return
    }
    try {
      if (url.startsWith('data:')) {
        const comma = url.indexOf(',')
        if (comma !== -1) {
          const header = url.slice(0, comma)
          const body = url.slice(comma + 1)
          xmlSource = header.includes(';base64')
            ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
            : decodeURIComponent(body)
          return
        }
      }
      if (url.startsWith('blob:') || /^https?:/i.test(url)) {
        const res = await fetch(url)
        if (res.ok) {
          xmlSource = await res.text()
        }
      }
    } catch {
      // Keep previous XML if fetch fails
    }
  }

  function syncActiveState() {
    const pos = getPos?.()
    if (typeof pos !== 'number') {
      isBlockActive = Boolean(selected)
      return
    }
    const sel = editor.getSelectionState()
    isBlockActive = Boolean(selected) || (sel.from >= pos && sel.to <= pos + node.nodeSize)
  }

  function syncDatasetState() {
    const hostEl = wrapperEl?.closest<HTMLElement>('.node-drawio') ?? wrapperEl
    if (!hostEl) return
    hostEl.dataset.drawioScale = String(scale)
    hostEl.dataset.drawioPanX = String(panX)
    hostEl.dataset.drawioPanY = String(panY)
    hostEl.dataset.drawioFullscreen = String(isFullscreen)
  }

  function zoomBy(delta: number): boolean {
    scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((scale + delta) * 100) / 100))
    syncDatasetState()
    return true
  }

  function panBy(dx: number, dy: number): boolean {
    panX += dx
    panY += dy
    syncDatasetState()
    return true
  }

  function resetViewport(): boolean {
    scale = 1
    panX = 0
    panY = 0
    syncDatasetState()
    return true
  }

  function toggleFullscreen(): boolean {
    isFullscreen = !isFullscreen
    syncDatasetState()
    if (isFullscreen) {
      void tick().then(() => fileViewer?.focus())
    }
    return true
  }

  function closeFullscreen(): boolean {
    if (!isFullscreen) return false
    isFullscreen = false
    syncDatasetState()
    return true
  }

  function handleOpenExternal() {
    if (!portableSource) return
    pendingExternalRefresh = true
    void editor.services.openExternal?.(portableSource)
  }

  async function handleRefresh() {
    if (!portableSource || !editor.services.media) return
    try {
      const asset = await editor.services.media.get(portableSource)
      displaySrcOverride = asset.url
      if (viewerKind === 'drawio-xml') {
        await loadXmlFromSource(asset.url)
      }
    } catch {
      // Retain existing preview on transient read failure
    }
  }

  function handleReplace() {
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (typeof pos === 'number') {
      editor.openOverlay('drawio', {
        position: pos,
        data: { replace: true, src: nodeSrc },
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
  bind:this={wrapperEl}
  data-node-view-wrapper=""
  data-drawio-node=""
  data-drawio-mode={mode}
  data-drawio-scale={scale}
  data-drawio-pan-x={panX}
  data-drawio-pan-y={panY}
  data-drawio-fullscreen={isFullscreen ? 'true' : 'false'}
  role="none"
  contenteditable={false}
  class="my-4"
>
  <figure class="m-0">
    <FileViewer
      bind:this={fileViewer}
      kind={viewerKind}
      title={diagramTitle}
      src={effectiveSrc}
      xml={xmlSource}
      {alt}
      {mode}
      bind:fullscreen={isFullscreen}
      bind:scale
      bind:panX
      bind:panY
      onopenexternal={editor.services.openExternal ? handleOpenExternal : undefined}
      onrefresh={editor.services.media ? handleRefresh : undefined}
      onreplace={handleReplace}
      onremove={deleteNode}
      onviewportchange={syncDatasetState}
      class="my-0"
    />

    {#if editable || caption || subtextRange}
      <figcaption class="mt-2">
        {#if editable}
          <input
            type="text"
            aria-label="Diagram caption"
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
          <span data-drawio-caption-text=""
            >{caption.slice(0, subtextRange.from)}<span
              class="pm-modal-cursor"
              data-pm-modal-cursor="normal"
              >{caption.slice(subtextRange.from, subtextRange.to) || '\u00a0'}</span
            >{caption.slice(subtextRange.to)}</span
          >
        {:else}
          <span data-drawio-caption-text="">{caption}</span>
        {/if}
      </figcaption>
    {/if}
  </figure>
</div>
