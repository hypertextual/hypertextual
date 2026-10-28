// libs/helical-ui/src/editor/extensions/title-heading.ts
// Adapted from ~/Projects/readership/libs/editor/src/extensions/title-heading.ts.
// Framework-free: imports only @tiptap/core and @tiptap/pm/state.
// Enforce the title after any preserved frontmatter. Keep raw blocks intact.
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const TitleHeading = Extension.create({
  name: 'titleHeading',

  addProseMirrorPlugins() {
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
            // If document is empty, insert heading
            tr.insert(offset, heading.create({ level: 1 }))
            modified = true
          } else if (firstNode.type.name === 'unparsedBlock') {
            tr.insert(offset, heading.create({ level: 1 }))
            modified = true
          } else if (firstNode.type.name !== 'heading' || firstNode.attrs.level !== 1) {
            // If first node is not H1, replace it with H1
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
