<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import {
    Button,
    Row,
    SidebarProvider,
    SidebarTrigger,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    Select,
    SelectTrigger,
    SelectValue,
    SelectIndicator,
    SelectContent,
    SelectItem,
    SelectItemText,
  } from '@cloudvoyant/helical-svelte'
  import { FilePlus2, FolderPlus, PanelLeft, ChevronDown } from 'lucide-svelte'
  import { isTauri } from '@tauri-apps/api/core'
  import { WorkspaceService } from '../services/workspaceService.svelte'
  import { attachDesktopLifecycle } from '../services/desktopLifecycle'
  import FileTree from './FileTree.svelte'
  import ArticlePane from './ArticlePane.svelte'
  import DraftRecoveryDialog from './DraftRecoveryDialog.svelte'
  import type { ShellProps } from './types'

  // Props ---------------------------------------------------------------------
  let { client }: ShellProps = $props()

  // State ---------------------------------------------------------------------
  const workspace = untrack(() => new WorkspaceService(client))
  const editor = workspace.editor

  // Lifecycle -----------------------------------------------------------------
  onMount(() => {
    void workspace.open()
    const detach = attachDesktopLifecycle(editor)
    return () => {
      detach()
      workspace.dispose()
    }
  })
</script>

<svelte:head><title>Hypertextual</title></svelte:head>
<svelte:window onbeforeunload={(event) => editor.beforeUnload(event)} />

<SidebarProvider class="workspace-shell" style="--sidebar-width: 236px">
  <header class="titlebar" data-tauri-drag-region>
    <SidebarTrigger title="Toggle sidebar" aria-controls="workspace-sidebar"
      ><PanelLeft size={14} strokeWidth={1.5} /></SidebarTrigger
    >
    <span class="brand" data-tauri-drag-region>hypertextual</span>
    <div class="workspace-chooser">
      <Select items={workspace.items} value={[workspace.root]} size="sm">
        <SelectTrigger aria-label="Workspace selector" title={workspace.root} size="sm"
          ><SelectValue /><SelectIndicator
            ><ChevronDown size={12} strokeWidth={1.5} /></SelectIndicator
          ></SelectTrigger
        >
        <SelectContent
          >{#each workspace.items as item (item.value)}<SelectItem {item}
              ><SelectItemText>{item.label}</SelectItemText></SelectItem
            >{/each}</SelectContent
        >
      </Select>
    </div>
  </header>
  <Row class="workspace-body">
    <Sidebar
      id="workspace-sidebar"
      collapsible="offcanvas"
      class="workspace-sidebar"
      aria-label="Workspace"
    >
      <SidebarHeader class="sidebar-heading">
        <Row class="workspace-heading-row">
          <span>Workspace</span>
          <Row class="workspace-actions">
            <Button
              variant="text"
              size="sm"
              class="new-article"
              aria-label="New article"
              title="New article"
              disabled={workspace.cannotCreate}
              onclick={() => workspace.startCreate('file')}
              ><FilePlus2 size={14} strokeWidth={1.5} /></Button
            >
            <Button
              variant="text"
              size="sm"
              class="new-article"
              aria-label="New folder"
              title="New folder"
              disabled={workspace.cannotCreate}
              onclick={() => workspace.startCreate('directory')}
              ><FolderPlus size={14} strokeWidth={1.5} /></Button
            >
          </Row>
        </Row>
      </SidebarHeader>
      <SidebarContent>
        {#if workspace.creationError}<p class="sidebar-message error" role="alert">
            {workspace.creationError}
          </p>{/if}
        {#if workspace.loading}
          <p class="sidebar-message" role="status">Opening workspace…</p>
        {:else if workspace.error}
          <p class="sidebar-message error" role="alert">{workspace.error}</p>
          {#if isTauri()}<Button variant="text" size="sm" onclick={() => workspace.open()}
              >Retry</Button
            >{/if}
        {:else if !workspace.entries.length && !workspace.pendingEntry}
          <p class="sidebar-message">
            Your workspace is empty. Create your first article with New article.
          </p>
        {:else}
          {#key workspace.treeVersion}<FileTree {workspace} />{/key}
        {/if}
      </SidebarContent>
    </Sidebar>
    <ArticlePane {workspace} />
  </Row>
</SidebarProvider>

<DraftRecoveryDialog
  open={editor.recoveryOpen && Boolean(editor.codecError || editor.save.error)}
  message={editor.codecError ?? editor.save.error ?? ''}
  copyStatus={editor.copyStatus}
  busy={workspace.blocked}
  onclose={() => {
    editor.recoveryOpen = false
  }}
  oncopy={() => void editor.copyDraft()}
  ondiscard={() => void editor.reload()}
  onretry={editor.codecError ? undefined : () => void editor.retry()}
/>
