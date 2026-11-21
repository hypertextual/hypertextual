<script lang="ts">
  import {
    SidebarTrigger,
    Select,
    SelectTrigger,
    SelectValue,
    SelectIndicator,
    SelectContent,
    SelectItem,
    SelectItemText,
    Button,
    LightSwitch,
    themeService,
    type ThemeMode,
  } from '@cloudvoyant/helical-svelte'
  import { PanelLeft, ChevronDown, Trash2 } from 'lucide-svelte'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface TitleBarProps {
    workspace: WorkspaceService
  }
  let { workspace }: TitleBarProps = $props()

  // Derived -------------------------------------------------------------------
  const canRemoveWorkspace = $derived(workspace.workspaces.length > 1 && !workspace.blocked)

  // Methods -------------------------------------------------------------------
  function handleModeChange(mode: ThemeMode): void {
    themeService.setThemeMode(mode)
  }

  function handleWorkspaceChange(details: { value: string[] }): void {
    const next = details.value[0]
    if (next) void workspace.switchWorkspace(next)
  }

  function handleRemoveWorkspace(): void {
    if (!canRemoveWorkspace) return
    void workspace.removeWorkspace(workspace.activeWorkspaceName)
  }
</script>

<header class="titlebar" data-tauri-drag-region>
  <SidebarTrigger title="Toggle sidebar" aria-controls="workspace-sidebar"
    ><PanelLeft size={14} strokeWidth={1.5} /></SidebarTrigger
  >
  <div class="workspace-chooser">
    <Select
      items={workspace.items}
      value={[workspace.activeWorkspaceName]}
      onValueChange={handleWorkspaceChange}
      size="sm"
    >
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
    {#if canRemoveWorkspace}
      <Button
        variant="text"
        size="sm"
        aria-label="Remove workspace"
        title="Remove workspace from list"
        onclick={handleRemoveWorkspace}
      >
        <Trash2 size={13} strokeWidth={1.5} />
      </Button>
    {/if}
  </div>
  <LightSwitch mode={themeService.themeMode} onModeChange={handleModeChange} class="theme-toggle" />
</header>
