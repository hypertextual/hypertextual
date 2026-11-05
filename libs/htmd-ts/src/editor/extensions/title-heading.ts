import { Plugin, PluginKey } from '@tiptap/pm/state'
import { defineHtmdExtension } from '../define-htmd-extension.js'

/** Enforce the title after any preserved frontmatter. Keep raw blocks intact. */
export const TitleHeading = defineHtmdExtension({
  name: 'titleHeading',
  kind: 'behavior',
  pmPlugins() {
    return [
      new Plugin({
        key: new PluginKey('titleHeading'),
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
      }),
    ]
  },
})
