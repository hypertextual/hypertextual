import type { Keymap } from 'core-ts'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
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
import type { HtmdNodeViewFactory, LinkPreviewAttributes, LinkPreviewFetcher } from '../types.js'
import { isEditorInInsertMode } from './modal-editing.js'

// types ---------------------------------------------------------------------

export interface LinkPreviewOptions {
  nodeView?: HtmdNodeViewFactory
  fetchLinkPreview?: LinkPreviewFetcher
  keymap?: Keymap<HtmdCommandContext>
}

export interface LinkPreviewStorage {
  fetchLinkPreview?: LinkPreviewFetcher
}

const URL_INPUT_SELECTOR = 'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]'

// api -----------------------------------------------------------------------

/**
 * Bookmark card and YouTube embed extension (`::bookmark{...}` / `::youtube{...}`)
 * with an editable URL bar, metadata preview, and keyboard navigation:
 *
 * ```text
 * +------------------------------------------------------------+
 * | [https://example.com/article                   ] [Remove]  | <-- Tab / ArrowUp / ArrowDown
 * | +--------------------------------------------------------+ |
 * | | Example Title - Description                            | |
 * | +--------------------------------------------------------+ |
 * +------------------------------------------------------------+
 * ```
 */
export const LinkPreview = defineHtmdExtension<
  LinkPreviewOptions,
  LinkPreviewStorage,
  {
    insertLinkPreview: (attributes: LinkPreviewAttributes) => (ctx: HtmdCommandContext) => boolean
  }
>({
  name: 'linkPreview',
  kind: 'node',
  defaultOptions: () => ({ nodeView: undefined, fetchLinkPreview: undefined, keymap: undefined }),
  navigation: () =>
    createAtomNodeNavigation({
      controls: [
        URL_INPUT_SELECTOR,
        'button[aria-label="Remove link preview"], button[aria-label="Remove YouTube embed"]',
      ],
      subtext: {
        kind: 'linkPreviewUrl',
        attr: 'url',
        textSelector: '[data-bookmark-url-text]',
        inputSelector: URL_INPUT_SELECTOR,
      },
    }),
  createStorage: (options) => ({
    fetchLinkPreview: options.fetchLinkPreview,
  }),
  pmPlugins({ editor }) {
    return [createLinkPreviewUrlFocusPlugin(editor)]
  },
  commands: () => ({
    insertLinkPreview:
      (attributes: LinkPreviewAttributes) =>
      ({ commands }) =>
        commands.insertContent({
          type: 'linkPreview',
          attrs: attributes,
        }),
  }),
  keymap: () => ({
    Tab: {
      id: 'linkPreview.tabNext',
      key: 'Tab',
      label: 'Next Link Preview Control',
      mode: 'insert',
      when: whenLinkPreviewControlFocused,
      run: handleTab,
    },
    'Shift-Tab': {
      id: 'linkPreview.tabPrev',
      key: 'Shift+Tab',
      label: 'Previous Link Preview Control',
      mode: 'insert',
      when: whenLinkPreviewControlFocused,
      run: handleShiftTab,
    },
    ArrowDown: {
      id: 'linkPreview.arrowDownToUrl',
      key: 'ArrowDown',
      label: 'Focus Link Preview URL or Below Link Preview',
      mode: 'insert',
      when: whenLinkPreviewArrowKey,
      run: handleArrowDown,
    },
    ArrowUp: {
      id: 'linkPreview.arrowUpToUrl',
      key: 'ArrowUp',
      label: 'Focus Link Preview URL or Above Link Preview',
      mode: 'insert',
      when: whenLinkPreviewArrowKey,
      run: handleArrowUp,
    },
    Enter: {
      id: 'linkPreview.focusAfterEnter',
      key: 'Enter',
      label: 'Commit Link Preview URL',
      mode: 'insert',
      when: whenLinkPreviewUrlEnter,
      run: handleEnter,
    },
  }),
})

// pm ------------------------------------------------------------------------

function createLinkPreviewUrlFocusPlugin(editor: TiptapEditor): Plugin {
  let lastArrowKey: 'ArrowDown' | 'ArrowUp' | null = null

  return new Plugin({
    key: new PluginKey('linkPreviewUrlFocus'),
    props: {
      handleKeyDown(_view, event) {
        if (!isEditorInInsertMode(editor)) {
          lastArrowKey = null
          return false
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          lastArrowKey = event.key
        } else {
          lastArrowKey = null
        }
        return false
      },
    },
    view() {
      return {
        update(view, prevState) {
          if (!isEditorInInsertMode(editor)) {
            lastArrowKey = null
            return
          }
          const { selection } = view.state
          const { selection: prevSelection } = prevState

          const movedOntoLinkPreview =
            lastArrowKey !== null &&
            selection instanceof NodeSelection &&
            selection.node.type.name === 'linkPreview' &&
            !(prevSelection instanceof NodeSelection && prevSelection.from === selection.from)

          const arrowDir = lastArrowKey
          lastArrowKey = null

          if (movedOntoLinkPreview) {
            const pos = selection.from
            const nodeSize = selection.node.nodeSize
            const dom = view.nodeDOM(pos)
            const input =
              dom instanceof HTMLElement
                ? dom.querySelector<HTMLInputElement>(URL_INPUT_SELECTOR)
                : null

            if (input) {
              const modalStorage = (
                editor.storage as
                  { modalKeymap?: { activeCompoundBlockPos: number | null } } | undefined
              )?.modalKeymap
              if (modalStorage) modalStorage.activeCompoundBlockPos = pos
              const { tr, doc } = view.state
              const targetPos =
                arrowDir === 'ArrowUp'
                  ? Math.max(0, pos)
                  : Math.min(pos + nodeSize, doc.content.size)
              const $resolved = doc.resolve(targetPos)
              view.dispatch(
                tr.setSelection(TextSelection.near($resolved, arrowDir === 'ArrowUp' ? -1 : 1)),
              )
              input.focus({ preventScroll: true })
            }
          }
        },
      }
    },
  })
}

// helpers -------------------------------------------------------------------

function whenLinkPreviewControlFocused(
  { state }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  return Boolean(findNodeViewControl(state, event, 'linkPreview'))
}

function whenLinkPreviewArrowKey({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  if (event.target instanceof HTMLElement && event.target.closest('[contenteditable="false"]')) {
    return Boolean(findNodeViewControl(state, event, 'linkPreview'))
  }
  return true
}

function whenLinkPreviewUrlEnter({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  return Boolean(
    findNodeViewControl(state, event, 'linkPreview')?.target.matches(URL_INPUT_SELECTOR),
  )
}

function handleTab({ state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'linkPreview')
  if (!ctrl) return false
  const urlInput = ctrl.wrapper.querySelector<HTMLInputElement>(URL_INPUT_SELECTOR)
  const removeBtn = ctrl.wrapper.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove preview"]',
  )
  if (ctrl.target === urlInput && removeBtn) {
    removeBtn.focus()
    return true
  }
  if (ctrl.target.closest('button[aria-label="Remove preview"]') && urlInput) {
    urlInput.focus()
    return true
  }
  return false
}

function handleShiftTab(ctx: HtmdCommandContext, event: KeyboardEvent): boolean {
  return handleTab(ctx, event)
}

function handleArrowDown(
  { editor, state, view }: HtmdCommandContext,
  event: KeyboardEvent,
): boolean {
  const ctrl = findNodeViewControl(state, event, 'linkPreview')
  if (ctrl) {
    if (
      ctrl.target.matches(URL_INPUT_SELECTOR) ||
      ctrl.target.closest('button[aria-label="Remove preview"]')
    ) {
      ctrl.target.blur()
      return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
    }
    return false
  }
  if (!isAtLastVisualLine(view, state)) return false
  const nextPos = findNextBlockPos(state)
  if (nextPos !== null && state.doc.nodeAt(nextPos)?.type.name === 'linkPreview') {
    return focusBlockAtPos(editor, nextPos, 'down')
  }
  return false
}

function handleArrowUp({ editor, state, view }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'linkPreview')
  if (ctrl) {
    if (
      ctrl.target.matches(URL_INPUT_SELECTOR) ||
      ctrl.target.closest('button[aria-label="Remove preview"]')
    ) {
      ctrl.target.blur()
      return focusBeforeBlock(editor, ctrl.pos)
    }
    return false
  }
  if (!isAtFirstVisualLine(view, state)) return false
  const prevPos = findPrevBlockPos(state)
  if (prevPos !== null && state.doc.nodeAt(prevPos)?.type.name === 'linkPreview') {
    return focusBlockAtPos(editor, prevPos, 'up')
  }
  return false
}

function handleEnter({ editor, state }: HtmdCommandContext, event: KeyboardEvent): boolean {
  const ctrl = findNodeViewControl(state, event, 'linkPreview')
  if (!ctrl) return false
  ctrl.target.blur()
  return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
}
