import { defineHtmdExtension } from '../define-htmd-extension.js'

// types ---------------------------------------------------------------------

export interface HeadingWithIdOptions {
  levels: Array<1 | 2 | 3 | 4 | 5 | 6>
  HTMLAttributes: Record<string, unknown>
}

// api -----------------------------------------------------------------------

/**
 * Heading extension that derives a deterministic slug `id` attribute from the
 * heading's text content when rendering HTML:
 *
 * ```text
 * ## Getting Started  -->  <h2 id="getting-started">Getting Started</h2>
 * ```
 */
export const HeadingWithId = defineHtmdExtension<HeadingWithIdOptions>({
  name: 'heading',
  kind: 'node',
  defaultOptions: () => ({
    levels: [1, 2, 3, 4, 5, 6],
    HTMLAttributes: {},
  }),
})
