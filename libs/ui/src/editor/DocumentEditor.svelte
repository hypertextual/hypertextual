<script lang="ts">
  import LocalEditor from './components/Editor.svelte'
  import { tick, onMount } from 'svelte'
  import type { DocumentEditorProps, EditorHandle } from './types'

  // Props ---------------------------------------------------------------------
  let {
    document,
    editable = true,
    onchange,
    onUpload,
    onmodechange,
  }: DocumentEditorProps = $props()

  // State ---------------------------------------------------------------------
  let view = $state<EditorHandle>()
  let editing = $state(false)
  let surface: HTMLDivElement

  // Lifecycle -----------------------------------------------------------------
  onMount(() => {
    window.addEventListener('keydown', exitEdit, true)
    return () => window.removeEventListener('keydown', exitEdit, true)
  })

  // Methods -------------------------------------------------------------------
  export function focus() {
    enterEdit()
    void tick().then(() => view?.focus())
  }

  function enterEdit() {
    if (!editable || editing) return
    editing = true
    onmodechange?.('edit')
  }

  function exitEdit(event: KeyboardEvent) {
    if (
      event.key !== 'Escape' ||
      event.isComposing ||
      !editing ||
      !(event.target instanceof Element) ||
      (!surface.contains(event.target) && !event.target.closest('[data-editor-controls]'))
    )
      return
    event.preventDefault()
    event.stopPropagation()
    editing = false
    onmodechange?.('view')
  }
</script>

<div bind:this={surface} data-editor-mode={editing && editable ? 'edit' : 'view'}>
  <LocalEditor
    bind:this={view}
    content={document}
    editable={editable && editing}
    onedit={editable ? enterEdit : undefined}
    enforceTitle={false}
    {onUpload}
    {onchange}
  />
</div>
