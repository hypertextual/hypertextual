import type { ThemeMode, ThemeServiceOptions } from './types'

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

export class ThemeService {
  themeMode = $state<ThemeMode>('system')
  systemDark = $state(readSystemDarkMode())
  darkMode = $derived(this.themeMode === 'system' ? this.systemDark : this.themeMode === 'dark')
  private readonly listeners = new Set<(mode: ThemeMode) => void>()

  constructor(options: ThemeServiceOptions = {}) {
    if (options.initialMode) {
      this.themeMode = options.initialMode
    }
    if (options.onModeChange) {
      this.listeners.add(options.onModeChange)
    }
    syncDocumentDarkClass(this.darkMode)
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

  onModeChange(listener: (mode: ThemeMode) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSystemDark(dark: boolean): void {
    this.systemDark = dark
    syncDocumentDarkClass(this.darkMode)
  }

  setThemeMode(mode: ThemeMode, notify = true): ThemeMode {
    this.themeMode = mode
    syncDocumentDarkClass(this.darkMode)
    if (notify) {
      for (const listener of this.listeners) {
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
