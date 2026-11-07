import { defineHtmdExtension } from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory, UrlMentionAttributes } from '../types.js'

// types ---------------------------------------------------------------------

export interface UrlMentionOptions {
  nodeView?: HtmdNodeViewFactory
}

// api -----------------------------------------------------------------------

/**
 * Inline URL mention pill (`:url-mention[...]{url="..."}`) with favicon and
 * title display:
 *
 * ```text
 * Check out [🌐 example.com] for details.
 * ```
 */
export const UrlMention = defineHtmdExtension<
  UrlMentionOptions,
  Record<string, never>,
  {
    insertUrlMention: (
      attributes: UrlMentionAttributes,
    ) => (ctx: import('../define-htmd-extension.js').HtmdCommandContext) => boolean
  }
>({
  name: 'urlMention',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined }),
  commands: () => ({
    insertUrlMention:
      (attributes: UrlMentionAttributes) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'urlMention',
          attrs: attributes,
        }),
  }),
})
