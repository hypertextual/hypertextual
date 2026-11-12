import type { Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export interface WindowInplaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether the window fills the enclosing editor region as a fullscreen overlay. */
  fullscreen?: boolean
  /** Compound subcomponents (`WindowInplaceHeader`, `WindowInplaceBody`, `WindowInplaceFooter`). */
  children?: Snippet
  /** Optional caller class overrides merged onto the root container. */
  class?: string
}

export interface WindowInplaceHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Header contents (`WindowInplaceTitle`, `WindowInplaceToolbar`). */
  children?: Snippet
  /** Optional caller class overrides merged onto the header bar. */
  class?: string
}

export interface WindowInplaceTitleProps extends HTMLAttributes<HTMLSpanElement> {
  /** Title icon and label content. */
  children?: Snippet
  /** Optional caller class overrides merged onto the title element. */
  class?: string
}

export interface WindowInplaceToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Toolbar action buttons rendered on the right side of the header. */
  children?: Snippet
  /** Optional caller class overrides merged onto the toolbar container. */
  class?: string
}

export interface WindowInplaceBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** Main body content rendered inside the window. */
  children?: Snippet
  /** Optional caller class overrides merged onto the body container. */
  class?: string
}

export interface WindowInplaceFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Footer content rendered below the body (e.g. status or error banner). */
  children?: Snippet
  /** Optional caller class overrides merged onto the footer container. */
  class?: string
}
