import type { EditorMode } from 'core-ts'
import type { PanZoomViewportState } from '../diagram-viewport/types'

export type FileViewerKind = 'image' | 'drawio-image' | 'drawio-xml'

export interface FileViewerToolbarProps {
  kind: FileViewerKind
  externalAppLabel: string
  isFullscreen: boolean
  canOpenExternal: boolean
  canRefresh: boolean
  onopenexternal?: (event: MouseEvent) => void
  onrefresh?: (event: MouseEvent) => void
  ontogglefullscreen?: (event: MouseEvent) => void
}

export interface FileViewerProps {
  kind: FileViewerKind
  title: string
  src?: string
  xml?: string
  alt?: string
  externalAppLabel?: string
  standalone?: boolean
  mode?: EditorMode
  fullscreen?: boolean
  scale?: number
  panX?: number
  panY?: number
  viewerScriptUrl?: string
  onopenexternal?: () => void
  onrefresh?: () => void
  onreplace?: () => void
  onremove?: () => void
  onviewportchange?: (state: PanZoomViewportState) => void
  onfocus?: (event: FocusEvent) => void
  onkeydown?: (event: KeyboardEvent) => void
  class?: string
}
