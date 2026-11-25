import type { EditorMode } from 'core-ts'
import type { PanZoomViewportState } from '../diagram-viewport/types'

export type FileViewerKind = 'image' | 'drawio-image' | 'drawio-xml'

export interface FileViewerToolbarProps {
  kind: FileViewerKind
  externalAppLabel: string
  isFullscreen: boolean
  canOpenExternal: boolean
  canFullscreen?: boolean
  onopenexternal?: (event: MouseEvent) => void
  ontogglefullscreen?: (event: MouseEvent) => void
}

export interface FileViewerProps {
  kind: FileViewerKind
  title: string
  src?: string
  srcset?: string
  sizes?: string
  xml?: string
  alt?: string
  externalAppLabel?: string
  replaceLabel?: string
  removeLabel?: string
  standalone?: boolean
  mode?: EditorMode
  fullscreen?: boolean
  scale?: number
  panX?: number
  panY?: number
  viewerScriptUrl?: string
  onopenexternal?: () => void
  onreplace?: () => void
  onremove?: () => void
  onviewportchange?: (state: PanZoomViewportState) => void
  onfocus?: (event: FocusEvent) => void
  onkeydown?: (event: KeyboardEvent) => void
  class?: string
}
