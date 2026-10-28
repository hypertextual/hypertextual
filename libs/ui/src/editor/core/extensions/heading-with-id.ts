// libs/helical-ui/src/editor/extensions/heading-with-id.ts
// Lift from ~/Projects/readership/libs/editor/src/components/Reader.svelte, where this heading
// variant was defined inline. It renders `id` attributes derived from the heading text so the
// read-only reader gets anchor-linkable headings. The editor itself uses the plain heading.
import { Heading } from '@tiptap/extension-heading'
import { mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

export const HeadingWithId = Heading.extend({
  renderHTML({ node, HTMLAttributes }: { node: PMNode; HTMLAttributes: Record<string, unknown> }) {
    const level = node.attrs.level as number
    const id = node.textContent.toLowerCase().replace(/\s+/g, '-')
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { id }), 0]
  },
})
