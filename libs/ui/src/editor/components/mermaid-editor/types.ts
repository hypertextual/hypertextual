import type { HtmdEditor } from 'htmd-ts'
import type { SvelteNodeViewProps } from '../svelte-node-view.svelte'

export type MermaidEditorProps = SvelteNodeViewProps<HtmdEditor>

export interface MermaidToolbarProps {
  /** Whether the block is in code-editing (`insert` or `select`) mode. */
  isCodeMode: boolean
  /** Whether the Mermaid window is currently expanded to fullscreen. */
  isFullscreen: boolean
  /** Current Mermaid source code for clipboard copy in code mode. */
  sourceCode: string
  /** Callback invoked when the Edit button is clicked in normal mode. */
  onedit: (event: MouseEvent) => void
  /** Callback invoked when the Fullscreen / Minimize button is clicked. */
  ontogglefullscreen: (event: MouseEvent) => void
}

export interface MermaidErrorBarProps {
  /** Error message from the Mermaid renderer. */
  error: string
  /** Whether the Mermaid window is currently expanded to fullscreen. */
  isFullscreen?: boolean
  /** Optional caller classes. */
  class?: string
}
