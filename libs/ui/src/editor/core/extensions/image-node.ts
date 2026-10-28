// libs/helical-ui/src/editor/extensions/image-node.ts
// Lift from ~/Projects/readership/libs/editor/src/extensions/image-node.ts.
// Adaptation: the node-view renderer is configured with nodeView instead of importing
// svelte-tiptap + the Svelte component, so helical-ui stays framework-free. The schema, the
// insertImage command, and BOTH ProseMirror plugins (arrow-key caption focus, and the two-step
// backspace-to-delete) are carried over verbatim.
import { Node } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { DecorationSet, Decoration } from '@tiptap/pm/view'
import type { NodeViewOptions } from '../types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageNode: {
      insertImage: (attrs: {
        src: string
        srcset?: string
        alt?: string
        caption?: string
      }) => ReturnType
    }
  }
}

const imageBackspaceKey = new PluginKey<number | null>('imageBackspace')

export const ImageNode = Node.create<NodeViewOptions>({
  addOptions() {
    return { nodeView: undefined }
  },

  name: 'imageNode',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      srcset: { default: null },
      alt: { default: '' },
      caption: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="image-node"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { src, srcset, alt, caption } = HTMLAttributes
    const imgAttrs = {
      src,
      srcset,
      alt: alt || '',
      sizes: '(max-width: 768px) 100vw, 720px',
      class: 'w-full object-cover',
    }
    if (!caption) {
      return ['figure', { 'data-type': 'image-node', class: 'my-6 m-0' }, ['img', imgAttrs]]
    }
    return [
      'figure',
      { 'data-type': 'image-node', class: 'my-6 m-0' },
      ['img', imgAttrs],
      ['figcaption', { class: 'mt-4 text-sm text-muted-foreground text-center italic' }, caption],
    ]
  },

  addNodeView() {
    return this.options.nodeView?.() ?? null
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },

  addProseMirrorPlugins() {
    // ── Plugin 1: arrow keys into imageNode → focus caption ──────────────────
    let arrowKeyPressed = false

    const captionFocusPlugin = new Plugin({
      key: new PluginKey('imageNodeCaptionFocus'),
      props: {
        handleKeyDown(_view, event) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            arrowKeyPressed = true
          }
          return false
        },
      },
      view() {
        return {
          update(view, prevState) {
            const { selection } = view.state
            const { selection: prevSelection } = prevState

            const movedOntoImage =
              arrowKeyPressed &&
              selection instanceof NodeSelection &&
              selection.node.type.name === 'imageNode' &&
              !(prevSelection instanceof NodeSelection && prevSelection.from === selection.from)

            arrowKeyPressed = false

            if (movedOntoImage) {
              const pos = selection.from
              const nodeSize = selection.node.nodeSize
              const dom = view.nodeDOM(pos)
              const input = dom
                ? ((dom as HTMLElement).querySelector('.caption-input') as HTMLInputElement | null)
                : null

              if (input) {
                // Clear NodeSelection synchronously so the image never renders as selected.
                const { tr, doc } = view.state
                const $after = doc.resolve(Math.min(pos + nodeSize, doc.content.size))
                view.dispatch(tr.setSelection(TextSelection.near($after)))
                input.focus({ preventScroll: true })
                setTimeout(() => {
                  const rect = input.getBoundingClientRect()
                  if (rect.bottom > window.innerHeight || rect.top < 0) {
                    input.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  }
                }, 0)
              }
            }
          },
        }
      },
    })

    // ── Plugin 2: backspace before imageNode → highlight then delete ──────────
    // Uses plugin state + decoration instead of NodeSelection so the bubble
    // menu never appears.
    const backspacePlugin = new Plugin({
      key: imageBackspaceKey,

      state: {
        init: () => null as number | null,
        apply(tr, value) {
          const meta = tr.getMeta(imageBackspaceKey)
          if (meta !== undefined) return meta as number | null
          if (tr.docChanged) return null
          if (value === null) return null
          // Clear if cursor moves away from start of block
          const { selection } = tr
          if (!selection.empty || selection.$from.parentOffset !== 0) return null
          return value
        },
      },

      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace') return false

          const { selection, doc } = view.state
          const pendingPos = imageBackspaceKey.getState(view.state)

          // Second backspace: delete the highlighted image
          if (pendingPos != null) {
            const node = doc.nodeAt(pendingPos)
            if (node?.type.name === 'imageNode') {
              view.dispatch(
                view.state.tr
                  .delete(pendingPos, pendingPos + node.nodeSize)
                  .setMeta(imageBackspaceKey, null),
              )
              return true
            }
          }

          // First backspace at start of block: highlight image above instead of deleting
          if (selection.empty && selection.$from.parentOffset === 0) {
            const $from = selection.$from
            const posBeforeBlock = $from.before($from.depth)
            const nodeBefore = doc.resolve(posBeforeBlock).nodeBefore
            if (nodeBefore?.type.name === 'imageNode') {
              const imageStart = posBeforeBlock - nodeBefore.nodeSize
              view.dispatch(view.state.tr.setMeta(imageBackspaceKey, imageStart))
              return true
            }
          }

          return false
        },

        decorations(state) {
          const pendingPos = imageBackspaceKey.getState(state)
          if (pendingPos == null) return null
          const node = state.doc.nodeAt(pendingPos)
          if (!node) return null
          return DecorationSet.create(state.doc, [
            Decoration.node(pendingPos, pendingPos + node.nodeSize, {
              class: 'image-node-pending-delete',
            }),
          ])
        },
      },
    })

    return [captionFocusPlugin, backspacePlugin]
  },
})
