import type { Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  createAtomNodeNavigation,
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusAfterBlock,
  focusBeforeBlock,
  focusBlockAtPos,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  type HtmdCommandContext,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory } from '../types.js'
import { isEditorInInsertMode } from './modal-editing.js'

// types ---------------------------------------------------------------------

export interface ImageNodeOptions {
  nodeView?: HtmdNodeViewFactory
  keymap?: Keymap<HtmdCommandContext>
}

const imageBackspaceKey = new PluginKey<number | null>('imageBackspace')

// api -----------------------------------------------------------------------

/**
 * Block image figure extension (`![alt](src "caption")`) with an editable
 * caption input, replace/remove toolbar buttons, two-step Backspace deletion,
 * and keyboard navigation:
 *
 * ```text
 * +------------------------------------------------------------+
 * |                     [Replace] [Remove]                     | <-- Tab
 * |                      [ Image Figure ]                      |
 * |              [Add a caption...              ]              | <-- ArrowUp / ArrowDown
 * +------------------------------------------------------------+
 * ```
 */
export const ImageNode = defineHtmdExtension<
  ImageNodeOptions,
  Record<string, never>,
  {
    insertImage: (attrs: {
      src: string
      srcset?: string
      alt?: string
      caption?: string
    }) => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'imageNode',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined, keymap: undefined }),
  navigation: () =>
    createAtomNodeNavigation({
      controls: [
        'input.caption-input, input[aria-label="Image caption"]',
        'button[aria-label="Replace image"]',
        'button[aria-label="Remove image"]',
      ],
      defaultControl: 'caption',
      subtext: {
        kind: 'imageCaption',
        attr: 'caption',
        control: 'caption',
        enterControl: 'caption',
        decorationAttr: 'data-pm-modal-image-caption',
        textSelector: '[data-image-caption-text]',
        inputSelector: 'input.caption-input, input[aria-label="Image caption"]',
      },
      serializeModalText: (node) =>
        `![${String(node.attrs.alt ?? '')}](${String(node.attrs.src ?? '')})`,
    }),
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
    Tab: {
      id: 'image.tabNext',
      key: 'Tab',
      label: 'Next Image Control',
      mode: 'insert',
      when: whenImageControlFocused,
      run: handleTab,
    },
    'Shift-Tab': {
      id: 'image.tabPrev',
      key: 'Shift+Tab',
      label: 'Previous Image Control',
      mode: 'insert',
      when: whenImageControlFocused,
      run: handleShiftTab,
    },
    ArrowDown: {
      id: 'image.arrowDownToCaption',
      key: 'ArrowDown',
      label: 'Focus Image Caption or Below Image',
      mode: 'insert',
      when: whenImageArrowKey,
      run: handleArrowDown,
    },
    ArrowUp: {
      id: 'image.arrowUpToCaption',
      key: 'ArrowUp',
      label: 'Focus Image Caption or Above Image',
      mode: 'insert',
      when: whenImageArrowKey,
      run: handleArrowUp,
    },
    Enter: {
      id: 'image.splitCaption',
      key: 'Enter',
      label: 'Split Image Caption to Paragraph',
      mode: 'insert',
      when: whenImageCaptionEnter,
      run: handleEnter,
    },
  }),
  pmPlugins({ editor }) {
    return [createImageCaptionFocusPlugin(editor), createImageBackspacePlugin()]
  },
})

// pm ------------------------------------------------------------------------

function createImageCaptionFocusPlugin(editor: TiptapEditor): Plugin {
  let arrowKeyPressed = false

  return new Plugin({
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
}

function createImageBackspacePlugin(): Plugin {
  return new Plugin({
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
}

// helpers -------------------------------------------------------------------

function whenImageControlFocused({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(findNodeViewControl(state, event, 'imageNode'))
}

function whenImageArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'imageNode'))
  }
  return true
}

function whenImageCaptionEnter({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(
    findNodeViewControl(state, event, 'imageNode')?.target.matches(
      'input[aria-label="Image caption"]',
    ),
  )
}

function handleTab({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'imageNode')
  if (!ctrl) return false
  const captionInput = ctrl.wrapper.querySelector<HTMLInputElement>(
    'input[aria-label="Image caption"]',
  )
  const replaceBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(
    'button[aria-label="Replace image"]',
  )
  const removeBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove image"]',
  )
  if (ctrl.target === captionInput && replaceBtn) {
    replaceBtn.focus()
    return true
  }
  if (ctrl.target.closest('button[aria-label="Replace image"]') && removeBtn) {
    removeBtn.focus()
    return true
  }
  if (ctrl.target.closest('button[aria-label="Remove image"]') && captionInput) {
    captionInput.focus()
    return true
  }
  return false
}

function handleShiftTab({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'imageNode')
  if (!ctrl) return false
  const captionInput = ctrl.wrapper.querySelector<HTMLInputElement>(
    'input[aria-label="Image caption"]',
  )
  const replaceBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(
    'button[aria-label="Replace image"]',
  )
  const removeBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove image"]',
  )
  if (ctrl.target === captionInput && removeBtn) {
    removeBtn.focus()
    return true
  }
  if (ctrl.target.closest('button[aria-label="Replace image"]') && captionInput) {
    captionInput.focus()
    return true
  }
  if (ctrl.target.closest('button[aria-label="Remove image"]') && replaceBtn) {
    replaceBtn.focus()
    return true
  }
  return false
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  const ctrl = findNodeViewControl(state, event, 'imageNode')
  if (ctrl) {
    const captionInput = ctrl.wrapper.querySelector<HTMLInputElement>(
      'input[aria-label="Image caption"]',
    )
    if (ctrl.target === captionInput) {
      captionInput.blur()
      return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
    }
    if (
      ctrl.target.closest(
        'button[aria-label="Replace image"], button[aria-label="Remove image"]',
      ) &&
      captionInput
    ) {
      captionInput.focus()
      return true
    }
    return false
  }
  if (!isAtLastVisualLine(view, state)) return false
  const nextPos = findNextBlockPos(state)
  if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'imageNode') {
    return focusBlockAtPos(editor, nextPos, 'down')
  }
  return false
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'imageNode')
  if (ctrl) {
    if (
      ctrl.target.matches('input[aria-label="Image caption"]') ||
      ctrl.target.closest('button[aria-label="Replace image"], button[aria-label="Remove image"]')
    ) {
      ctrl.target.blur()
      return focusBeforeBlock(editor, ctrl.pos)
    }
    return false
  }
  if (!isAtFirstVisualLine(view, state)) return false
  const prevPos = findPrevBlockPos(state)
  if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'imageNode') {
    return focusBlockAtPos(editor, prevPos, 'up')
  }
  return false
}

function handleEnter({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'imageNode')
  if (!ctrl || !(ctrl.target instanceof HTMLInputElement)) return false
  const caption = ctrl.target.value
  const cursorIdx = ctrl.target.selectionStart ?? caption.length
  const leftText = caption.slice(0, cursorIdx)
  const rightText = caption.slice(cursorIdx)
  ctrl.target.value = leftText
  const posAfter = ctrl.pos + ctrl.node.nodeSize
  return editor
    .chain()
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setNodeMarkup(ctrl.pos, undefined, {
          ...ctrl.node.attrs,
          caption: leftText,
        })
      }
      return true
    })
    .focus()
    .insertContentAt(posAfter, {
      type: 'paragraph',
      content: rightText ? [{ type: 'text', text: rightText }] : [],
    })
    .setTextSelection(posAfter + 1)
    .run()
}
