import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { themeService, type ThemeMode } from '@hypertextual/ui'

const PANE_OUTLINE_KEY = 'hypertextual.settings.paneOutline'
const CLICK_TO_INSERT_KEY = 'hypertextual.settings.clickToInsert'
const THEME_MODE_KEY = 'hypertextual.settings.themeMode'

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // Ignore storage access errors
  }
  return fallback
}

function writeBoolean(key: string, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // Ignore storage access errors
  }
}

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(THEME_MODE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Ignore storage access errors
  }
  return 'system'
}

function writeThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_MODE_KEY, mode)
  } catch {
    // Ignore storage access errors
  }
}

export class SettingsService {
  paneOutline = $state(readBoolean(PANE_OUTLINE_KEY, true))
  clickToInsert = $state(readBoolean(CLICK_TO_INSERT_KEY, true))

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--font-mono')
    }
    const initialMode = readThemeMode()
    themeService.setThemeMode(initialMode, false)
    this.syncTauriTheme(initialMode)
    themeService.onModeChange((mode) => {
      writeThemeMode(mode)
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

  togglePaneOutline(): boolean {
    this.paneOutline = !this.paneOutline
    writeBoolean(PANE_OUTLINE_KEY, this.paneOutline)
    return this.paneOutline
  }

  toggleClickToInsert(): boolean {
    this.clickToInsert = !this.clickToInsert
    writeBoolean(CLICK_TO_INSERT_KEY, this.clickToInsert)
    return this.clickToInsert
  }
}
