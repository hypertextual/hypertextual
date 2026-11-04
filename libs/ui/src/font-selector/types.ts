export const EDITOR_FONTS = [
  'Source Code Pro',
  'Monaspace Xenon',
  'iA Writer Mono',
  'IBM Plex Mono',
  'Martian Mono',
  'Courier Prime',
  'Noto Sans Mono',
  'Space Mono',
  'Geist Mono',
  'Monaspace Argon',
  'Commit Mono',
  'Inconsolata',
] as const

export type EditorFont = (typeof EDITOR_FONTS)[number]

export interface FontSelectorProps {
  value: string
  fonts?: readonly string[]
  onchange?: (font: string) => void
  class?: string
}
