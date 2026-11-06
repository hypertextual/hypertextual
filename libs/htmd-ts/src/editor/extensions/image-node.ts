import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  defineHtmdExtension,
  findNextBlockPos,
  findPrevBlockPos,
  focusBlockAtPos,
  isAtFirstVisualLine,
  isAtLastVisualLine,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'
import { isEditorInInsertMode } from './modal-keymap.js'

export interface ImageNodeOptions {
  nodeView?: HtmdNodeViewFactory
}

const imageBackspaceKey = new PluginKey<number | null>('imageBackspace')

export const ImageNode = defineHtmdExtension<
  ImageNodeOptions,
  Record<string, never>,
  {
    insertImage: (attrs: {
      src: string
      srcset?: string
      alt?: string
      caption?: string
    }) => (ctx: { commands: { insertContent: (value: unknown) => boolean } }) => boolean
  }
>({
  name: 'imageNode',
  kind: 'node',
  group: 'block',
  atom: true,
  defaultOptions: () => ({ nodeView: undefined }),
  attributes: {
    src: { default: null },
    srcset: { default: null },
    alt: { default: '' },
    caption: { default: '' },
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
  commands: () => ({
    insertImage:
      (attrs) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'imageNode',
          attrs,
        }),
  }),
  keymap: () => ({
    ArrowDown: {
      id: 'image.arrowDownToCaption',
      key: 'ArrowDown',
      label: 'Focus Image Caption',
      mode: 'insert',
      when: (_, event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[contenteditable="false"]')
        ) {
          return false
        }
        return true
      },
      run: ({ editor, state, view }) => {
        if (!isAtLastVisualLine(view, state)) return false
        const nextPos = findNextBlockPos(state)
        if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'imageNode') {
          return focusBlockAtPos(editor, nextPos, 'down')
        }
        return false
      },
    },
    ArrowUp: {
      id: 'image.arrowUpToCaption',
      key: 'ArrowUp',
      label: 'Focus Image Caption',
      mode: 'insert',
      when: (_, event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[contenteditable="false"]')
        ) {
          return false
        }
        return true
      },
      run: ({ editor, state, view }) => {
        if (!isAtFirstVisualLine(view, state)) return false
        const prevPos = findPrevBlockPos(state)
        if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'imageNode') {
          return focusBlockAtPos(editor, prevPos, 'up')
        }
        return false
      },
    },
  }),
  pmPlugins({ editor }) {
    let arrowKeyPressed = false

    const captionFocusPlugin = new Plugin({
      key: new PluginKey('imageNodeCaptionFocus'),
      props: {
        handleKeyDown(_view, event) {
          if (!isEditorInInsertMode(editor)) {
            arrowKeyPressed = false
            return false
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            arrowKeyPressed = true
          }
          return false
        },
      },
      view() {
        return {
          update(view, prevState) {
            if (!isEditorInInsertMode(editor)) {
              arrowKeyPressed = false
              return
            }
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
                const modalStorage = (
                  editor.storage as
                    { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
                )?.modalKeymap
                if (modalStorage) modalStorage.activeCompoundBlockPos = pos
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

    const backspacePlugin = new Plugin({
      key: imageBackspaceKey,
      state: {
        init: () => null as number | null,
        apply(tr, value) {
          const meta = tr.getMeta(imageBackspaceKey)
          if (meta !== undefined) return meta as number | null
          if (tr.docChanged) return null
          if (value === null) return null
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
