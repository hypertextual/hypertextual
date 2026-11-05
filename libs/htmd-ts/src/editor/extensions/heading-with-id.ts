import { defineHtmdExtension, mergeHtmlAttributes } from '../define-htmd-extension.js'

export interface HeadingWithIdOptions {
  levels: Array<1 | 2 | 3 | 4 | 5 | 6>
  HTMLAttributes: Record<string, unknown>
}

export const HeadingWithId = defineHtmdExtension<HeadingWithIdOptions>({
  name: 'heading',
  kind: 'node',
  base: 'heading',
  defaultOptions: () => ({
    levels: [1, 2, 3, 4, 5, 6],
    HTMLAttributes: {},
  }),
  renderHTML({ node, HTMLAttributes, options }) {
    const level = node.attrs.level as number
    const id = node.textContent.toLowerCase().replace(/\s+/g, '-')
    return [`h${level}`, mergeHtmlAttributes(options.HTMLAttributes, HTMLAttributes, { id }), 0]
  },
})
