import type { ThemeService } from './themeService.svelte'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeServiceOptions {
  initialMode?: ThemeMode
  onModeChange?: (mode: ThemeMode) => void
}

export interface ThemeToggleProps {
  theme?: ThemeService
  class?: string
}
