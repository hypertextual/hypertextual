<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import {
    getDocumentWhichKeyController,
    type CommandStyle,
    type KeymapMode,
  } from '@cloudvoyant/helical-ui'
  import {
    Button,
    CommandMenu,
    CommandPalette,
    CommandProvider,
    Row,
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    WhichKeyProvider,
    WhichKey,
  } from '@cloudvoyant/helical-svelte'
  import { FilePlus2, FolderPlus } from 'lucide-svelte'
  import { invoke, isTauri } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { errorMessage } from '../clients/workspaceClient'
  import { WorkspaceService } from '../services/workspaceService.svelte'
  import TitleBar from './TitleBar.svelte'
  import WorkspaceExplorer from './WorkspaceExplorer.svelte'
  import ContentPane from './ContentPane.svelte'
  import StatusBar from './StatusBar.svelte'
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
  onMount(() => {
    let active = true
    const isActive = () => active
    const unlisteners: (() => void)[] = []

    void workspace.open().then(() => setKeyboardFocusWhenIdle(isActive))
    handleExit(isActive, unlisteners)

    return () => {
      active = false
      unlisteners.forEach((stop) => stop())
      workspace.dispose()
    }
  })

  // Methods -------------------------------------------------------------------
  async function setKeyboardFocusWhenIdle(isActive: () => boolean): Promise<void> {
    if (!isActive() || workspace.editor.selected) return
    await tick()
    requestAnimationFrame(() => {
      if (
        isActive() &&
        !workspace.editor.selected &&
        (!document.activeElement || document.activeElement === document.body)
      ) {
        getDocumentWhichKeyController(document)?.focusPane('workspace')
      }
    })
  }

  function handleExit(isActive: () => boolean, unlisteners: (() => void)[]): void {
    if (!isTauri()) return
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
        if (isActive()) unlisteners.push(stop)
        else stop()
      }),
    )
      .then(async () => {
        if (isActive()) await invoke('workspace_frontend_ready')
      })
      .catch((error) => {
        if (isActive()) editor.openingError = errorMessage(error)
      })
  }

  function handleModeChange(nextMode: KeymapMode): void {
    hotkeys.handleModeChange(nextMode)
  }

  function handleSidebarOpenChange(next: boolean): void {
    workspace.sidebarOpen = next
  }

  function handleCommandStyleChange(next: CommandStyle): void {
    settings.setCommandStyle(next)
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
  <CommandProvider
    items={hotkeys.commandItems}
    style={settings.commandStyle}
    onStyleChange={handleCommandStyleChange}
  >
    <SidebarProvider
      open={workspace.sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      class="workspace-shell"
      style="--sidebar-width: 236px"
      data-pane-outline={settings.paneOutline ? 'true' : 'false'}
    >
      <TitleBar {workspace} />
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
      <StatusBar {workspace} />

      <CommandPalette />
      <CommandMenu hotkey="Mod+k" />
    </SidebarProvider>
  </CommandProvider>

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
