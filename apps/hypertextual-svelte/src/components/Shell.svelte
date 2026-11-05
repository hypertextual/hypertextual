<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { KeymapMode } from '@cloudvoyant/helical-ui'
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
    WhichKeyProvider,
    WhichKey,
  } from '@cloudvoyant/helical-svelte'
  import { FilePlus2, FolderPlus, PanelLeft, ChevronDown, Sun, Moon, Monitor } from 'lucide-svelte'
  import { invoke, isTauri } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { errorMessage } from '../clients/workspaceClient'
  import { WorkspaceService } from '../services/workspaceService.svelte'
  import WorkspaceExplorer from './WorkspaceExplorer.svelte'
  import ContentPane from './ContentPane.svelte'
  import DraftRecoveryDialog from './DraftRecoveryDialog.svelte'
  import type { WorkspaceClient } from '../clients/workspaceClient'

  // Props ---------------------------------------------------------------------
  interface ShellProps {
    client: WorkspaceClient
  }
  let { client }: ShellProps = $props()

  // State ---------------------------------------------------------------------
  const workspace = untrack(() => new WorkspaceService(client))
  const editor = workspace.editor
  const settings = workspace.settings
  const hotkeys = workspace.hotkeys

  // Lifecycle -----------------------------------------------------------------
  $effect(() => hotkeys.mountControllerSync())

  onMount(() => {
    let active = true
    const unlisteners: (() => void)[] = []
    void workspace.open()
    if (isTauri()) {
      void Promise.all(
        [
          getCurrentWindow().onCloseRequested((event) => {
            event.preventDefault()
            void editor.close(() => getCurrentWindow().destroy())
          }),
          listen('workspace-quit-requested', () => {
            void editor.close(() => invoke('workspace_finish_quit'))
          }),
        ].map(async (registration) => {
          const stop = await registration
          if (active) unlisteners.push(stop)
          else stop()
        }),
      )
        .then(async () => {
          if (active) await invoke('workspace_frontend_ready')
        })
        .catch((error) => {
          if (active) editor.openingError = errorMessage(error)
        })
    }
    return () => {
      active = false
      unlisteners.forEach((stop) => stop())
      workspace.dispose()
    }
  })

  // Methods -------------------------------------------------------------------
  function handleModeChange(nextMode: KeymapMode): void {
    hotkeys.handleModeChange(nextMode)
  }

  function handleSidebarOpenChange(next: boolean): void {
    hotkeys.setSidebarOpen(next)
  }

  function handleRecoveryClose(): void {
    editor.recoveryOpen = false
  }
</script>

<svelte:head><title>Hypertextual</title></svelte:head>
<svelte:window onbeforeunload={(event) => editor.beforeUnload(event)} />

<WhichKeyProvider
  preset="helix"
  storageKey="hypertextual"
  scoped={false}
  keymap={hotkeys.keymap}
  commands={hotkeys.commands}
  onModeChange={handleModeChange}
>
  <SidebarProvider
    open={hotkeys.sidebarOpen}
    onOpenChange={handleSidebarOpenChange}
    class="workspace-shell"
    style="--sidebar-width: 236px"
    data-pane-outline={settings.paneOutline ? 'true' : 'false'}
  >
    <header class="titlebar" data-tauri-drag-region>
      <SidebarTrigger title="Toggle sidebar" aria-controls="workspace-sidebar"
        ><PanelLeft size={14} strokeWidth={1.5} /></SidebarTrigger
      >
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
      <Button
        variant="text"
        size="sm"
        class="theme-toggle"
        aria-label={`Theme: ${settings.themeMode}`}
        title={`Theme: ${settings.themeMode}`}
        onclick={() => settings.cycleThemeMode()}
      >
        {#if settings.themeMode === 'light'}
          <Sun size={14} strokeWidth={1.5} />
        {:else if settings.themeMode === 'dark'}
          <Moon size={14} strokeWidth={1.5} />
        {:else}
          <Monitor size={14} strokeWidth={1.5} />
        {/if}
      </Button>
    </header>
    <Row class="workspace-body">
      <Sidebar
        id="workspace-sidebar"
        paneId="workspace"
        paneTitle="Workspace"
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
            {#key workspace.treeVersion}<WorkspaceExplorer {workspace} />{/key}
          {/if}
        </SidebarContent>
      </Sidebar>
      <ContentPane {workspace} />
    </Row>
  </SidebarProvider>

  <WhichKey />
</WhichKeyProvider>

<DraftRecoveryDialog
  open={editor.recoveryOpen && Boolean(editor.codecError || editor.save.error)}
  message={editor.codecError ?? editor.save.error ?? ''}
  copyStatus={editor.copyStatus}
  busy={workspace.blocked}
  onclose={handleRecoveryClose}
  oncopy={() => void editor.copyDraft()}
  ondiscard={() => void editor.reload()}
  onretry={editor.codecError ? undefined : () => void editor.retry()}
/>
