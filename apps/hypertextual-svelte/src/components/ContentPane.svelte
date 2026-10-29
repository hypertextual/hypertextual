<script lang="ts">
  import { Button } from '@cloudvoyant/helical-svelte'
  import { Breadcrumb, DocumentEditor } from '@hypertextual/ui'
  import { FileText } from 'lucide-svelte'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface ContentPaneProps {
    workspace: WorkspaceService
  }
  let { workspace }: ContentPaneProps = $props()

  // Derived -------------------------------------------------------------------
  const editor = $derived(workspace.editor)
  const crumbs = $derived(
    editor.selected
      ? [
          'Local workspace',
          ...editor.selected.path.split('/').slice(0, -1),
          workspace.selectedTitle,
        ]
      : ['Local workspace'],
  )
</script>

<main class="document-pane" aria-label="Article">
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
    {#key editor.version}
      {#if editor.document.content}
        <DocumentEditor
          document={editor.document.content}
          editable={editor.editable && !workspace.blocked}
          oneditablechange={(editable) => editor.setEditable(editable && !workspace.blocked)}
          class="article-scroll"
          contentClass="article-editor"
          onchange={(document) => editor.change(document)}
          onUpload={(file) => editor.upload(file)}
        />
      {:else}
        <div class="source-preview min-h-0 flex-1 overflow-auto p-6">
          <p class="readonly-notice mb-5 text-xs text-muted-foreground">{editor.document.reason}</p>
          <pre
            aria-label="Original article source"
            class="whitespace-pre-wrap break-words text-xs">{editor.document.source}</pre>
        </div>
      {/if}
    {/key}
  {:else}
    <div class="empty-pane">
      <FileText size={32} strokeWidth={1.5} />
      <h1>Your workspace, ready to write.</h1>
      <p>Select an article from the sidebar, or create a new one.</p>
    </div>
  {/if}
  <footer class="document-status" role="status" aria-live="polite">
    {#if editor.selected}
      <Breadcrumb items={crumbs} label="Article path" title={editor.selected.path} />
    {:else}<span>No article selected</span>{/if}
    <div class="document-state">
      {#if editor.document?.content}<span aria-label="Editor mode"
          >{editor.editable ? 'Edit' : 'View'}</span
        >{/if}
      <span class={{ error: Boolean(editor.codecError || editor.save.error) }}>{editor.status}</span
      >
    </div>
  </footer>
</main>
