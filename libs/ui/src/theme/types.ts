import type { ThemeMeta } from '@cloudvoyant/helical-ui'
import type { ThemeService } from './themeService.svelte'

export type { ThemeMeta }
export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeName = string

export interface ThemeServiceOptions {
  initialTheme?: ThemeName
  initialMode?: ThemeMode
  onThemeChange?: (theme: ThemeName) => void
  onModeChange?: (mode: ThemeMode) => void
}

export interface ThemeToggleProps {
  theme?: ThemeService
  class?: string
}
