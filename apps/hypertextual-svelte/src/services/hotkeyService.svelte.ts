import { tick } from 'svelte'
import {
  getDocumentWhichKeyController,
  subscribeDocumentWhichKeyController,
  type KeymapMode,
} from '@cloudvoyant/helical-ui'
import type { WhichKeyNode } from '@cloudvoyant/helical-svelte'
import { themeService } from '@hypertextual/ui'
import type { WorkspaceService } from './workspaceService.svelte'

/** Application keyboard shortcuts, leader menu, and pane focus navigation. */
export class HotkeyService {
  sidebarOpen = $state(true)

  readonly keymap: Record<string, WhichKeyNode> = {
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
      expand: () => {
        const viewKey =
          typeof document !== 'undefined' &&
          getDocumentWhichKeyController(document)?.getState().preset === 'kakoune'
            ? 'v'
            : 'z'
        return {
          '?': {
            key: '?',
            label: 'Keybind Help',
            description: 'Open searchable keybinding exploration menu (<leader>?)',
            category: 'Leader',
            commandId: 'whichKey.openExplorer',
          },
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
          f: {
            key: 'f',
            label: '+file',
            group: 'File',
            description: 'Workspace file operations',
            category: 'Workspace',
            children: {
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
              r: {
                key: 'r',
                label: 'Rename File',
                description: 'Rename the selected file in the Workspace Explorer',
                category: 'Workspace',
                commandId: 'workspace.renameSelected',
              },
              d: {
                key: 'd',
                label: 'Move to Trash',
                description: 'Move the selected file to Trash',
                category: 'Workspace',
                commandId: 'workspace.deleteSelected',
              },
              o: {
                key: 'o',
                label: 'Open In Default App',
                description: 'Open the selected file in the default desktop application',
                category: 'Workspace',
                commandId: 'workspace.openInDefaultApp',
              },
            },
          },
          '/': {
            key: '/',
            label: 'Search',
            description: 'Search commands and keybindings',
            category: 'Leader',
            commandId: 'whichKey.openExplorer',
          },
          g: {
            key: 'g',
            label: '+goto',
            group: 'Goto',
            description: 'Go to locations and boundaries',
            category: 'Goto',
            proxy: ['g'],
          },
          j: {
            key: 'j',
            label: 'Jump to Element',
            description: 'Show 2D home-row jump labels over visible controls',
            category: 'Navigation',
            commandId: 'jump.start',
          },
          w: {
            key: 'w',
            label: '+window',
            group: 'Window / Pane',
            description: 'Spatial and indexed pane navigation',
            category: 'Window / Pane',
            proxy: ['Control+w'],
          },
          v: {
            key: 'v',
            label: '+view',
            group: 'View / Scroll',
            description: 'Scroll and align viewport',
            category: 'View',
            proxy: [viewKey],
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
          k: {
            key: 'k',
            label: '+preset',
            group: 'Keybinding Preset',
            description: 'Switch modal grammar (Helix / Vim / Kakoune)',
            category: 'Leader',
            children: {
              h: {
                key: 'h',
                label: 'Helix Preset',
                description: 'Switch to Helix selection-first grammar (default)',
                category: 'Preset',
                commandId: 'preset.helix',
              },
              v: {
                key: 'v',
                label: 'Vim Preset',
                description: 'Switch to Vim operator-motion grammar',
                category: 'Preset',
                commandId: 'preset.vim',
              },
              k: {
                key: 'k',
                label: 'Kakoune Preset',
                description: 'Switch to Kakoune object-verb grammar',
                category: 'Preset',
                commandId: 'preset.kakoune',
              },
            },
          },
        }
      },
    },
  }

  readonly commands: Record<string, () => boolean> = {
    'workspace.toggleExplorer': () => this.toggleExplorer(),
    'settings.togglePaneOutline': () => {
      this.workspace.settings.togglePaneOutline()
      return true
    },
    'settings.toggleClickToInsert': () => {
      this.workspace.settings.toggleClickToInsert()
      return true
    },
    'settings.cycleThemeMode': () => {
      themeService.cycleThemeMode()
      return true
    },
    'workspace.newArticle': () => {
      const editor = this.workspace.editor
      const previousPath = editor.selected?.path
      void this.workspace.newArticle().then(() => {
        if (
          !this.workspace.creationError &&
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
      if (!this.sidebarOpen) this.sidebarOpen = true
      this.workspace.startCreate('directory')
      return true
    },
    'workspace.renameSelected': () => {
      const selectedPath = this.workspace.editor.selected?.path
      if (!selectedPath) return false
      if (!this.sidebarOpen) this.sidebarOpen = true
      void tick().then(() => {
        const item = document.querySelector<HTMLElement>(
          `[role="treeitem"][data-value=${JSON.stringify(selectedPath)}]`,
        )
        item?.focus()
        item?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
        )
      })
      return true
    },
    'workspace.deleteSelected': () => {
      const selected = this.workspace.editor.selected
      if (!selected) return false
      void this.workspace.contextAction(selected.path, 'delete')
      return true
    },
    'workspace.openInDefaultApp': () => {
      if (!this.workspace.editor.selected) return false
      void this.workspace.editor.openInDefaultApp()
      return true
    },
  }

  constructor(private readonly workspace: WorkspaceService) {}

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open
  }

  toggleExplorer(): boolean {
    const nextOpen = !this.sidebarOpen
    this.sidebarOpen = nextOpen
    const targetPane = nextOpen ? 'workspace' : 'article'
    // Wait for Sidebar's pane registration effect to settle before focusing (see CLO-209).
    void tick().then(() => {
      requestAnimationFrame(() => {
        getDocumentWhichKeyController(document)?.focusPane(targetPane)
      })
    })
    return true
  }

  focusArticlePane(): void {
    if (typeof document === 'undefined') return
    if (!getDocumentWhichKeyController(document)?.focusPane('article')) {
      document.querySelector<HTMLElement>('[role="region"][aria-label="Article content"]')?.focus()
    }
  }

  handleModeChange(nextMode: KeymapMode): void {
    if (typeof document === 'undefined') return
    const controller = getDocumentWhichKeyController(document)
    if (controller?.getState().explorerOpen) return
    if (nextMode === 'insert') {
      const active = document.activeElement
      if (
        !active?.closest('#workspace-sidebar') &&
        !active?.closest('[data-which-key-explorer]') &&
        !this.workspace.pendingEntry
      ) {
        this.workspace.editor.setEditable(true)
      }
    } else {
      this.workspace.editor.setEditable(false)
    }
  }

  mountControllerSync(): () => void {
    if (typeof document === 'undefined') return () => {}
    let cleanupSub: (() => void) | undefined
    const attachSub = () => {
      cleanupSub?.()
      const controller = getDocumentWhichKeyController(document)
      if (!controller) return
      let prevExplorerOpen = controller.getState().explorerOpen
      cleanupSub = controller.subscribe((state) => {
        if (prevExplorerOpen && !state.explorerOpen && !this.workspace.editor.editable) {
          prevExplorerOpen = false
          queueMicrotask(() => controller.setMode('normal'))
          requestAnimationFrame(() => {
            if (!this.workspace.editor.editable && controller.getState().mode === 'insert') {
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
  }
}
