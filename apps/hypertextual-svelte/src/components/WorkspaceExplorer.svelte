<script lang="ts">
  import { TreeView } from '@hypertextual/ui'
  import { Folder, FolderOpen, FileText, Image } from 'lucide-svelte'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface WorkspaceExplorerProps {
    workspace: WorkspaceService
  }
  let { workspace }: WorkspaceExplorerProps = $props()

  // Methods -------------------------------------------------------------------
  function handleCancel(value: string): void {
    if (value === workspace.pendingEntry?.path) workspace.pendingEntry = null
    if (value === workspace.renamingPath) workspace.renamingPath = null
  }

  function handleSelect(path: string): void {
    if (workspace.editor.selected?.path === path) {
      workspace.hotkeys.focusArticlePane()
      return
    }
    void workspace.select(path)
  }
</script>

<TreeView
  label="Workspace files"
  nodes={workspace.nodes}
  renameValue={workspace.renamingPath ?? workspace.pendingEntry?.path}
  pendingNode={workspace.pendingNode}
  parentValue={workspace.pendingParent}
  refresh={workspace.refreshFolder}
  onaction={(path, action) => void workspace.contextAction(path, action)}
  contextItems={(node) => workspace.contextItems(node)}
  onrename={(path, name) => workspace.commitEntry(path, name)}
  oncancel={handleCancel}
  getLabel={(node) => workspace.titles[node.value] ?? node.label}
  selected={workspace.editor.selected?.path ?? null}
  onselect={handleSelect}
  loadChildren={(node) => workspace.loadChildren(node)}
>
  {#snippet icon(node, expanded)}
    {#if node.branch}
      {#if expanded}<FolderOpen size={13} strokeWidth={1.5} />{:else}<Folder
          size={13}
          strokeWidth={1.5}
        />{/if}
    {:else if /\.(png|jpe?g|gif|webp)$/i.test(node.label)}<Image size={13} strokeWidth={1.5} />
    {:else}<FileText size={13} strokeWidth={1.5} />{/if}
  {/snippet}
</TreeView>
