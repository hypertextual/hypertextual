import { THEMES, type ThemeMeta } from '@cloudvoyant/helical-ui'
import type { ThemeMode, ThemeName, ThemeServiceOptions } from './types'

const THEME_CLASS_PREFIX = 'theme-'

export const HYPERTEXTUAL_THEMES: readonly ThemeMeta[] = [
  { name: 'hypertextual', label: 'Hypertextual' },
  ...THEMES,
]

const VALID_THEME_NAMES = new Set<string>(HYPERTEXTUAL_THEMES.map((t) => t.name))

function readSystemDarkMode(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function syncDocumentTheme(theme: ThemeName, dark: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const toRemove: string[] = []
  root.classList.forEach((cls) => {
    if (cls.startsWith(THEME_CLASS_PREFIX)) {
      toRemove.push(cls)
    }
  })
  for (const cls of toRemove) {
    root.classList.remove(cls)
  }
  root.classList.add(`${THEME_CLASS_PREFIX}${theme}`)
  root.classList.toggle('dark', dark)
}

export class ThemeService {
  theme = $state<ThemeName>('hypertextual')
  themeMode = $state<ThemeMode>('system')
  systemDark = $state(readSystemDarkMode())
  darkMode = $derived(this.themeMode === 'system' ? this.systemDark : this.themeMode === 'dark')
  readonly themes: readonly ThemeMeta[] = HYPERTEXTUAL_THEMES
  private readonly themeListeners = new Set<(theme: ThemeName) => void>()
  private readonly modeListeners = new Set<(mode: ThemeMode) => void>()

  constructor(options: ThemeServiceOptions = {}) {
    if (options.initialTheme && VALID_THEME_NAMES.has(options.initialTheme)) {
      this.theme = options.initialTheme
    }
    if (options.initialMode) {
      this.themeMode = options.initialMode
    }
    if (options.onThemeChange) {
      this.themeListeners.add(options.onThemeChange)
    }
    if (options.onModeChange) {
      this.modeListeners.add(options.onModeChange)
    }
    syncDocumentTheme(this.theme, this.isDark())
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        media.addEventListener('change', (event) => {
          this.setSystemDark(event.matches)
        })
      } catch {
        // Ignore matchMedia errors
      }
    }
  }

  private isDark(): boolean {
    return this.themeMode === 'system' ? this.systemDark : this.themeMode === 'dark'
  }

  onThemeChange(listener: (theme: ThemeName) => void): () => void {
    this.themeListeners.add(listener)
    return () => {
      this.themeListeners.delete(listener)
    }
  }

  onModeChange(listener: (mode: ThemeMode) => void): () => void {
    this.modeListeners.add(listener)
    return () => {
      this.modeListeners.delete(listener)
    }
  }

  setSystemDark(dark: boolean): void {
    this.systemDark = dark
    syncDocumentTheme(this.theme, this.isDark())
  }

  setTheme(theme: ThemeName, notify = true): ThemeName {
    if (!VALID_THEME_NAMES.has(theme)) return this.theme
    this.theme = theme
    syncDocumentTheme(this.theme, this.isDark())
    if (notify) {
      for (const listener of this.themeListeners) {
        listener(theme)
      }
    }
    return this.theme
  }

  setThemeMode(mode: ThemeMode, notify = true): ThemeMode {
    this.themeMode = mode
    syncDocumentTheme(this.theme, this.isDark())
    if (notify) {
      for (const listener of this.modeListeners) {
        listener(mode)
      }
    }
    return this.themeMode
  }

  cycleThemeMode(): ThemeMode {
    const next: ThemeMode =
      this.themeMode === 'system' ? 'light' : this.themeMode === 'light' ? 'dark' : 'system'
    return this.setThemeMode(next)
  }
}

export const themeService = new ThemeService()
