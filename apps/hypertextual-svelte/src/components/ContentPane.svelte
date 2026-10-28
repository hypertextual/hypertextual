<script lang="ts">
  import { tick } from 'svelte'
  import { Button } from '@cloudvoyant/helical-svelte'
  import { DocumentEditor, type EditorHandle } from '@hypertextual/ui'
  import { FileText } from 'lucide-svelte'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface ContentPaneProps {
    workspace: WorkspaceService
  }
  let { workspace }: ContentPaneProps = $props()

  // State ---------------------------------------------------------------------
  let view = $state<EditorHandle>()

  // Derived -------------------------------------------------------------------
  const editor = $derived(workspace.editor)

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    const request = editor.focusRequest
    if (request) void tick().then(() => view?.focus())
  })
</script>

<main class="document-pane" aria-label="Article">
  {#if editor.selected}
    <div class="document-heading">
      <span class="document-path" title={editor.selected.path}>{workspace.selectedTitle}</span>
      <span class="format-label">{editor.selected.name.split('.').at(-1)?.toUpperCase()}</span>
    </div>
  {/if}
  {#if editor.loading}
    <div class="empty-pane" role="status">Opening article…</div>
  {:else if editor.openingError}
    <div class="empty-pane">
      <p class="error" role="alert">{editor.openingError}</p>
      {#if editor.selected}<Button
          variant="outline"
          size="sm"
          onclick={() => editor.selected && editor.open(editor.selected)}>Retry opening</Button
        >{/if}
    </div>
  {:else if editor.image && editor.selected}
    <div class="image-preview"><img src={editor.image} alt={editor.selected.name} /></div>
  {:else if editor.document && editor.selected}
    <div class="article-scroll">
      <div class={{ 'article-editor': editor.document.editable }}>
        {#key editor.version}
          {#if editor.document.content}
            <DocumentEditor
              bind:this={view}
              document={editor.document.content}
              editable={!workspace.blocked}
              onchange={(document) => editor.change(document)}
              onUpload={(file) => editor.upload(file)}
            />
          {:else}
            <div class="source-preview p-6">
              <p class="readonly-notice mb-5 text-xs text-muted-foreground">
                {editor.document.reason}
              </p>
              <pre
                aria-label="Original article source"
                class="whitespace-pre-wrap break-words text-xs">{editor.document.source}</pre>
            </div>
          {/if}
        {/key}
      </div>
    </div>
  {:else}
    <div class="empty-pane">
      <FileText size={32} strokeWidth={1.5} />
      <h1>Your workspace, ready to write.</h1>
      <p>Select an article from the sidebar, or create a new one.</p>
    </div>
  {/if}
  <footer class="document-status" role="status" aria-live="polite">
    <span title={editor.selected?.path}>{workspace.selectedTitle}</span>
    <span class={{ error: Boolean(editor.codecError || editor.save.error) }}>{editor.status}</span>
  </footer>
</main>
