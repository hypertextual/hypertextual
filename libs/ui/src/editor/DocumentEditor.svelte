<script lang="ts">
  import LocalEditor from './components/Editor.svelte'
  import { tick, onMount } from 'svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import { editorViewport } from './styles'
  import type { DocumentEditorProps, EditorHandle } from './types'

  // Props ---------------------------------------------------------------------
  let {
    document,
    editable = false,
    onchange,
    onUpload,
    oneditablechange,
    class: className,
    contentClass,
  }: DocumentEditorProps = $props()

  // State ---------------------------------------------------------------------
  let view = $state<EditorHandle>()
  let surface = $state<HTMLDivElement>()

  // Lifecycle -----------------------------------------------------------------
  onMount(() => {
    window.addEventListener('keydown', exitEdit, true)
    return () => window.removeEventListener('keydown', exitEdit, true)
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

  function exitEdit(event: KeyboardEvent) {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      !editable ||
      !(event.target instanceof Element) ||
      (!surface?.contains(event.target) && !event.target.closest('[data-editor-controls]'))
    )
      return
    event.preventDefault()
    event.stopPropagation()
    oneditablechange?.(false)
  }
</script>

<!-- Native scroll-region focus lets arrow and page keys scroll in view state. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={surface}
  class={cn(editorViewport, className)}
  tabindex="0"
  role="region"
  aria-label="Article content"
>
  <div class={contentClass}>
    <LocalEditor
      bind:this={view}
      content={document}
      {editable}
      onedit={enterEdit}
      enforceTitle={false}
      {onUpload}
      {onchange}
    />
  </div>
</div>
