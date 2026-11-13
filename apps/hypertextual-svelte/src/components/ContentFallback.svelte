<script lang="ts">
  import { Button, Scroll } from '@cloudvoyant/helical-svelte'
  import { FileText, FileWarning } from 'lucide-svelte'
  import type { EditorService } from '../services/editorService.svelte'

  // Props ---------------------------------------------------------------------
  interface ContentFallbackProps {
    editor: EditorService
  }
  let { editor }: ContentFallbackProps = $props()
</script>

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
{:else if editor.unsupported && editor.selected}
  <div class="empty-pane">
    <FileWarning size={32} strokeWidth={1.5} />
    <h1>Unsupported file type</h1>
    <p>{editor.selected.name} cannot be opened in the editor.</p>
    <Button variant="outline" size="sm" onclick={() => void editor.openInDefaultApp()}
      >Open In Default App</Button
    >
  </div>
{:else if editor.image && editor.selected}
  <div class="image-preview"><img src={editor.image} alt={editor.selected.name} /></div>
{:else if editor.document && editor.selected}
  <Scroll class="min-h-0 flex-1" contentClass="source-preview p-6">
    <p class="readonly-notice mb-5 text-xs text-muted-foreground">{editor.document.reason}</p>
    <pre
      aria-label="Original article source"
      class="whitespace-pre-wrap break-words text-xs">{editor.document.source}</pre>
  </Scroll>
{:else}
  <div class="empty-pane">
    <FileText size={32} strokeWidth={1.5} />
    <h1>Your workspace, ready to write.</h1>
    <p>Select an article from the sidebar, or create a new one.</p>
  </div>
{/if}
