import { tick } from 'svelte'
import {
  getDocumentWhichKeyController,
  type CommandNode,
  type KeybindingPreset,
  type KeymapMode,
} from '@cloudvoyant/helical-ui'
import type { WhichKeyNode } from '@cloudvoyant/helical-svelte'
import { themeService, type ThemeMode } from '@hypertextual/ui'
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

/** Application keyboard shortcuts, leader menu, command catalog, and pane focus navigation. */
export class HotkeyService {
  readonly keymap: Record<string, WhichKeyNode> = {
    ':': leaf(
      ':',
      'Open Command',
      'Leader',
      'command.open',
      'Open the active Command Palette or Command Menu',
      ['normal', 'select'],
    ),
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
        return {
          ':': leaf(
            ':',
            'Open Command',
            'Leader',
            'command.open',
            'Open the active Command Palette or Command Menu (<leader>:)',
          ),
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
              w: leaf(
                'w',
                'Toggle WhichKey Leader Only',
                'Workspace',
                'settings.toggleWhichKeyLeaderOnly',
                'Toggle whether the WhichKey popup opens for all prefixes or only <leader>',
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
    'command.open': () => this.openCommand(),
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
    'settings.toggleWhichKeyLeaderOnly': () => {
      const ctrl = this.controller
      if (!ctrl) return false
      ctrl.setLeaderOnly(!ctrl.getState().leaderOnly)
      return true
    },
    'workspace.newArticle': () => this.createNewArticle(),
    'workspace.newFolder': () => this.createNewFolder(),
    'workspace.renameSelected': () => this.renameSelected(),
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

  private get controller() {
    return typeof document !== 'undefined' ? getDocumentWhichKeyController(document) : null
  }

  private scheduleAfterClose(callback: () => void): void {
    void tick().then(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => callback())
        })
      } else {
        callback()
      }
    })
  }

  openCommand(): boolean {
    this.workspace.commandOpen = true
    return true
  }

  private createNewArticle(): boolean {
    const editor = this.workspace.editor
    const previousPath = editor.selected?.path
    void this.workspace.newArticle().then(() => {
      if (
        !this.workspace.creationError &&
        editor.selected?.path &&
        editor.selected.path !== previousPath
      ) {
        this.scheduleAfterClose(() => {
          if (editor.setEditable(true)) {
            this.controller?.setMode('insert')
            void tick().then(() => {
              document.querySelector<HTMLElement>('.ProseMirror')?.focus()
            })
          }
        })
      }
    })
    return true
  }

  private createNewFolder(): boolean {
    if (!this.workspace.sidebarOpen) this.workspace.sidebarOpen = true
    this.scheduleAfterClose(() => {
      this.workspace.startCreate('directory')
    })
    return true
  }

  private renameSelected(): boolean {
    return this.workspace.startRename()
  }

  toggleExplorer(): boolean {
    const nextOpen = !this.workspace.sidebarOpen
    this.workspace.sidebarOpen = nextOpen
    const targetPane = nextOpen ? 'workspace' : 'article'
    // Wait for Sidebar's pane registration effect to settle before focusing (see CLO-209).
    this.scheduleAfterClose(() => {
      this.controller?.focusPane(targetPane)
    })
    return true
  }

  focusWorkspacePane(): boolean {
    if (!this.workspace.sidebarOpen) this.workspace.sidebarOpen = true
    this.scheduleAfterClose(() => {
      if (!this.controller?.focusPane('workspace')) {
        document.querySelector<HTMLElement>('#workspace-sidebar [role="treeitem"]')?.focus()
      }
    })
    return true
  }

  focusArticlePane(): void {
    if (typeof document === 'undefined') return
    if (!this.controller?.focusPane('article')) {
      document.querySelector<HTMLElement>('[role="region"][aria-label="Article content"]')?.focus()
    }
  }

  get commandItems(): CommandNode[] {
    const settings = this.workspace.settings
    const selected = this.workspace.editor.selected
    const hasSelected = Boolean(selected)
    const cannotCreate = this.workspace.cannotCreate
    const currentTheme = themeService.theme
    const currentMode = themeService.themeMode
    const wkState = this.controller?.getState()
    const currentPreset: KeybindingPreset = wkState?.preset ?? 'helix'
    const currentLeaderOnly = Boolean(wkState?.leaderOnly)

    const articleEntries = this.workspace.entries
      .filter((entry) => entry.kind === 'file')
      .map((entry): CommandNode => {
        const title = this.workspace.titles[entry.path] || entry.name
        const slug = entry.path.replace(/\.md$/i, '')
        return {
          value: `open:${entry.path}`,
          label: title,
          description: entry.path,
          command: slug,
          aliases: entry.name !== slug ? [entry.name] : undefined,
          active: selected?.path === entry.path,
          onSelect: () => {
            void this.workspace.select(entry.path).then(() => {
              this.scheduleAfterClose(() => {
                this.focusArticlePane()
              })
            })
          },
        }
      })

    return [
      {
        value: 'new-article',
        label: 'New Article',
        description: 'Create a new article in the workspace',
        group: 'Workspace',
        command: 'new-article',
        aliases: ['new', 'n', 'create'],
        shortcut: 'Space n',
        keywords: ['create', 'file', 'document', 'markdown', 'note'],
        disabled: cannotCreate,
        onSelect: () => {
          this.scheduleAfterClose(() => {
            this.createNewArticle()
          })
        },
      },
      {
        value: 'new-folder',
        label: 'New Folder',
        description: 'Create a new folder in the workspace',
        group: 'Workspace',
        command: 'new-folder',
        aliases: ['mkdir', 'N'],
        shortcut: 'Space N',
        keywords: ['directory', 'create', 'folder'],
        disabled: cannotCreate,
        onSelect: () => {
          this.createNewFolder()
        },
      },
      ...(articleEntries.length > 0
        ? [
            {
              value: 'open',
              label: 'Open Article',
              description: 'Open an existing article in the workspace',
              group: 'Workspace',
              command: 'open',
              aliases: ['o', 'edit', 'e', 'article'],
              keywords: ['switch', 'file', 'document', 'read'],
              children: articleEntries,
            } satisfies CommandNode,
          ]
        : []),
      {
        value: 'rename-file',
        label: 'Rename Current Article',
        description: 'Rename the selected file in the Workspace Explorer',
        group: 'Workspace',
        command: 'rename-file',
        aliases: ['rename', 'mv', 'r'],
        shortcut: 'Space f r',
        keywords: ['file', 'title', 'move'],
        disabled: !hasSelected,
        onSelect: () => {
          this.renameSelected()
        },
      },
      {
        value: 'delete-file',
        label: 'Move Current Article to Trash',
        description: 'Move the selected file to Trash',
        group: 'Workspace',
        command: 'delete-file',
        aliases: ['delete', 'rm', 'trash'],
        shortcut: 'Space f d',
        keywords: ['remove', 'file', 'trash'],
        disabled: !hasSelected,
        onSelect: () => {
          this.commands['workspace.deleteSelected']?.()
        },
      },
      {
        value: 'open-external',
        label: 'Open in Default App',
        description: 'Open the selected file in the default desktop application',
        group: 'Workspace',
        command: 'open-external',
        aliases: ['open-default', 'xdg-open'],
        shortcut: 'Space f o',
        keywords: ['external', 'system', 'app'],
        disabled: !hasSelected,
        onSelect: () => {
          this.commands['workspace.openInDefaultApp']?.()
        },
      },
      {
        value: 'toggle-explorer',
        label: 'Toggle Workspace Explorer',
        description: 'Toggle the Workspace Explorer sidebar open or closed',
        group: 'Workspace',
        command: 'toggle-explorer',
        aliases: ['explorer', 'sidebar', 'tree'],
        shortcut: 'Space e',
        keywords: ['sidebar', 'files', 'panel'],
        onSelect: () => {
          this.toggleExplorer()
        },
      },
      {
        value: 'focus-workspace',
        label: 'Focus Workspace Pane',
        description: 'Move keyboard focus to the Workspace Explorer pane',
        group: 'Navigation',
        command: 'focus-workspace',
        aliases: ['pane-workspace'],
        shortcut: 'Control+w h',
        keywords: ['sidebar', 'tree', 'pane', 'window'],
        onSelect: () => {
          this.focusWorkspacePane()
        },
      },
      {
        value: 'focus-article',
        label: 'Focus Article Pane',
        description: 'Move keyboard focus to the Article editor pane',
        group: 'Navigation',
        command: 'focus-article',
        aliases: ['pane-article'],
        shortcut: 'Control+w l',
        keywords: ['editor', 'content', 'pane', 'window'],
        onSelect: () => {
          this.scheduleAfterClose(() => {
            this.focusArticlePane()
          })
        },
      },
      {
        value: 'jump',
        label: 'Jump to Element',
        description: 'Show 2D home-row jump labels over visible controls',
        group: 'Navigation',
        command: 'jump',
        aliases: ['gw'],
        shortcut: 'Space j',
        keywords: ['goto', 'hint', 'label', 'navigation'],
        onSelect: () => {
          this.scheduleAfterClose(() => {
            this.controller?.startJumpMode()
          })
        },
      },
      {
        value: 'theme',
        label: 'Change Theme',
        description: 'Switch the application color theme preset',
        group: 'Appearance',
        command: 'theme',
        aliases: ['t', 'colorscheme'],
        keywords: ['color', 'palette', 'appearance', 'style'],
        children: themeService.themes.map((t) => ({
          value: `theme:${t.name}`,
          label: t.label,
          command: t.name,
          active: currentTheme === t.name,
          onSelect: () => {
            themeService.setTheme(t.name)
          },
        })),
      },
      {
        value: 'mode',
        label: 'Change Color Mode',
        description: 'Switch between system, light, and dark color modes',
        group: 'Appearance',
        command: 'mode',
        aliases: ['m', 'color-mode'],
        shortcut: 'Space t d',
        keywords: ['dark', 'light', 'system', 'appearance'],
        children: (
          [
            { mode: 'system', label: 'System' },
            { mode: 'light', label: 'Light' },
            { mode: 'dark', label: 'Dark' },
          ] satisfies Array<{ mode: ThemeMode; label: string }>
        ).map((item) => ({
          value: `mode:${item.mode}`,
          label: item.label,
          command: item.mode,
          active: currentMode === item.mode,
          onSelect: () => {
            themeService.setThemeMode(item.mode)
          },
        })),
      },
      {
        value: 'command-style',
        label: 'Change Command Style',
        description: 'Choose between Command Palette (⌘K) and Command Menu (:)',
        group: 'Preferences',
        command: 'command-style',
        aliases: ['cmd', 'command'],
        keywords: ['palette', 'menu', 'colon', 'prompt', 'modal'],
        children: [
          {
            value: 'command-style:palette',
            label: 'Command Palette (⌘K)',
            description: 'Centered fuzzy-searchable command modal',
            command: 'palette',
            active: settings.commandStyle === 'palette',
            onSelect: () => {
              settings.setCommandStyle('palette')
            },
          },
          {
            value: 'command-style:menu',
            label: 'Command Menu (:)',
            description: 'Bottom Helix/Kakoune-style :command prompt with completions',
            command: 'menu',
            aliases: ['colon'],
            active: settings.commandStyle === 'menu',
            onSelect: () => {
              settings.setCommandStyle('menu')
            },
          },
        ],
      },
      {
        value: 'which-key-activation',
        label: 'WhichKey Activation',
        description: 'Configure when the WhichKey chord helper popup appears',
        group: 'Preferences',
        command: 'which-key-activation',
        aliases: ['which-key', 'wk', 'leader-only'],
        shortcut: 'Space t w',
        keywords: ['leader', 'popup', 'prefix', 'chords', 'whichkey', 'activation'],
        children: [
          {
            value: 'which-key-activation:all',
            label: 'All Prefixes',
            description: 'Show WhichKey popup for all multi-key prefixes (g, z, Ctrl+w, Space)',
            command: 'all',
            aliases: ['full', 'every'],
            active: !currentLeaderOnly,
            onSelect: () => {
              this.controller?.setLeaderOnly(false)
            },
          },
          {
            value: 'which-key-activation:leader',
            label: 'Leader Only',
            description: 'Show WhichKey popup only when pressing <leader> (Space)',
            command: 'leader',
            aliases: ['space', 'minimal'],
            active: currentLeaderOnly,
            onSelect: () => {
              this.controller?.setLeaderOnly(true)
            },
          },
        ],
      },
      {
        value: 'preset',
        label: 'Change Keybinding Preset',
        description: 'Switch modal editing grammar (Helix, Vim, or Kakoune)',
        group: 'Preferences',
        command: 'preset',
        aliases: ['keybind', 'keymap', 'k'],
        shortcut: 'Space k',
        keywords: ['helix', 'vim', 'kakoune', 'modal', 'grammar'],
        children: [
          {
            value: 'preset:helix',
            label: 'Helix',
            description: 'Selection-first modal grammar (default)',
            command: 'helix',
            aliases: ['hx'],
            active: currentPreset === 'helix',
            onSelect: () => {
              this.controller?.setPreset('helix')
            },
          },
          {
            value: 'preset:vim',
            label: 'Vim',
            description: 'Operator-motion modal grammar',
            command: 'vim',
            active: currentPreset === 'vim',
            onSelect: () => {
              this.controller?.setPreset('vim')
            },
          },
          {
            value: 'preset:kakoune',
            label: 'Kakoune',
            description: 'Object-verb modal grammar',
            command: 'kakoune',
            aliases: ['kak'],
            active: currentPreset === 'kakoune',
            onSelect: () => {
              this.controller?.setPreset('kakoune')
            },
          },
        ],
      },
      {
        value: 'pane-outline',
        label: 'Pane Focus Outline',
        description: 'Configure the focus outline around the active pane',
        group: 'Preferences',
        command: 'pane-outline',
        aliases: ['outline'],
        shortcut: 'Space t o',
        keywords: ['focus', 'border', 'ring', 'pane'],
        children: [
          {
            value: 'pane-outline:on',
            label: 'Enabled',
            command: 'on',
            aliases: ['true', 'enable'],
            active: settings.paneOutline,
            onSelect: () => {
              if (!settings.paneOutline) settings.togglePaneOutline()
            },
          },
          {
            value: 'pane-outline:off',
            label: 'Disabled',
            command: 'off',
            aliases: ['false', 'disable'],
            active: !settings.paneOutline,
            onSelect: () => {
              if (settings.paneOutline) settings.togglePaneOutline()
            },
          },
        ],
      },
      {
        value: 'click-to-insert',
        label: 'Click to Insert',
        description: 'Configure whether clicking the article enters insert mode',
        group: 'Preferences',
        command: 'click-to-insert',
        aliases: ['click-insert'],
        shortcut: 'Space t c',
        keywords: ['mouse', 'click', 'insert', 'editor'],
        children: [
          {
            value: 'click-to-insert:on',
            label: 'Enabled',
            command: 'on',
            aliases: ['true', 'enable'],
            active: settings.clickToInsert,
            onSelect: () => {
              if (!settings.clickToInsert) settings.toggleClickToInsert()
            },
          },
          {
            value: 'click-to-insert:off',
            label: 'Disabled',
            command: 'off',
            aliases: ['false', 'disable'],
            active: !settings.clickToInsert,
            onSelect: () => {
              if (settings.clickToInsert) settings.toggleClickToInsert()
            },
          },
        ],
      },
      {
        value: 'keybindings',
        label: 'Explore Keybindings',
        description: 'Open the searchable keybinding reference dialog',
        group: 'Tools',
        command: 'keybindings',
        aliases: ['bindings', 'keys', 'help'],
        shortcut: 'Space ?',
        keywords: ['shortcuts', 'chords', 'which-key', 'reference'],
        onSelect: () => {
          this.scheduleAfterClose(() => {
            this.controller?.openExplorer()
          })
        },
      },
    ]
  }

  handleModeChange(nextMode: KeymapMode): void {
    if (typeof document === 'undefined') return
    if (this.workspace.commandOpen || this.controller?.getState().explorerOpen) return
    if (nextMode === 'insert') {
      const active = document.activeElement
      if (
        !active?.closest('#workspace-sidebar') &&
        !active?.closest('[data-which-key-explorer]') &&
        !active?.closest('[data-command-palette], [data-command-menu]') &&
        !this.workspace.pendingEntry &&
        !this.workspace.renamingPath
      ) {
        this.workspace.editor.setEditable(true)
      }
    } else {
      this.workspace.editor.setEditable(false)
    }
  }
}
