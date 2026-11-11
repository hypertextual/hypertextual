import type { Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export interface WindowInplaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Header title text or snippet. */
  title?: string | Snippet
  /** Optional icon snippet rendered before the title. */
  icon?: Snippet
  /** Whether the window fills the enclosing editor region as a fullscreen overlay. */
  fullscreen?: boolean
  /** Optional toolbar controls snippet rendered on the right side of the header. */
  toolbar?: Snippet
  /** Optional footer snippet rendered below the body (e.g. error bar). */
  footer?: Snippet
  /** Main body content rendered inside the window. */
  children: Snippet
  /** Optional caller class overrides merged onto the root container. */
  class?: string
  /** Optional caller class overrides merged onto the body container. */
  bodyClass?: string
}
