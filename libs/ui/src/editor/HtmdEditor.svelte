<script lang="ts">
  import LocalEditor from './components/Editor.svelte'
  import { tick } from 'svelte'
  import {
    ScrollAreaContent,
    ScrollAreaRoot,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from '@ark-ui/svelte/scroll-area'
  import {
    cn,
    scrollContentBase,
    scrollRootBase,
    scrollScrollbarBase,
    scrollThumbBase,
    scrollViewportBase,
  } from '@cloudvoyant/helical-ui'
  import { useOptionalWhichKeyController } from '@cloudvoyant/helical-svelte'
  import { editorViewport } from './styles'
  import type { HtmdEditorProps, EditorHandle } from './types'

  // Props ---------------------------------------------------------------------
  let {
    document,
    editable = false,
    clickToEdit = true,
    onchange,
    onUpload,
    oneditablechange,
    class: className,
    contentClass,
    services,
  }: HtmdEditorProps = $props()

  // State ---------------------------------------------------------------------
  const whichKeyController = useOptionalWhichKeyController()

  let view = $state<EditorHandle>()
  let surface = $state<HTMLDivElement | null>(null)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    if (!whichKeyController || !surface) return
    const scrollEl = surface
    const isArticleTarget = () => {
      const active = window.document.activeElement
      return !active || active === scrollEl || scrollEl.contains(active)
    }
    const alignCursor = (where: 'center' | 'top' | 'bottom'): boolean => {
      if (!isArticleTarget()) return false
      const cursorEl = scrollEl.querySelector<HTMLElement>(
        '[data-pm-modal-cursor], [data-pm-modal-node-selection]',
      )
      if (!cursorEl) return false
      const containerRect = scrollEl.getBoundingClientRect()
      const cursorRect = cursorEl.getBoundingClientRect()
      const pad = 16
      if (where === 'center') {
        scrollEl.scrollTop +=
          cursorRect.top + cursorRect.height / 2 - (containerRect.top + containerRect.height / 2)
      } else if (where === 'top') {
        scrollEl.scrollTop += cursorRect.top - (containerRect.top + pad)
      } else {
        scrollEl.scrollTop += cursorRect.bottom - (containerRect.bottom - pad)
      }
      return true
    }
    const stepScroll = (dir: 1 | -1, count: number): boolean => {
      if (!isArticleTarget()) return false
      const step = Math.max(120, Math.round(scrollEl.clientHeight * 0.5)) * Math.max(1, count)
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + dir * step)
      return true
    }
    const cleanups = [
      whichKeyController.registerCommand('view.center', () => alignCursor('center')),
      whichKeyController.registerCommand('view.top', () => alignCursor('top')),
      whichKeyController.registerCommand('view.bottom', () => alignCursor('bottom')),
      whichKeyController.registerCommand('view.scrollDown', (ctx) => stepScroll(1, ctx.count)),
      whichKeyController.registerCommand('view.scrollUp', (ctx) => stepScroll(-1, ctx.count)),
    ]
    return () => {
      for (const fn of cleanups) fn()
    }
  })

  $effect(() => {
    if (!editable)
      void tick().then(() => {
        if (!editable) surface?.focus({ preventScroll: true })
      })
  })

  // Methods -------------------------------------------------------------------
  export function focus() {
    if (enterEdit()) void tick().then(() => view?.focus())
  }

  function enterEdit(): boolean {
    return oneditablechange?.(true) ?? false
  }

  function exitToNormal() {
    oneditablechange?.(false)
    whichKeyController?.setMode('normal')
  }
</script>

<!-- Native scroll-region focus lets arrow and page keys scroll in view state. -->
<ScrollAreaRoot class={cn(scrollRootBase, 'min-h-0 flex-1')}>
  <ScrollAreaViewport
    bind:ref={surface}
    data-pane-focus-target=""
    tabindex={0}
    role="region"
    aria-label="Article content"
    class={cn(scrollViewportBase, editorViewport, className)}
  >
    <ScrollAreaContent class={scrollContentBase}>
      <div class={contentClass}>
        <LocalEditor
          bind:this={view}
          content={document}
          {editable}
          {clickToEdit}
          onedit={enterEdit}
          onexit={exitToNormal}
          enforceTitle={false}
          {onUpload}
          {onchange}
          {services}
        />
      </div>
    </ScrollAreaContent>
  </ScrollAreaViewport>
  <ScrollAreaScrollbar orientation="vertical" class={scrollScrollbarBase}>
    <ScrollAreaThumb class={scrollThumbBase} />
  </ScrollAreaScrollbar>
</ScrollAreaRoot>
