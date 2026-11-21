import type { TabsListVariants, TabsTriggerVariants } from './styles'

/** One open document tab in the tab strip. */
export interface TabItem {
  /** Unique tab identifier (typically the workspace-relative file path). */
  value: string
  /** Display label rendered inside the tab trigger. */
  label: string
  /** Full path or tooltip shown on hover. */
  title?: string
  /** Shows a subtle dirty indicator dot when the document has unsaved edits. */
  dirty?: boolean
  /** Whether the tab displays a close button (defaults to true). */
  closable?: boolean
}

/** Public props for the reusable `Tabs` component. */
export interface TabsProps {
  /** Ordered list of tabs to render. */
  items: TabItem[]
  /** Currently active tab value, or null when no tab is active. */
  value: string | null
  /** Accessible label for the tab list. */
  ariaLabel?: string
  /** Visual density variant. */
  size?: TabsListVariants['size'] & TabsTriggerVariants['size']
  /** Optional caller class merged onto the root container. */
  class?: string
  /** Fired when the user activates a tab. */
  onchange: (value: string) => void
  /** Fired when the user clicks a tab's close button or middle-clicks the tab. */
  onclose?: (value: string) => void
}
