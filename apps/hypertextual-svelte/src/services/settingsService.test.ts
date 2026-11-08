import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { CommandNode } from '@cloudvoyant/helical-ui'

const stateFactory = Object.assign(<T>(initial: T): T => initial, {
  raw: <T>(initial: T): T => initial,
})
Object.assign(globalThis, {
  $state: stateFactory,
  $derived: <T>(value: T): T => value,
})

const { HYPERTEXTUAL_THEMES, ThemeService, themeService } = await import('@hypertextual/ui')
const { SettingsService } = await import('./settingsService.svelte')
const { HotkeyService } = await import('./hotkeyService.svelte')

function createStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
  }
}

function createClassListMock() {
  const classes = new Set<string>()
  return {
    add(...tokens: string[]) {
      for (const token of tokens) classes.add(token)
    },
    remove(...tokens: string[]) {
      for (const token of tokens) classes.delete(token)
    },
    toggle(token: string, force?: boolean): boolean {
      const next = force ?? !classes.has(token)
      if (next) classes.add(token)
      else classes.delete(token)
      return next
    },
    contains(token: string): boolean {
      return classes.has(token)
    },
    forEach(cb: (cls: string) => void) {
      for (const cls of classes) cb(cls)
    },
    toArray(): string[] {
      return [...classes]
    },
  }
}

function findNode(nodes: CommandNode[], value: string): CommandNode | undefined {
  for (const node of nodes) {
    if (node.value === value) return node
    if (node.children) {
      const found = findNode(node.children, value)
      if (found) return found
    }
  }
  return undefined
}

const originalWindow = globalThis.window
const originalDocument = globalThis.document

// integration -----------------------------------------------------------------

describe('Given SettingsService and ThemeService persistence wiring', () => {
  let storage: ReturnType<typeof createStorageMock>
  let classList: ReturnType<typeof createClassListMock>

  beforeEach(() => {
    storage = createStorageMock()
    classList = createClassListMock()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: storage,
        matchMedia: () => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      },
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        documentElement: {
          classList,
          style: {
            removeProperty: () => {},
          },
        },
        activeElement: null,
        querySelector: () => null,
      },
    })
    themeService.setTheme('hypertextual', false)
    themeService.setThemeMode('system', false)
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: originalDocument,
    })
  })

  it('When SettingsService initializes with persisted commandStyle and theme -> Then it restores them and syncs changes back to localStorage', () => {
    // Given
    const initialTheme = HYPERTEXTUAL_THEMES[1]!.name
    const nextTheme = HYPERTEXTUAL_THEMES[2]!.name
    storage.setItem('hypertextual.settings.commandStyle', 'colon')
    storage.setItem('hypertextual.settings.theme', initialTheme)
    storage.setItem('hypertextual.settings.themeMode', 'dark')

    // When
    const settings = new SettingsService()

    // Then
    expect(settings.commandStyle).toBe('menu')
    expect(themeService.theme).toBe(initialTheme)
    expect(themeService.themeMode).toBe('dark')
    expect(classList.contains(`theme-${initialTheme}`)).toBe(true)
    expect(classList.contains('dark')).toBe(true)

    // When
    settings.setCommandStyle('palette')
    themeService.setTheme(nextTheme)
    themeService.setThemeMode('light')

    // Then
    expect(settings.commandStyle).toBe('palette')
    expect(storage.getItem('hypertextual.settings.commandStyle')).toBe('palette')
    expect(storage.getItem('hypertextual.settings.theme')).toBe(nextTheme)
    expect(storage.getItem('hypertextual.settings.themeMode')).toBe('light')
    expect(classList.contains(`theme-${nextTheme}`)).toBe(true)
    expect(classList.contains(`theme-${initialTheme}`)).toBe(false)
    expect(classList.contains('dark')).toBe(false)
  })

  it('When commandStyle, paneOutline, and clickToInsert are toggled -> Then they update state and persist to localStorage', () => {
    // Given
    const settings = new SettingsService()
    expect(settings.commandStyle).toBe('palette')
    expect(settings.paneOutline).toBe(true)
    expect(settings.clickToInsert).toBe(true)

    // When
    const nextStyle = settings.toggleCommandStyle()
    const nextOutline = settings.togglePaneOutline()
    const nextClick = settings.toggleClickToInsert()

    // Then
    expect(nextStyle).toBe('menu')
    expect(nextOutline).toBe(false)
    expect(nextClick).toBe(false)
    expect(storage.getItem('hypertextual.settings.commandStyle')).toBe('menu')
    expect(storage.getItem('hypertextual.settings.paneOutline')).toBe('false')
    expect(storage.getItem('hypertextual.settings.clickToInsert')).toBe('false')
  })
})

describe('Given HotkeyService keymap, mode-change guards, and command catalog', () => {
  let storage: ReturnType<typeof createStorageMock>
  let classList: ReturnType<typeof createClassListMock>
  let editableCalls: boolean[]
  let deletedPaths: string[]
  let openedExternal: number

  function createWorkspaceStub() {
    editableCalls = []
    deletedPaths = []
    openedExternal = 0
    const settings = new SettingsService()
    const workspace = {
      settings,
      cannotCreate: false,
      pendingEntry: null as { path: string; name: string; kind: 'file' | 'directory' } | null,
      creationError: null as string | null,
      entries: [
        { path: 'Welcome.md', name: 'Welcome.md', kind: 'file' as const },
        { path: 'Notes', name: 'Notes', kind: 'directory' as const },
      ],
      titles: { 'Welcome.md': 'Welcome to Hypertextual' } as Record<string, string>,
      editor: {
        selected: null as { path: string; name: string; kind: 'file' } | null,
        setEditable: (next: boolean) => {
          editableCalls.push(next)
          return next
        },
        openInDefaultApp: async () => {
          openedExternal++
        },
      },
      newArticle: async () => {
        workspace.editor.selected = { path: 'Untitled.md', name: 'Untitled.md', kind: 'file' }
      },
      startCreate: () => {},
      select: async (path: string) => {
        workspace.editor.selected = { path, name: path, kind: 'file' }
      },
      contextAction: async (path: string, action: string) => {
        if (action === 'delete') deletedPaths.push(path)
      },
    }
    return workspace
  }

  beforeEach(() => {
    storage = createStorageMock()
    classList = createClassListMock()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: storage,
        matchMedia: () => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      },
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        documentElement: {
          classList,
          style: {
            removeProperty: () => {},
          },
        },
        activeElement: null,
        querySelector: () => null,
      },
    })
    themeService.setTheme('hypertextual', false)
    themeService.setThemeMode('system', false)
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: originalDocument,
    })
  })

  it("When ':', 'Space :', or 'Space t w' are inspected in keymap -> Then ':' is scoped to normal/select mode and 'command.open' sets commandOpen = true", () => {
    // Given
    const workspace = createWorkspaceStub()
    const hotkeys = new HotkeyService(workspace as never)

    // When
    const colonNode = hotkeys.keymap[':']
    const leaderChildren = hotkeys.keymap.Space?.expand?.() ?? {}
    const leaderColon = leaderChildren[':']
    const toggleSubmenu = leaderChildren.t?.children ?? {}
    const leaderToggleWhichKey = toggleSubmenu.w
    const opened = hotkeys.commands['command.open']?.()

    // Then
    expect(colonNode?.commandId).toBe('command.open')
    expect(colonNode?.mode).toEqual(['normal', 'select'])
    expect(leaderColon?.commandId).toBe('command.open')
    expect(leaderToggleWhichKey?.commandId).toBe('settings.toggleWhichKeyLeaderOnly')
    expect(opened).toBe(true)
    expect(hotkeys.commandOpen).toBe(true)
  })

  it('When CommandPalette or CommandMenu is open during a mode change -> Then HotkeyService.handleModeChange does not toggle editor.setEditable(true)', () => {
    // Given
    const workspace = createWorkspaceStub()
    const hotkeys = new HotkeyService(workspace as never)
    hotkeys.commandOpen = true

    // When
    hotkeys.handleModeChange('insert')

    // Then
    expect(editableCalls).toEqual([])

    // When command dialog is closed and mode changes to insert
    hotkeys.commandOpen = false
    hotkeys.handleModeChange('insert')

    // Then
    expect(editableCalls).toEqual([true])
  })

  it('When workspace selection and settings change -> Then commandItems reflects disabled file actions, active flags, and executes leaf callbacks', () => {
    // Given
    const workspace = createWorkspaceStub()
    const hotkeys = new HotkeyService(workspace as never)

    // When no article is selected
    const initialItems = hotkeys.commandItems

    // Then file-scoped actions are disabled and open branch lists Welcome.md
    expect(findNode(initialItems, 'rename-file')?.disabled).toBe(true)
    expect(findNode(initialItems, 'delete-file')?.disabled).toBe(true)
    expect(findNode(initialItems, 'open-external')?.disabled).toBe(true)
    expect(findNode(initialItems, 'open:Welcome.md')?.label).toBe('Welcome to Hypertextual')
    expect(findNode(initialItems, 'command-style:palette')?.active).toBe(true)
    expect(findNode(initialItems, 'command-style:menu')?.active).toBe(false)

    // When an article is selected and leaf callbacks run
    workspace.editor.selected = { path: 'Welcome.md', name: 'Welcome.md', kind: 'file' }
    const activeItems = hotkeys.commandItems
    expect(findNode(activeItems, 'rename-file')?.disabled).toBe(false)
    expect(findNode(activeItems, 'delete-file')?.disabled).toBe(false)
    expect(findNode(activeItems, 'open-external')?.disabled).toBe(false)

    const nextTheme = HYPERTEXTUAL_THEMES[1]!.name
    findNode(activeItems, 'command-style:menu')?.onSelect?.({} as never)
    findNode(activeItems, `theme:${nextTheme}`)?.onSelect?.({} as never)
    findNode(activeItems, 'mode:dark')?.onSelect?.({} as never)
    findNode(activeItems, 'pane-outline:off')?.onSelect?.({} as never)
    findNode(activeItems, 'click-to-insert:off')?.onSelect?.({} as never)
    findNode(activeItems, 'delete-file')?.onSelect?.({} as never)
    findNode(activeItems, 'open-external')?.onSelect?.({} as never)

    // Then
    expect(workspace.settings.commandStyle).toBe('menu')
    expect(themeService.theme).toBe(nextTheme)
    expect(themeService.themeMode).toBe('dark')
    expect(workspace.settings.paneOutline).toBe(false)
    expect(workspace.settings.clickToInsert).toBe(false)
    expect(deletedPaths).toEqual(['Welcome.md'])
    expect(openedExternal).toBe(1)
  })
})

// unit ------------------------------------------------------------------------

describe('Given ThemeService theme catalog and class synchronization', () => {
  it('When switching themes -> Then HYPERTEXTUAL_THEMES includes hypertextual plus all Helical themes and rejects unknown names', () => {
    // Given
    const service = new ThemeService({ initialTheme: 'hypertextual', initialMode: 'light' })
    const secondTheme = HYPERTEXTUAL_THEMES[1]!.name

    // When
    const valid = service.setTheme(secondTheme)
    const invalid = service.setTheme('non-existent-theme')

    // Then
    expect(HYPERTEXTUAL_THEMES[0]).toEqual({ name: 'hypertextual', label: 'Hypertextual' })
    expect(HYPERTEXTUAL_THEMES.length).toBeGreaterThan(50)
    expect(valid).toBe(secondTheme)
    expect(invalid).toBe(secondTheme)
    expect(service.theme).toBe(secondTheme)
  })
})
