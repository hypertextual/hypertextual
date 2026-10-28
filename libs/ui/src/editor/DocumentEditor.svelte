<script lang="ts">
  import LocalEditor from './components/Editor.svelte'
  import type { DocumentEditorProps, EditorHandle } from './types'

  // Props ---------------------------------------------------------------------
  let { document, editable = true, onchange, onUpload }: DocumentEditorProps = $props()

  // State ---------------------------------------------------------------------
  let view = $state<EditorHandle>()

  // Methods -------------------------------------------------------------------
  export function focus() {
    view?.focus()
  }
</script>

<LocalEditor
  bind:this={view}
  content={document}
  {editable}
  enforceTitle={false}
  {onUpload}
  {onchange}
/>
