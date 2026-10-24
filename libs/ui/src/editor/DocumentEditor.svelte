<script lang="ts">
  import { Editor as HelicalEditor } from '@cloudvoyant/helical-svelte'
  import type { DocumentEditorProps, EditorHandle } from './types'

  // Props ---------------------------------------------------------------------
  let { document, editable = true, onchange, onerror }: DocumentEditorProps = $props()

  // State ---------------------------------------------------------------------
  let view = $state<EditorHandle>()

  // Methods -------------------------------------------------------------------
  export function focus() {
    view?.focus()
  }

  function change(content: string) {
    try {
      onchange(document.update(content))
    } catch (error) {
      onerror({
        message: error instanceof Error ? error.message : String(error),
        title: document.title,
      })
    }
  }
</script>

{#if document.editable}
  <HelicalEditor
    bind:this={view}
    content={document.content}
    {editable}
    enforceTitle={false}
    onUpload={(file) => document.upload(file)}
    onchange={({ content }) => change(content)}
  />
{:else}
  <div class="source-preview p-6">
    <p class="readonly-notice mb-5 text-xs text-muted-foreground">{document.reason}</p>
    <pre
      aria-label="Original article source"
      class="whitespace-pre-wrap break-words text-xs">{document.source}</pre>
  </div>
{/if}
