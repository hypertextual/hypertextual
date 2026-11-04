import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type ThemeMode = 'light' | 'dark' | 'system'

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

function readSystemDarkMode(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function syncDocumentDarkClass(dark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('theme-vercel')
  document.documentElement.classList.add('theme-hypertextual')
  document.documentElement.classList.toggle('dark', dark)
}

export class SettingsService {
  paneOutline = $state(readBoolean(PANE_OUTLINE_KEY, true))
  clickToInsert = $state(readBoolean(CLICK_TO_INSERT_KEY, true))
  themeMode = $state<ThemeMode>(readThemeMode())
  systemDark = $state(readSystemDarkMode())
  darkMode = $derived(this.themeMode === 'system' ? this.systemDark : this.themeMode === 'dark')

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--font-mono')
    }
    this.applyThemeMode(this.themeMode)
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        media.addEventListener('change', (event) => {
          this.systemDark = event.matches
          syncDocumentDarkClass(this.darkMode)
        })
      } catch {
        // Ignore matchMedia errors
      }
    }
    if (isTauri()) {
      void getCurrentWindow()
        .onThemeChanged(({ payload }) => {
          this.systemDark = payload === 'dark'
          syncDocumentDarkClass(this.darkMode)
        })
        .catch(() => {})
    }
  }

  private applyThemeMode(mode: ThemeMode): void {
    syncDocumentDarkClass(this.darkMode)
    if (!isTauri()) return
    const win = getCurrentWindow()
    void win
      .setTheme(mode === 'system' ? null : mode)
      .catch(() => {})
      .then(() => win.theme())
      .then((osTheme) => {
        if (osTheme) {
          this.systemDark = osTheme === 'dark'
        } else {
          this.systemDark = readSystemDarkMode()
        }
        syncDocumentDarkClass(this.darkMode)
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

  setThemeMode(mode: ThemeMode): ThemeMode {
    this.themeMode = mode
    writeThemeMode(mode)
    this.applyThemeMode(mode)
    return this.themeMode
  }

  cycleThemeMode(): ThemeMode {
    const next: ThemeMode =
      this.themeMode === 'system' ? 'light' : this.themeMode === 'light' ? 'dark' : 'system'
    return this.setThemeMode(next)
  }
}
