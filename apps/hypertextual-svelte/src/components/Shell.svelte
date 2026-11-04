<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import {
    getDocumentWhichKeyController,
    subscribeDocumentWhichKeyController,
  } from '@cloudvoyant/helical-ui'
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
    type WhichKeyNode,
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
  let sidebarOpen = $state(true)

  const appKeymap: Record<string, WhichKeyNode> = {
    'Control+e': {
      key: 'Control+e',
      label: 'Toggle Explorer',
      description: 'Toggle the Workspace Explorer sidebar open or closed',
      category: 'Workspace',
      mode: ['normal', 'select'],
      commandId: 'workspace.toggleExplorer',
    },
    Space: {
      key: 'Space',
      label: '+leader',
      group: 'Leader',
      category: 'Leader',
      mode: ['normal', 'select'],
      children: {
        e: {
          key: 'e',
          label: 'Toggle Explorer',
          description: 'Toggle the Workspace Explorer sidebar open or closed',
          category: 'Workspace',
          commandId: 'workspace.toggleExplorer',
        },
        n: {
          key: 'n',
          label: 'New Article',
          description: 'Create a new article in the workspace',
          category: 'Workspace',
          commandId: 'workspace.newArticle',
        },
        N: {
          key: 'N',
          label: 'New Folder',
          description: 'Create a new folder in the workspace',
          category: 'Workspace',
          commandId: 'workspace.newFolder',
        },
        t: {
          key: 't',
          label: '+toggles',
          group: 'Toggles',
          category: 'Workspace',
          children: {
            o: {
              key: 'o',
              label: 'Toggle Pane Outline',
              description: 'Toggle the focus outline on the active workspace or editor pane',
              category: 'Workspace',
              commandId: 'settings.togglePaneOutline',
            },
            c: {
              key: 'c',
              label: 'Toggle Click to Insert',
              description: 'Toggle whether clicking the article enters insert mode',
              category: 'Workspace',
              commandId: 'settings.toggleClickToInsert',
            },
            d: {
              key: 'd',
              label: 'Cycle Theme Mode',
              description: 'Cycle between system, light, and dark theme modes',
              category: 'Workspace',
              commandId: 'settings.cycleThemeMode',
            },
          },
        },
      },
    },
  }

  const appCommands = {
    'workspace.toggleExplorer': () => toggleExplorer(),
    'settings.togglePaneOutline': () => {
      settings.togglePaneOutline()
      return true
    },
    'settings.toggleClickToInsert': () => {
      settings.toggleClickToInsert()
      return true
    },
    'settings.cycleThemeMode': () => {
      settings.cycleThemeMode()
      return true
    },
    'workspace.newArticle': () => {
      const previousPath = editor.selected?.path
      void workspace.newArticle().then(() => {
        if (
          !workspace.creationError &&
          editor.selected?.path &&
          editor.selected.path !== previousPath &&
          editor.setEditable(true)
        ) {
          getDocumentWhichKeyController(document)?.setMode('insert')
          void tick().then(() => {
            document.querySelector<HTMLElement>('.ProseMirror')?.focus()
          })
        }
      })
      return true
    },
    'workspace.newFolder': () => {
      if (!sidebarOpen) sidebarOpen = true
      workspace.startCreate('directory')
      return true
    },
  }

  // Lifecycle -----------------------------------------------------------------
  $effect(() => {
    let cleanupSub: (() => void) | undefined
    const attachSub = () => {
      cleanupSub?.()
      const controller = getDocumentWhichKeyController(document)
      if (!controller) return
      let prevExplorerOpen = controller.getState().explorerOpen
      cleanupSub = controller.subscribe((state) => {
        if (prevExplorerOpen && !state.explorerOpen && !editor.editable) {
          prevExplorerOpen = false
          queueMicrotask(() => controller.setMode('normal'))
          requestAnimationFrame(() => {
            if (!editor.editable && controller.getState().mode === 'insert') {
              controller.setMode('normal')
            }
          })
          return
        }
        prevExplorerOpen = state.explorerOpen
      })
    }
    attachSub()
    const unsubRoot = subscribeDocumentWhichKeyController(document, attachSub)
    return () => {
      cleanupSub?.()
      unsubRoot()
    }
  })

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
  function toggleExplorer(): boolean {
    const nextOpen = !sidebarOpen
    sidebarOpen = nextOpen
    const controller = getDocumentWhichKeyController(document)
    if (nextOpen) {
      void tick().then(() => {
        requestAnimationFrame(() => {
          controller?.focusPane('workspace')
        })
      })
    } else {
      void tick().then(() => {
        requestAnimationFrame(() => {
          if (controller?.focusPane('article')) return
          const articleRegion = document.querySelector<HTMLElement>(
            '[data-pane-id="article"] [data-pane-focus-target], [data-pane-id="article"]',
          )
          articleRegion?.focus({ preventScroll: true })
        })
      })
    }
    return true
  }
</script>

<svelte:head><title>Hypertextual</title></svelte:head>
<svelte:window onbeforeunload={(event) => editor.beforeUnload(event)} />

<WhichKeyProvider
  preset="helix"
  storageKey="hypertextual"
  scoped={false}
  keymap={appKeymap}
  commands={appCommands}
  onModeChange={(nextMode) => {
    const controller = getDocumentWhichKeyController(document)
    if (controller?.getState().explorerOpen) return
    if (nextMode === 'insert') {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (
        !active?.closest('#workspace-sidebar') &&
        !active?.closest('[data-which-key-explorer]') &&
        !workspace.pendingEntry
      ) {
        editor.setEditable(true)
      }
    } else {
      editor.setEditable(false)
    }
  }}
>
  <SidebarProvider
    open={sidebarOpen}
    onOpenChange={(next) => {
      sidebarOpen = next
    }}
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
  onclose={() => {
    editor.recoveryOpen = false
  }}
  oncopy={() => void editor.copyDraft()}
  ondiscard={() => void editor.reload()}
  onretry={editor.codecError ? undefined : () => void editor.retry()}
/>
