import { tick } from 'svelte'
import { getDocumentWhichKeyController, type KeymapMode } from '@cloudvoyant/helical-ui'
import type { WhichKeyNode } from '@cloudvoyant/helical-svelte'
import { themeService } from '@hypertextual/ui'
import type { WorkspaceService } from './workspaceService.svelte'

function leaf(
  key: string,
  label: string,
  category: string,
  commandId: string,
  description: string,
  mode?: KeymapMode[],
): WhichKeyNode {
  return { key, label, category, commandId, description, ...(mode ? { mode } : {}) }
}

/** Application keyboard shortcuts, leader menu, and pane focus navigation. */
export class HotkeyService {
  sidebarOpen = $state(true)

  readonly keymap: Record<string, WhichKeyNode> = {
    'Control+e': leaf(
      'Control+e',
      'Toggle Explorer',
      'Workspace',
      'workspace.toggleExplorer',
      'Toggle the Workspace Explorer sidebar open or closed',
      ['normal', 'select'],
    ),
    Space: {
      key: 'Space',
      label: '+leader',
      group: 'Leader',
      category: 'Leader',
      mode: ['normal', 'select'],
      expand: () => {
        const viewKey = this.controller?.getState().preset === 'kakoune' ? 'v' : 'z'
        const hasMermaidSelected =
          typeof document !== 'undefined' &&
          Boolean(
            document.querySelector(
              '.ProseMirror [data-pm-modal-node-selection="normal"][data-mermaid-node], .ProseMirror [data-pm-modal-node-selection="normal"] [data-mermaid-node]',
            ),
          )
        return {
          '?': leaf(
            '?',
            'Keybind Help',
            'Leader',
            'whichKey.openExplorer',
            'Open searchable keybinding exploration menu (<leader>?)',
          ),
          e: leaf(
            'e',
            'Toggle Explorer',
            'Workspace',
            'workspace.toggleExplorer',
            'Toggle the Workspace Explorer sidebar open or closed',
          ),
          ...(hasMermaidSelected
            ? {
                m: {
                  key: 'm',
                  label: '+mermaid',
                  group: 'Mermaid',
                  description: 'Mermaid diagram actions',
                  category: 'Mermaid',
                  children: {
                    f: leaf(
                      'f',
                      'Toggle Mermaid Fullscreen',
                      'Mermaid',
                      'mermaid.toggleFullscreen',
                      'Open or minimize the selected Mermaid diagram in fullscreen',
                    ),
                  },
                },
              }
            : {}),
          n: leaf(
            'n',
            'New Article',
            'Workspace',
            'workspace.newArticle',
            'Create a new article in the workspace',
          ),
          N: leaf(
            'N',
            'New Folder',
            'Workspace',
            'workspace.newFolder',
            'Create a new folder in the workspace',
          ),
          f: {
            key: 'f',
            label: '+file',
            group: 'File',
            description: 'Workspace file operations',
            category: 'Workspace',
            children: {
              n: leaf(
                'n',
                'New Article',
                'Workspace',
                'workspace.newArticle',
                'Create a new article in the workspace',
              ),
              N: leaf(
                'N',
                'New Folder',
                'Workspace',
                'workspace.newFolder',
                'Create a new folder in the workspace',
              ),
              r: leaf(
                'r',
                'Rename File',
                'Workspace',
                'workspace.renameSelected',
                'Rename the selected file in the Workspace Explorer',
              ),
              d: leaf(
                'd',
                'Move to Trash',
                'Workspace',
                'workspace.deleteSelected',
                'Move the selected file to Trash',
              ),
              o: leaf(
                'o',
                'Open In Default App',
                'Workspace',
                'workspace.openInDefaultApp',
                'Open the selected file in the default desktop application',
              ),
            },
          },
          '/': leaf(
            '/',
            'Search',
            'Leader',
            'whichKey.openExplorer',
            'Search commands and keybindings',
          ),
          g: {
            key: 'g',
            label: '+goto',
            group: 'Goto',
            description: 'Go to locations and boundaries',
            category: 'Goto',
            proxy: ['g'],
          },
          j: leaf(
            'j',
            'Jump to Element',
            'Navigation',
            'jump.start',
            'Show 2D home-row jump labels over visible controls',
          ),
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
              o: leaf(
                'o',
                'Toggle Pane Outline',
                'Workspace',
                'settings.togglePaneOutline',
                'Toggle the focus outline on the active workspace or editor pane',
              ),
              c: leaf(
                'c',
                'Toggle Click to Insert',
                'Workspace',
                'settings.toggleClickToInsert',
                'Toggle whether clicking the article enters insert mode',
              ),
              d: leaf(
                'd',
                'Cycle Theme Mode',
                'Workspace',
                'settings.cycleThemeMode',
                'Cycle between system, light, and dark theme modes',
              ),
            },
          },
          k: {
            key: 'k',
            label: '+preset',
            group: 'Keybinding Preset',
            description: 'Switch modal grammar (Helix / Vim / Kakoune)',
            category: 'Leader',
            children: {
              h: leaf(
                'h',
                'Helix Preset',
                'Preset',
                'preset.helix',
                'Switch to Helix selection-first grammar (default)',
              ),
              v: leaf(
                'v',
                'Vim Preset',
                'Preset',
                'preset.vim',
                'Switch to Vim operator-motion grammar',
              ),
              k: leaf(
                'k',
                'Kakoune Preset',
                'Preset',
                'preset.kakoune',
                'Switch to Kakoune object-verb grammar',
              ),
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
          this.controller?.setMode('insert')
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
    'mermaid.toggleFullscreen': () => {
      if (typeof document === 'undefined') return false
      const btn = document.querySelector<HTMLElement>(
        '.ProseMirror [data-pm-modal-node-selection="normal"] button[data-mermaid-fullscreen]',
      )
      if (!btn) return false
      btn.click()
      return true
    },
  }

  constructor(private readonly workspace: WorkspaceService) {}

  private get controller() {
    return typeof document !== 'undefined' ? getDocumentWhichKeyController(document) : null
  }

  toggleExplorer(): boolean {
    const nextOpen = !this.sidebarOpen
    this.sidebarOpen = nextOpen
    const targetPane = nextOpen ? 'workspace' : 'article'
    // Wait for Sidebar's pane registration effect to settle before focusing (see CLO-209).
    void tick().then(() => {
      requestAnimationFrame(() => {
        this.controller?.focusPane(targetPane)
      })
    })
    return true
  }

  focusArticlePane(): void {
    if (typeof document === 'undefined') return
    if (!this.controller?.focusPane('article')) {
      document.querySelector<HTMLElement>('[role="region"][aria-label="Article content"]')?.focus()
    }
  }

  handleModeChange(nextMode: KeymapMode): void {
    if (typeof document === 'undefined') return
    if (this.controller?.getState().explorerOpen) return
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
}
