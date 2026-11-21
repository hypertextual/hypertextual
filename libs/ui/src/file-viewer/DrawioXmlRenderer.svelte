<script lang="ts">
  import { PanZoomViewport } from '../diagram-viewport'
  import type { PanZoomViewportState } from '../diagram-viewport/types'
  import { fileViewerStyles } from './styles'

  // Props ---------------------------------------------------------------------
  interface DrawioXmlRendererProps {
    xml: string
    viewerScriptUrl?: string
    scale?: number
    panX?: number
    panY?: number
    tabindex?: number
    ariaLabel?: string
    onviewportchange?: (state: PanZoomViewportState) => void
    onfocus?: (event: FocusEvent) => void
    onkeydown?: (event: KeyboardEvent) => void
    class?: string
  }

  let {
    xml,
    viewerScriptUrl = '/vendor/drawio/viewer-static.min.js',
    scale = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    tabindex = -1,
    ariaLabel = 'Draw.io XML preview',
    onviewportchange,
    onfocus,
    onkeydown,
    class: className,
  }: DrawioXmlRendererProps = $props()

  // State ---------------------------------------------------------------------
  let viewport = $state<ReturnType<typeof PanZoomViewport> | null>(null)
  let hostEl = $state<HTMLDivElement | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const sourceXml = xml
    const container = hostEl
    if (!container || !sourceXml) return
    void renderXml(container, sourceXml)
  })

  // Methods -------------------------------------------------------------------
  async function ensureViewerScript(scriptUrl: string): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const win = window as unknown as {
      GraphViewer?: { processElements?: () => void; createViewerForElement?: (el: Element) => void }
      __drawioViewerLoadPromise?: Promise<void>
    }
    if (win.GraphViewer) return
    if (!win.__drawioViewerLoadPromise) {
      win.__drawioViewerLoadPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = scriptUrl
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Could not load Draw.io viewer script.'))
        document.head.appendChild(script)
      })
    }
    await win.__drawioViewerLoadPromise
  }

  async function renderXml(container: HTMLDivElement, sourceXml: string) {
    loading = true
    error = null
    try {
      await ensureViewerScript(viewerScriptUrl)
      container.innerHTML = ''
      const graphEl = document.createElement('div')
      graphEl.className = 'mxgraph'
      graphEl.style.maxWidth = '100%'
      graphEl.setAttribute(
        'data-mxgraph',
        JSON.stringify({
          highlight: '#0000ff',
          nav: true,
          resize: true,
          toolbar: 'pages layers',
          'dark-mode': 'auto',
          xml: sourceXml,
        }),
      )
      container.appendChild(graphEl)
      const win = window as unknown as {
        GraphViewer?: {
          createViewerForElement?: (el: Element) => void
          processElements?: () => void
        }
      }
      if (typeof win.GraphViewer?.createViewerForElement === 'function') {
        win.GraphViewer.createViewerForElement(graphEl)
      } else {
        win.GraphViewer?.processElements?.()
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not render Draw.io diagram.'
    } finally {
      loading = false
    }
  }

  export function focus() {
    viewport?.focus()
  }

  export function zoomBy(delta = 0.25): boolean {
    return viewport?.zoomBy(delta) ?? false
  }

  export function panBy(dx = 0, dy = 48): boolean {
    return viewport?.panBy(dx, dy) ?? false
  }

  export function resetViewport(): boolean {
    return viewport?.resetViewport() ?? false
  }
</script>

<PanZoomViewport
  bind:this={viewport}
  bind:scale
  bind:panX
  bind:panY
  {tabindex}
  {ariaLabel}
  {onviewportchange}
  {onfocus}
  {onkeydown}
  data-file-viewer-viewport=""
  data-drawio-xml-viewport=""
  class={className}
>
  <div class={fileViewerStyles.xmlContainer}>
    <div bind:this={hostEl} data-drawio-xml-host=""></div>
    {#if loading}
      <span class="text-xs text-muted-foreground">Rendering Draw.io diagram…</span>
    {:else if error}
      <span role="alert" class="text-xs text-destructive">{error}</span>
    {/if}
  </div>
</PanZoomViewport>
