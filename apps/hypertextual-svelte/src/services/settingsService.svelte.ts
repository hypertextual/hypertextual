import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { CommandStyle } from '@cloudvoyant/helical-ui'
import { themeService, type ThemeMode, type ThemeName } from '@cloudvoyant/helical-svelte'

// TODO(HYPE-176): Move settings persistence from window.localStorage to filesystem config via hyped-fs
// (https://linear.app/cloudvoyant/issue/HYPE-176/persist-user-settings-on-the-filesystem-via-hyped-fs-instead-of).
const PANE_OUTLINE_KEY = 'hypertextual.settings.paneOutline'
const CLICK_TO_INSERT_KEY = 'hypertextual.settings.clickToInsert'
const THEME_MODE_KEY = 'hypertextual.settings.themeMode'
const THEME_KEY = 'hypertextual.settings.theme'
const COMMAND_STYLE_KEY = 'hypertextual.settings.commandStyle'

/** Normalized application command surface style (`'palette'` or `'menu'`). */
export type AppCommandStyle = 'palette' | 'menu'

// TODO(HYPE-176): Replace window.localStorage read/write helpers with atomic filesystem config persistence
// via hyped-fs (https://linear.app/cloudvoyant/issue/HYPE-176/persist-user-settings-on-the-filesystem-via-hyped-fs-instead-of).
function readSetting<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  } catch {
    return fallback
  }
}

function writeSetting<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage access errors
  }
}

export class SettingsService {
  paneOutline = $state(readSetting(PANE_OUTLINE_KEY, true))
  clickToInsert = $state(readSetting(CLICK_TO_INSERT_KEY, true))
  commandStyle = $state<AppCommandStyle>(readSetting<AppCommandStyle>(COMMAND_STYLE_KEY, 'palette'))

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--font-mono')
    }
    const initialTheme = readSetting<ThemeName>(THEME_KEY, 'hypertextual')
    const initialMode = readSetting<ThemeMode>(THEME_MODE_KEY, 'system')
    themeService.registerThemes([{ name: 'hypertextual', label: 'Hypertextual' }], {
      defaultTheme: 'hypertextual',
    })
    themeService.setTheme(initialTheme, false)
    themeService.setThemeMode(initialMode, false)
    this.syncTauriTheme(initialMode)
    themeService.onThemeChange((theme) => {
      writeSetting(THEME_KEY, theme)
    })
    themeService.onModeChange((mode) => {
      writeSetting(THEME_MODE_KEY, mode)
      this.syncTauriTheme(mode)
    })
    if (isTauri()) {
      void getCurrentWindow()
        .onThemeChanged(({ payload }) => {
          themeService.setSystemDark(payload === 'dark')
        })
        .catch(() => {})
    }
  }

  private syncTauriTheme(mode: ThemeMode): void {
    if (!isTauri()) return
    const win = getCurrentWindow()
    void win
      .setTheme(mode === 'system' ? null : mode)
      .catch(() => {})
      .then(() => win.theme())
      .then((osTheme) => {
        if (osTheme) {
          themeService.setSystemDark(osTheme === 'dark')
        }
      })
      .catch(() => {})
  }

  setCommandStyle(style: CommandStyle): AppCommandStyle {
    this.commandStyle = style === 'menu' || style === 'colon' ? 'menu' : 'palette'
    writeSetting(COMMAND_STYLE_KEY, this.commandStyle)
    return this.commandStyle
  }

  toggleCommandStyle(): AppCommandStyle {
    return this.setCommandStyle(this.commandStyle === 'palette' ? 'menu' : 'palette')
  }

  togglePaneOutline(): boolean {
    this.paneOutline = !this.paneOutline
    writeSetting(PANE_OUTLINE_KEY, this.paneOutline)
    return this.paneOutline
  }

  toggleClickToInsert(): boolean {
    this.clickToInsert = !this.clickToInsert
    writeSetting(CLICK_TO_INSERT_KEY, this.clickToInsert)
    return this.clickToInsert
  }
}
