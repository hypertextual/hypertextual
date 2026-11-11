import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { CommandStyle } from '@cloudvoyant/helical-ui'
import { HYPERTEXTUAL_THEMES, themeService, type ThemeMode, type ThemeName } from '@hypertextual/ui'

const PANE_OUTLINE_KEY = 'hypertextual.settings.paneOutline'
const CLICK_TO_INSERT_KEY = 'hypertextual.settings.clickToInsert'
const THEME_MODE_KEY = 'hypertextual.settings.themeMode'
const THEME_KEY = 'hypertextual.settings.theme'
const COMMAND_STYLE_KEY = 'hypertextual.settings.commandStyle'

const VALID_THEME_NAMES = new Set<string>(HYPERTEXTUAL_THEMES.map((t) => t.name))

/** Normalized application command surface style (`'palette'` or `'menu'`). */
export type AppCommandStyle = 'palette' | 'menu'

function readSetting<T>(key: string, parse: (raw: string) => T | null, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) {
      const parsed = parse(raw)
      if (parsed !== null) return parsed
    }
  } catch {
    // Ignore storage access errors
  }
  return fallback
}

function writeSetting(key: string, value: string | boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Ignore storage access errors
  }
}

const parseBoolean = (raw: string): boolean | null =>
  raw === 'true' ? true : raw === 'false' ? false : null

const parseThemeMode = (raw: string): ThemeMode | null =>
  raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null

const parseTheme = (raw: string): ThemeName | null => (VALID_THEME_NAMES.has(raw) ? raw : null)

function normalizeCommandStyle(style: string | null | undefined): AppCommandStyle {
  return style === 'menu' || style === 'colon' ? 'menu' : 'palette'
}

const parseCommandStyle = (raw: string): AppCommandStyle | null =>
  raw === 'palette' || raw === 'menu' || raw === 'colon' ? normalizeCommandStyle(raw) : null

export class SettingsService {
  paneOutline = $state(readSetting(PANE_OUTLINE_KEY, parseBoolean, true))
  clickToInsert = $state(readSetting(CLICK_TO_INSERT_KEY, parseBoolean, true))
  commandStyle = $state<AppCommandStyle>(
    readSetting(COMMAND_STYLE_KEY, parseCommandStyle, 'palette'),
  )

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--font-mono')
    }
    const initialTheme = readSetting(THEME_KEY, parseTheme, 'hypertextual')
    const initialMode = readSetting(THEME_MODE_KEY, parseThemeMode, 'system')
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
    const normalized = normalizeCommandStyle(style)
    this.commandStyle = normalized
    writeSetting(COMMAND_STYLE_KEY, normalized)
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
