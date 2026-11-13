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
    LightSwitch,
    themeService,
    type ThemeMode,
  } from '@cloudvoyant/helical-svelte'
  import { PanelLeft, ChevronDown } from 'lucide-svelte'
  import type { WorkspaceService } from '../services/workspaceService.svelte'

  // Props ---------------------------------------------------------------------
  interface TitleBarProps {
    workspace: WorkspaceService
  }
  let { workspace }: TitleBarProps = $props()

  // Methods -------------------------------------------------------------------
  function handleModeChange(mode: ThemeMode): void {
    themeService.setThemeMode(mode)
  }
</script>

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
  <LightSwitch mode={themeService.themeMode} onModeChange={handleModeChange} class="theme-toggle" />
</header>
