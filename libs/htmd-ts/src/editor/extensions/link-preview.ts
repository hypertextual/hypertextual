import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
  defineHtmdExtension,
  findNextBlockPos,
  findNodeViewControl,
  findPrevBlockPos,
  focusAfterBlock,
  focusBeforeBlock,
  focusBlockAtPos,
  isAtFirstVisualLine,
  isAtLastVisualLine,
  mergeHtmlAttributes,
} from '../define-htmd-extension.js'
import type { HtmdNodeViewFactory, LinkPreviewAttributes, LinkPreviewFetcher } from '../types.js'
import { isEditorInInsertMode } from './modal-keymap.js'

export interface LinkPreviewOptions {
  nodeView?: HtmdNodeViewFactory
  fetchLinkPreview?: LinkPreviewFetcher
}

export interface LinkPreviewStorage {
  fetchLinkPreview?: LinkPreviewFetcher
}

function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : ''
  } catch {
    return ''
  }
}

function safeEmbedUrl(value: unknown): string {
  const url = safeUrl(value)
  if (!url) return ''

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    let videoId: string | null | undefined

    if (host === 'youtu.be') {
      videoId = /^\/([^/]+)/.exec(parsed.pathname)?.[1]
    } else if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      videoId = parsed.searchParams.get('v') ?? /^\/embed\/([^/]+)/.exec(parsed.pathname)?.[1]
    }

    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : url
  } catch {
    return ''
  }
}

const URL_INPUT_SELECTOR = 'input[aria-label="Bookmark URL"], input[aria-label="YouTube URL"]'

export const LinkPreview = defineHtmdExtension<
  LinkPreviewOptions,
  LinkPreviewStorage,
  {
    insertLinkPreview: (
      attributes: LinkPreviewAttributes,
    ) => (ctx: { commands: { insertContent: (value: unknown) => boolean } }) => boolean
  }
>({
  name: 'linkPreview',
  kind: 'node',
  group: 'block',
  atom: true,
  defaultOptions: () => ({ nodeView: undefined, fetchLinkPreview: undefined }),
  createStorage: (options) => ({
    fetchLinkPreview: options.fetchLinkPreview,
  }),
  attributes: {
    url: { default: null },
    title: { default: null },
    description: { default: null },
    image: { default: null },
    favicon: { default: null },
    provider: { default: null },
    type: { default: 'bookmark' },
  },
  parseHTML() {
    return [{ tag: 'div[data-type="link-preview"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const { url, title, type } = HTMLAttributes as Record<string, string | null | undefined>

    if (type === 'embed') {
      return [
        'div',
        mergeHtmlAttributes(HTMLAttributes, { 'data-type': 'link-preview' }),
        [
          'div',
          { class: 'relative pb-[56.25%] h-0 overflow-hidden rounded-lg' },
          [
            'iframe',
            {
              src: safeEmbedUrl(url),
              title: title || '',
              frameborder: '0',
              allowfullscreen: '',
              class: 'absolute top-0 left-0 w-full h-full',
            },
          ],
        ],
      ]
    }

    return [
      'div',
      mergeHtmlAttributes(HTMLAttributes, {
        'data-type': 'link-preview',
        class: 'link-preview my-4',
      }),
      [
        'a',
        {
          href: safeUrl(url),
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'bookmark-link',
        },
        title || url || '',
      ],
    ]
  },
  pmPlugins({ editor }) {
    let lastArrowKey: 'ArrowDown' | 'ArrowUp' | null = null

    return [
      new Plugin({
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
      }),
    ]
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
      when: ({ state }, event) => Boolean(findNodeViewControl(state, event, 'linkPreview')),
      run: ({ state }, event) => {
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
      },
    },
    'Shift-Tab': {
      id: 'linkPreview.tabPrev',
      key: 'Shift+Tab',
      label: 'Previous Link Preview Control',
      mode: 'insert',
      when: ({ state }, event) => Boolean(findNodeViewControl(state, event, 'linkPreview')),
      run: ({ state }, event) => {
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
      },
    },
    ArrowDown: {
      id: 'linkPreview.arrowDownToUrl',
      key: 'ArrowDown',
      label: 'Focus Link Preview URL or Below Link Preview',
      mode: 'insert',
      when: ({ state }, event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[contenteditable="false"]')
        ) {
          return Boolean(findNodeViewControl(state, event, 'linkPreview'))
        }
        return true
      },
      run: ({ editor, state, view }, event) => {
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
      },
    },
    ArrowUp: {
      id: 'linkPreview.arrowUpToUrl',
      key: 'ArrowUp',
      label: 'Focus Link Preview URL or Above Link Preview',
      mode: 'insert',
      when: ({ state }, event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[contenteditable="false"]')
        ) {
          return Boolean(findNodeViewControl(state, event, 'linkPreview'))
        }
        return true
      },
      run: ({ editor, state, view }, event) => {
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
      },
    },
    Enter: {
      id: 'linkPreview.focusAfterEnter',
      key: 'Enter',
      label: 'Commit Link Preview URL',
      mode: 'insert',
      when: ({ state }, event) =>
        Boolean(
          findNodeViewControl(state, event, 'linkPreview')?.target.matches(URL_INPUT_SELECTOR),
        ),
      run: ({ editor, state }, event) => {
        const ctrl = findNodeViewControl(state, event, 'linkPreview')
        if (!ctrl) return false
        ctrl.target.blur()
        return focusAfterBlock(editor, ctrl.pos + ctrl.node.nodeSize)
      },
    },
  }),
})
