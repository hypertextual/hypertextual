import { Plugin, PluginKey } from '@tiptap/pm/state'
import { defineHtmdExtension } from '../define-htmd-extension.js'

// types ---------------------------------------------------------------------

const titleHeadingKey = new PluginKey('titleHeading')

// api -----------------------------------------------------------------------

/**
 * Enforces an H1 title heading as the first content block after any preserved
 * YAML/TOML frontmatter (`unparsedBlock`):
 *
 * ```text
 * ---                      <-- Frontmatter stays at index 0
 * tags: [notes]
 * ---
 * # Article Title          <-- Enforced H1 heading immediately after frontmatter
 * Body paragraph...
 * ```
 */
export const TitleHeading = defineHtmdExtension({
  name: 'titleHeading',
  kind: 'behavior',
  pmPlugins() {
    return [createTitleHeadingPlugin()]
  },
})

// pm ------------------------------------------------------------------------

function createTitleHeadingPlugin(): Plugin {
  return new Plugin({
    key: titleHeadingKey,
    appendTransaction: (_transactions, _oldState, newState) => {
      const heading = newState.schema.nodes.heading
      if (!heading) return null
      const tr = newState.tr
      let modified = false

      // Frontmatter must stay ahead of the title to preserve its source syntax.
      let offset = 0
      let firstNode = newState.doc.firstChild
      while (
        firstNode?.type.name === 'unparsedBlock' &&
        ['yaml', 'toml'].includes(firstNode.attrs.kind)
      ) {
        offset += firstNode.nodeSize
        firstNode = newState.doc.nodeAt(offset)
      }

      if (!firstNode) {
        tr.insert(offset, heading.create({ level: 1 }))
        modified = true
      } else if (firstNode.type.name === 'unparsedBlock') {
        tr.insert(offset, heading.create({ level: 1 }))
        modified = true
      } else if (firstNode.type.name !== 'heading' || firstNode.attrs.level !== 1) {
        const h1 = heading.create({ level: 1 }, firstNode.content)
        tr.replaceWith(offset, offset + firstNode.nodeSize, h1)
        modified = true
      }

      return modified ? tr : null
    },
  })
}
