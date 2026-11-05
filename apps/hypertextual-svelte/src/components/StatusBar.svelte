<script lang="ts">
  import { WhichKeyMode } from '@cloudvoyant/helical-svelte'
  import { Breadcrumb } from '@hypertextual/ui'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface StatusBarProps {
    workspace: WorkspaceService
  }
  let { workspace }: StatusBarProps = $props()

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

<footer class="document-status" role="status" aria-live="polite">
  {#if editor.selected}
    <Breadcrumb items={crumbs} label="Article path" title={editor.selected.path} />
  {:else}<span>No article selected</span>{/if}
  <div class="document-state">
    <WhichKeyMode showPreset aria-label="Editor mode" />
    <span class={{ error: Boolean(editor.codecError || editor.save.error) }}>{editor.status}</span>
  </div>
</footer>
