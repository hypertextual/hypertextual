import type { EditorHotkeyService, EditorMode, EditorNotification } from 'core-ts'
import {
  registerModalEditor,
  type KeybindingPreset,
  type KeymapMode,
  type ModalEditorTarget,
  type ModalMotion,
  type ModalOperator,
  type ModalSelectionTransform,
  type ModalTextObjectSpec,
} from '@cloudvoyant/helical-ui'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { closeHistory, redo, undo } from '@tiptap/pm/history'
import { Slice, type Node as PMNode } from '@tiptap/pm/model'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  defineHtmdExtension,
  focusControlAtPos,
  getNodeNavigation,
} from '../define-htmd-extension.js'
import { editorOverlaysKey } from './editor-overlays.js'
import { applyModalStateTransition, executeInsertModeEntry, InsertMode } from './insert-mode.js'
import { HelixPreset, KakounePreset, VimPreset } from './modal-presets.js'
import { executeNormalModeMove, executeNormalModeTextObject, NormalMode } from './normal-mode.js'
import {
  executeSelectionTransform,
  executeSelectLines,
  executeSelectModeExtend,
  SelectMode,
} from './select-mode.js'

// types ---------------------------------------------------------------------

export interface ModalEditingOptions {
  enforceTitle?: boolean
  clickToEdit?: boolean
  initialEditable?: boolean
  onNotification?: (notification: EditorNotification) => void
  onEdit?: () => boolean
  onExit?: () => void
  getHotkeys?: () => EditorHotkeyService | undefined
  getScopeElement?: () => HTMLElement | null
}

export type ModalKeymapOptions = ModalEditingOptions

export interface SecondaryCursorRange {
  from: number
  to: number
  head: number
}

export interface SubtextCursorState {
  pos: number
  kind: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl'
  offset: number
  anchorOffset?: number
}

export interface ModalKeymapPluginState {
  mode: KeymapMode
  preset: KeybindingPreset
  secondaryRanges: SecondaryCursorRange[]
  goalColumn: number | null
  extendedRange?: { anchor: number; head: number } | null
  focused?: boolean
  subtextCursor?: SubtextCursorState | null
}

export interface ModalKeymapStorage {
  target: ModalEditorTarget | null
  mode: KeymapMode
  preset: KeybindingPreset
  registerSlice: Slice | null
  clickToInsert: boolean
  options?: ModalEditingOptions
  activeCompoundBlockPos?: number | null
  focusControlRequest?: {
    pos: number
    type: string
    control?: string
    offset?: number
  } | null
  cleanupDomRegistration?: () => void
  cleanupTransactionListener?: () => void
  cleanupHotkeySubscription?: () => void
}

export interface BlockDescriptor {
  node: PMNode
  pos: number
  start: number
  end: number
  isTextblock: boolean
  isAtom: boolean
  subtextKind?: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl'
  subtextText?: string
}

export interface WordToken {
  start: number
  end: number
  text: string
  blockStart: number
  blockEnd: number
  subtext?: {
    pos: number
    kind: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl'
    offsetStart: number
    offsetEnd: number
  }
}

export const modalKeymapPluginKey = new PluginKey<ModalKeymapPluginState>('modalKeymap')

const NON_TEXT_MODAL_NODE_TYPES = new Set([
  'notice',
  'blockquote',
  'codeBlock',
  'imageNode',
  'image',
  'linkPreview',
  'horizontalRule',
  'urlMention',
  'internalMention',
  'unparsedBlock',
  'unparsedInline',
])

// api -----------------------------------------------------------------------

/**
 * Parent modal editing extension that composes the mode extensions
 * (`NormalMode`, `SelectMode`, `InsertMode`) and preset extensions
 * (`HelixPreset`, `VimPreset`, `KakounePreset`) behind the `ModalEditorTarget`
 * seam and renders modal block/range/subtext cursor decorations:
 *
 * ```text
 * ModalEditing
 *  +-- Modes:   NormalMode (`h/j/k/l`, `w/b/e`, text objects)
 *  |            SelectMode (`v`, `x`, multi-cursor `C`)
 *  |            InsertMode (`i/a/o/O`, `Escape` compound-block restore)
 *  +-- Presets: HelixPreset | VimPreset | KakounePreset
 * ```
 */
export const ModalEditing = defineHtmdExtension<ModalEditingOptions, ModalKeymapStorage>({
  name: 'modalKeymap',
  kind: 'behavior',

  defaultOptions: () => ({
    enforceTitle: true,
    clickToEdit: true,
    initialEditable: undefined,
    onNotification: undefined,
    onEdit: undefined,
    onExit: undefined,
    getHotkeys: undefined,
    getScopeElement: undefined,
  }),

  createStorage: (options) => ({
    target: null,
    mode: 'insert',
    preset: 'helix',
    registerSlice: null,
    clickToInsert: options.clickToEdit ?? true,
    options,
    activeCompoundBlockPos: null,
    cleanupDomRegistration: undefined,
    cleanupTransactionListener: undefined,
  }),

  onBeforeCreate({ editor, options, storage }) {
    storage.options = options
    storage.clickToInsert = options.clickToEdit ?? true
    const target = storage.target ?? createModalTargetForEditor(editor, options)
    storage.target = target

    const initialEditable = options.initialEditable ?? editor.isEditable
    const preset = (options.getHotkeys?.()?.getPreset() ?? 'helix') as KeybindingPreset
    target.setModalState({
      mode: initialEditable ? 'insert' : 'normal',
      preset,
    })

    const onTransaction = () => {
      syncModalEditableState(editor)
    }
    editor.on('transaction', onTransaction)
    storage.cleanupTransactionListener = () => {
      editor.off('transaction', onTransaction)
    }

    const hotkeys = options.getHotkeys?.()
    if (hotkeys) {
      storage.cleanupHotkeySubscription = hotkeys.subscribe(({ preset: nextPreset }) => {
        const currentMode =
          modalKeymapPluginKey.getState(editor.state)?.mode ??
          (editor.isEditable ? 'insert' : 'normal')
        target.setModalState({
          mode: currentMode as KeymapMode,
          preset: nextPreset as KeybindingPreset,
        })
      })
    }
  },

  onCreate({ editor, options, storage }) {
    const initialEditable = options.initialEditable ?? editor.isEditable
    const preset = (options.getHotkeys?.()?.getPreset() ?? 'helix') as KeybindingPreset
    storage.target?.setModalState({
      mode: initialEditable ? 'insert' : 'normal',
      preset,
    })
    syncModalDomRegistration(editor)
  },

  onDestroy({ storage }) {
    storage.cleanupHotkeySubscription?.()
    storage.cleanupHotkeySubscription = undefined
    storage.cleanupTransactionListener?.()
    storage.cleanupTransactionListener = undefined
    storage.cleanupDomRegistration?.()
    storage.cleanupDomRegistration = undefined
    storage.target = null
  },

  pmPlugins({ editor, options, storage }) {
    storage.options = options
    if (!storage.target) {
      storage.target = createModalTargetForEditor(editor, options)
    }
    return [createModalEditingPlugin(editor, storage)]
  },
})

export const ModalKeymap = ModalEditing

export const modalEditingExtensions = [
  NormalMode,
  SelectMode,
  InsertMode,
  HelixPreset,
  VimPreset,
  KakounePreset,
  ModalEditing,
] as const

/**
 * Returns `true` when `editor` is currently in `insert` mode.
 */
export function isEditorInInsertMode(editor: TiptapEditor): boolean {
  const storage = getModalStorage(editor)
  if (!storage) return true
  return storage.mode === 'insert'
}

/**
 * Subscribes `onUpdate` to both `'update'` and `'transaction'` events on
 * `editor` and returns an unsubscribe callback.
 */
export function subscribeToEditorTransactions(
  editor: TiptapEditor,
  onUpdate: () => void,
): () => void {
  editor.on('update', onUpdate)
  editor.on('transaction', onUpdate)
  return () => {
    editor.off('update', onUpdate)
    editor.off('transaction', onUpdate)
  }
}

/**
 * Returns the `ModalEditorTarget` associated with `editor`, creating one if
 * needed.
 */
export function getEditorModalTarget(editor: TiptapEditor): ModalEditorTarget | undefined {
  const storage = getModalStorage(editor)
  if (!storage) return undefined
  if (editor.state.plugins.length === 0 && editor.extensionManager?.plugins?.length) {
    editor.view.updateState(editor.state.reconfigure({ plugins: editor.extensionManager.plugins }))
  }
  if (!storage.target) {
    storage.target = createModalTargetForEditor(editor, { enforceTitle: true })
  }
  return storage.target
}

// pm ------------------------------------------------------------------------

function createModalEditingPlugin(
  editor: TiptapEditor,
  storage: ModalKeymapStorage,
): Plugin<ModalKeymapPluginState> {
  return new Plugin<ModalKeymapPluginState>({
    key: modalKeymapPluginKey,
    state: {
      init(): ModalKeymapPluginState {
        return {
          mode: storage.mode,
          preset: storage.preset,
          secondaryRanges: [],
          goalColumn: null,
          extendedRange: null,
          focused: true,
        }
      },
      apply(tr, prev): ModalKeymapPluginState {
        const meta = tr.getMeta(modalKeymapPluginKey) as Partial<ModalKeymapPluginState> | undefined
        if (meta) {
          const nextMode = meta.mode ?? prev.mode
          return {
            mode: nextMode,
            preset: meta.preset ?? prev.preset,
            secondaryRanges: meta.secondaryRanges ?? prev.secondaryRanges,
            goalColumn: meta.goalColumn !== undefined ? meta.goalColumn : prev.goalColumn,
            extendedRange:
              nextMode === 'insert'
                ? null
                : meta.extendedRange !== undefined
                  ? meta.extendedRange
                  : prev.extendedRange,
            focused: meta.focused !== undefined ? meta.focused : prev.focused,
            subtextCursor:
              nextMode === 'insert'
                ? null
                : meta.subtextCursor !== undefined
                  ? meta.subtextCursor
                  : prev.subtextCursor,
          }
        }
        if (tr.docChanged && prev.secondaryRanges.length > 0) {
          return {
            ...prev,
            secondaryRanges: prev.secondaryRanges.map((r) => ({
              from: tr.mapping.map(r.from),
              to: tr.mapping.map(r.to),
              head: tr.mapping.map(r.head),
            })),
          }
        }
        return prev
      },
    },
    view(editorView) {
      if (
        typeof HTMLElement !== 'undefined' &&
        editorView.dom instanceof HTMLElement &&
        storage.target &&
        !storage.cleanupDomRegistration
      ) {
        storage.cleanupDomRegistration = registerModalEditor(editorView.dom, storage.target)
      }
      const doc = editorView.dom?.ownerDocument
      const isEditorScopeFocused = (): boolean => {
        if (!doc) return true
        const active = doc.activeElement
        if (!(active instanceof Element) || active === doc.body || active === doc.documentElement) {
          return true
        }
        const scopeRoot =
          editorView.dom.closest('.document-pane') ??
          editorView.dom.closest('[role="region"]') ??
          editorView.dom.closest('.editor-container') ??
          editorView.dom
        if (scopeRoot === active || scopeRoot.contains(active)) return true
        if (active.closest('[data-editor-controls]')) return true
        return false
      }
      const syncFocused = () => {
        try {
          const active = doc?.activeElement
          if (active instanceof HTMLElement && editorView.dom.contains(active)) {
            let foundPos: number | null = null
            editorView.state.doc.descendants((node, pos) => {
              if (
                node.type.name === 'notice' ||
                node.type.name === 'codeBlock' ||
                node.type.name === 'image' ||
                node.type.name === 'imageNode' ||
                node.type.name === 'linkPreview'
              ) {
                const nodeDom = editorView.nodeDOM(pos)
                if (nodeDom instanceof HTMLElement && nodeDom.contains(active)) {
                  foundPos = pos
                }
                return false
              }
              return true
            })
            if (foundPos !== null) {
              storage.activeCompoundBlockPos = foundPos
            } else if (editorView.dom === active) {
              storage.activeCompoundBlockPos = null
            }
          }
          const nextFocused = isEditorScopeFocused()
          const prev = modalKeymapPluginKey.getState(editorView.state)
          if (prev && prev.focused !== nextFocused) {
            editorView.dispatch(
              editorView.state.tr.setMeta(modalKeymapPluginKey, {
                ...prev,
                focused: nextFocused,
              }),
            )
          }
        } catch {
          // Ignore if view was destroyed
        }
      }
      const onFocusIn = () => syncFocused()
      const onFocusOut = () => queueMicrotask(syncFocused)
      doc?.addEventListener('focusin', onFocusIn, true)
      doc?.addEventListener('focusout', onFocusOut, true)
      return {
        destroy() {
          doc?.removeEventListener('focusin', onFocusIn, true)
          doc?.removeEventListener('focusout', onFocusOut, true)
          storage.cleanupDomRegistration?.()
          storage.cleanupDomRegistration = undefined
        },
      }
    },
    props: {
      handleClick(view, position, event) {
        const modalOptions = storage.options
        if (view.editable || !modalOptions?.onEdit) return false
        const target = event.target
        const bookmarkEdit =
          target instanceof Element ? target.closest<HTMLElement>('[data-bookmark-edit]') : null
        if (
          target instanceof Element &&
          !bookmarkEdit &&
          target.closest(
            'a, button, input, select, summary, iframe, [role="button"], [role="combobox"], [data-modal-ignore-pointer]',
          )
        ) {
          return false
        }
        if (!storage.clickToInsert) {
          let compoundPos: number | null = null
          if (target instanceof Element) {
            view.state.doc.descendants((node, pos) => {
              if (getNodeNavigation(editor, node.type.name)) {
                const nodeDom = view.nodeDOM(pos)
                if (nodeDom instanceof HTMLElement && nodeDom.contains(target)) {
                  compoundPos = pos
                }
                return false
              }
              return true
            })
          }
          if (compoundPos !== null) {
            const node = view.state.doc.nodeAt(compoundPos)
            if (node && NodeSelection.isSelectable(node)) {
              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, compoundPos)),
              )
            }
          } else {
            editor.commands.setTextSelection(position)
          }
          const region = modalOptions?.getScopeElement?.()
          region?.focus({ preventScroll: true })
          return true
        }
        if (!modalOptions.onEdit()) return false
        editor.setEditable(true)
        try {
          editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
        } catch {
          // Ignore
        }
        const hotkeys = modalOptions?.getHotkeys?.()
        const preset = (hotkeys?.getPreset() ?? storage.preset ?? 'helix') as KeybindingPreset
        getEditorModalTarget(editor)?.setModalState({
          mode: 'insert',
          preset,
        })
        hotkeys?.setMode('insert')
        if (bookmarkEdit) {
          queueMicrotask(() => bookmarkEdit.click())
          return true
        }
        editor.commands.setTextSelection(position)
        view.focus()
        return true
      },
      handleDOMEvents: {
        mousedown(view, event) {
          if (!storage.clickToInsert) {
            return false
          }
          const targetNode = event?.target instanceof Element ? event.target : null
          if (targetNode) {
            if (targetNode.closest('[data-modal-ignore-pointer]')) {
              return false
            }
            const nonEditable = targetNode.closest('[contenteditable="false"]')
            if (nonEditable && view.dom.contains(nonEditable)) {
              const tag = targetNode.tagName.toLowerCase()
              if (tag !== 'input' && tag !== 'textarea' && !targetNode.closest('input, textarea')) {
                return false
              }
            }
          }
          if (storage.mode !== 'insert') {
            storage.mode = 'insert'
            try {
              const prev = modalKeymapPluginKey.getState(view.state)
              if (prev && prev.mode !== 'insert') {
                view.dispatch(
                  view.state.tr.setMeta(modalKeymapPluginKey, {
                    ...prev,
                    mode: 'insert',
                    secondaryRanges: [],
                  }),
                )
              }
            } catch {
              // View may have been destroyed
            }
          }
          return false
        },
      },
      attributes(state) {
        const pluginState = modalKeymapPluginKey.getState(state)
        const currentMode = pluginState?.mode ?? 'insert'
        const currentPreset = pluginState?.preset ?? 'helix'
        return {
          'data-modal-mode': currentMode,
          'data-modal-preset': currentPreset,
        }
      },
      decorations(state) {
        const pluginState = modalKeymapPluginKey.getState(state)
        if (!pluginState || pluginState.mode === 'insert' || pluginState.focused === false) {
          return DecorationSet.empty
        }

        const decos: Decoration[] = []
        const { doc, selection } = state
        const head = selection.head

        const pushNodeDecorationsInRange = (from: number, to: number, isPrimary: boolean) => {
          if (from >= to) return
          doc.nodesBetween(from, to, (node, pos) => {
            const isRichModalNode =
              NON_TEXT_MODAL_NODE_TYPES.has(node.type.name) || (node.isAtom && !node.isText)
            if (!isRichModalNode) return true

            const fullyCovered = pos >= from && pos + node.nodeSize <= to
            let innerCovered = false
            if (!fullyCovered && (node.type.name === 'notice' || node.type.name === 'blockquote')) {
              const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(node, pos)
              innerCovered =
                pluginState.mode === 'select' &&
                firstTextStart !== -1 &&
                lastTextEnd !== -1 &&
                from <= firstTextStart &&
                to >= lastTextEnd
            }

            if (fullyCovered || innerCovered) {
              const isInlineCursor =
                !node.isBlock &&
                isPrimary &&
                selection instanceof NodeSelection &&
                pos === selection.from
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: isPrimary
                    ? isInlineCursor
                      ? 'pm-modal-node-selection pm-modal-cursor'
                      : 'pm-modal-node-selection'
                    : 'pm-modal-node-selection pm-multi-selection',
                  'data-pm-modal-node-selection': pluginState.mode,
                  ...(isInlineCursor ? { 'data-pm-modal-cursor': pluginState.mode } : {}),
                }),
              )
            }
            return true
          })
        }

        const pushCursorDecoration = (pos: number, isMulti = false) => {
          if (pos < 0 || pos > doc.content.size) return
          const $pos = doc.resolve(pos)
          const nodeAfter = $pos.nodeAfter
          if (
            nodeAfter?.isText &&
            nodeAfter.text &&
            nodeAfter.text.length > 0 &&
            pos + 1 <= doc.content.size
          ) {
            decos.push(
              Decoration.inline(
                pos,
                pos + 1,
                isMulti
                  ? { class: 'pm-multi-cursor', 'data-pm-multi-cursor': 'true' }
                  : { class: 'pm-modal-cursor', 'data-pm-modal-cursor': pluginState.mode },
              ),
            )
            return
          }
          if (nodeAfter && nodeAfter.isAtom && !nodeAfter.isText) {
            decos.push(
              Decoration.node(pos, pos + nodeAfter.nodeSize, {
                class: nodeAfter.isBlock
                  ? 'pm-modal-node-selection'
                  : 'pm-modal-node-selection pm-modal-cursor',
                'data-pm-modal-node-selection': pluginState.mode,
                ...(!nodeAfter.isBlock ? { 'data-pm-modal-cursor': pluginState.mode } : {}),
              }),
            )
            return
          }
          if (typeof document !== 'undefined') {
            decos.push(
              Decoration.widget(
                pos,
                () => {
                  const span = document.createElement('span')
                  span.className = isMulti
                    ? 'pm-multi-cursor pm-modal-cursor-eol'
                    : 'pm-modal-cursor pm-modal-cursor-eol'
                  span.setAttribute(
                    isMulti ? 'data-pm-multi-cursor' : 'data-pm-modal-cursor',
                    isMulti ? 'true' : pluginState.mode,
                  )
                  span.setAttribute('aria-hidden', 'true')
                  span.textContent = '\u00a0'
                  return span
                },
                {
                  side: 1,
                  key: isMulti ? `multi-cursor-${pos}` : `modal-cursor-${pos}-${pluginState.mode}`,
                },
              ),
            )
          }
        }

        const primaryRange = pluginState.extendedRange
          ? {
              from: Math.min(pluginState.extendedRange.anchor, pluginState.extendedRange.head),
              to: Math.max(pluginState.extendedRange.anchor, pluginState.extendedRange.head),
              head: pluginState.extendedRange.head,
              anchor: pluginState.extendedRange.anchor,
            }
          : {
              from: selection.from,
              to: selection.to,
              head: selection.head,
              anchor: selection.anchor,
            }

        if (pluginState.subtextCursor) {
          const sub = pluginState.subtextCursor
          const subNode = doc.nodeAt(sub.pos)
          if (subNode) {
            decos.push(
              Decoration.node(sub.pos, sub.pos + subNode.nodeSize, {
                class: 'pm-modal-node-selection',
                'data-pm-modal-node-selection': pluginState.mode,
                ...(sub.kind === 'noticeTitle'
                  ? { 'data-pm-modal-notice-title': pluginState.mode }
                  : sub.kind === 'linkPreviewUrl'
                    ? { 'data-pm-modal-link-preview-url': pluginState.mode }
                    : { 'data-pm-modal-image-caption': pluginState.mode }),
              }),
            )
          }
        } else if (!pluginState.extendedRange && selection instanceof NodeSelection) {
          pushNodeDecorationsInRange(selection.from, selection.to, true)
        } else if (primaryRange.from === primaryRange.to) {
          const $head = doc.resolve(Math.min(doc.content.size, Math.max(0, head)))
          for (let d = $head.depth; d >= 1; d -= 1) {
            const ancestor = $head.node(d)
            if (ancestor.type.name === 'notice' || ancestor.type.name === 'codeBlock') {
              const ancestorPos = $head.before(d)
              decos.push(
                Decoration.node(ancestorPos, ancestorPos + ancestor.nodeSize, {
                  class: 'pm-modal-node-selection',
                  'data-pm-modal-node-selection': pluginState.mode,
                }),
              )
              break
            }
          }
          pushCursorDecoration(head, false)
        } else if (primaryRange.from < primaryRange.to) {
          pushNodeDecorationsInRange(primaryRange.from, primaryRange.to, true)
          const $head = doc.resolve(Math.min(doc.content.size, primaryRange.head))
          for (let d = $head.depth; d >= 1; d -= 1) {
            const ancestor = $head.node(d)
            if (ancestor.type.name === 'notice' || ancestor.type.name === 'codeBlock') {
              const ancestorPos = $head.before(d)
              const alreadyDecorated =
                ancestorPos >= primaryRange.from &&
                ancestorPos + ancestor.nodeSize <= primaryRange.to
              if (!alreadyDecorated) {
                decos.push(
                  Decoration.node(ancestorPos, ancestorPos + ancestor.nodeSize, {
                    class: 'pm-modal-node-selection',
                    'data-pm-modal-node-selection': pluginState.mode,
                  }),
                )
              }
              break
            }
          }
          decos.push(
            Decoration.inline(primaryRange.from, primaryRange.to, {
              class: 'pm-modal-selection',
              'data-pm-modal-selection': pluginState.mode,
            }),
          )
          if ($head.parent.isTextblock) {
            const cursorPos =
              primaryRange.head > primaryRange.anchor
                ? $head.nodeBefore?.isText && primaryRange.head - 1 >= primaryRange.from
                  ? primaryRange.head - 1
                  : primaryRange.head
                : primaryRange.head
            pushCursorDecoration(cursorPos, false)
          }
        }

        for (const range of pluginState.secondaryRanges) {
          if (range.from >= 0 && range.to <= doc.content.size && range.from < range.to) {
            pushNodeDecorationsInRange(range.from, range.to, false)
            decos.push(
              Decoration.inline(range.from, range.to, {
                class: 'pm-multi-selection',
                'data-pm-multi-selection': 'true',
              }),
            )
          } else {
            pushCursorDecoration(range.head, true)
          }
        }

        return DecorationSet.create(doc, decos)
      },
    },
  })
}

// helpers -------------------------------------------------------------------

/**
 * Returns the `ModalKeymapStorage` instance attached to `editor.storage`.
 */
export function getModalStorage(editor: TiptapEditor): ModalKeymapStorage | undefined {
  return (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage }).modalKeymap
}

/**
 * Schedules control focus on the compound block at `pos` using the owning
 * node extension's `navigation.focusControl` hook.
 */
export function focusModalCompoundBlockControl(
  editor: TiptapEditor,
  pos: number,
  options?: { control?: string; offset?: number },
): void {
  const run = () => {
    if (!editor || editor.isDestroyed) return
    focusControlAtPos(editor, pos, options)
  }
  queueMicrotask(() => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run)
    } else {
      run()
    }
  })
}

/**
 * Enters `insert` mode and focuses the active control of the selected or
 * enclosing compound block (`notice`, `codeBlock`, `imageNode`, `linkPreview`).
 */
export function enterModalCompoundBlock(editor: TiptapEditor): boolean {
  if (!editor || editor.isEditable) return false
  const storage = getModalStorage(editor)
  const modalOptions = storage?.options
  const sel = editor.state.selection
  const pluginState = modalKeymapPluginKey.getState(editor.state)
  let blockPos: number | null = null
  let control: string | undefined
  let offset: number | undefined

  if (pluginState?.subtextCursor) {
    blockPos = pluginState.subtextCursor.pos
    offset = pluginState.subtextCursor.offset
    control =
      pluginState.subtextCursor.kind === 'noticeTitle'
        ? 'type'
        : pluginState.subtextCursor.kind === 'linkPreviewUrl'
          ? 'url'
          : 'caption'
  } else if (sel instanceof NodeSelection && getNodeNavigation(editor, sel.node.type.name)) {
    blockPos = sel.from
    if (sel.node.type.name === 'codeBlock') control = 'language'
  } else {
    const resolvedFrom = sel.$from
    for (let d = resolvedFrom.depth; d >= 1; d -= 1) {
      const node = resolvedFrom.node(d)
      const nav = getNodeNavigation(editor, node.type.name)
      if (nav?.kind === 'container') {
        blockPos = resolvedFrom.before(d)
        control = node.type.name === 'codeBlock' ? 'language' : 'type'
        break
      }
    }
  }
  if (blockPos === null) return false
  if (modalOptions?.onEdit && !modalOptions.onEdit()) return false

  if (storage) {
    storage.activeCompoundBlockPos = blockPos
  }
  editor.setEditable(true)
  const hotkeys = modalOptions?.getHotkeys?.()
  const preset = (hotkeys?.getPreset() ?? storage?.preset ?? 'helix') as KeybindingPreset
  getEditorModalTarget(editor)?.setModalState({ mode: 'insert', preset })
  hotkeys?.setMode('insert')
  try {
    editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
  } catch {
    // Ignore
  }

  focusModalCompoundBlockControl(editor, blockPos, { control, offset })
  return true
}

/**
 * Updates `editor.setEditable(editable)` and synchronizes modal state, host
 * hotkeys, active overlays, and compound-block control focus.
 */
export function setModalEditable(editor: TiptapEditor, editable: boolean): void {
  if (!editor) return
  const storage = getModalStorage(editor)
  const modalOptions = storage?.options
  const hotkeys = modalOptions?.getHotkeys?.()
  const editableChanged = editor.isEditable !== editable
  editor.setEditable(editable)
  if (editableChanged) {
    try {
      editor.view.dispatch(editor.state.tr.setMeta('editableChanged', editable))
    } catch {
      // Ignore if view is not yet mounted
    }
  }
  const target = getEditorModalTarget(editor)
  const currentMode = modalKeymapPluginKey.getState(editor.state)?.mode ?? 'insert'
  const preset = (hotkeys?.getPreset() ?? storage?.preset ?? 'helix') as KeybindingPreset

  if (editable) {
    if (currentMode !== 'insert') {
      target?.setModalState({ mode: 'insert', preset })
    }
    if (hotkeys && hotkeys.getMode() !== 'insert') {
      hotkeys.setMode('insert')
    }
    const sel = editor.state.selection
    if (storage?.focusControlRequest) {
      const req = storage.focusControlRequest
      storage.focusControlRequest = null
      focusModalCompoundBlockControl(editor, req.pos, {
        control: req.control,
        offset: req.offset,
      })
    } else if (
      sel instanceof NodeSelection &&
      getNodeNavigation(editor, sel.node.type.name)?.kind === 'atom'
    ) {
      focusModalCompoundBlockControl(editor, sel.from)
    }
  } else {
    const activeOverlay = editorOverlaysKey.getState(editor.state)
    if (activeOverlay) {
      const cmds = editor.commands as unknown as { closeOverlay?: (name?: string) => boolean }
      cmds.closeOverlay?.(activeOverlay.name)
    }
    if (currentMode === 'insert') {
      target?.setModalState({ mode: 'normal', preset })
    }
    if (hotkeys && hotkeys.getMode() === 'insert') {
      hotkeys.setMode('normal')
    }
  }
}

/**
 * Exits `insert` mode back to `normal` mode, notifying `onExit` and syncing
 * editable state and host hotkeys.
 */
export function exitModalToNormal(editor: TiptapEditor): boolean {
  if (!editor) return false
  const storage = getModalStorage(editor)
  storage?.options?.onExit?.()
  setModalEditable(editor, false)
  storage?.options?.getHotkeys?.()?.setMode('normal')
  return true
}

/**
 * Synchronizes `registerModalEditor` and `hotkeys.registerModalTarget` bindings
 * across the editor DOM, surface element, and outer region container.
 */
export function syncModalDomRegistration(editor: TiptapEditor): void {
  const storage = getModalStorage(editor)
  if (!storage) return
  storage.cleanupDomRegistration?.()
  storage.cleanupDomRegistration = undefined

  const target = getEditorModalTarget(editor)
  if (!target) return

  const cleanups: Array<() => void> = []
  const hotkeys = storage.options?.getHotkeys?.()
  const registered = new Set<HTMLElement>()
  const registerEl = (el: HTMLElement | null | undefined) => {
    if (!el || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return
    if (registered.has(el)) return
    registered.add(el)
    cleanups.push(registerModalEditor(el, target))
    if (hotkeys?.registerModalTarget) {
      cleanups.push(hotkeys.registerModalTarget(el, target))
    }
  }

  try {
    if (typeof HTMLElement !== 'undefined' && editor.view.dom instanceof HTMLElement) {
      registerEl(editor.view.dom)
    }
  } catch {
    // Headless view
  }

  const scopeEl = storage.options?.getScopeElement?.()
  if (scopeEl) {
    registerEl(scopeEl)
    const region = scopeEl.closest('[role="region"]')
    if (region instanceof HTMLElement) {
      registerEl(region)
    }
  }

  storage.cleanupDomRegistration = () => {
    for (const cleanup of cleanups) cleanup()
  }
}

/**
 * Synchronizes `editor.isEditable` and compound-block control focus when a
 * modal transaction transitions between `insert` and `normal`/`select` modes.
 */
export function syncModalEditableState(editor: TiptapEditor): void {
  if (!editor) return
  const storage = getModalStorage(editor)
  const modalOptions = storage?.options
  const hotkeys = modalOptions?.getHotkeys?.()
  if (hotkeys?.isOverlayOpen()) return
  const active = typeof document !== 'undefined' ? document.activeElement : null
  const scopeEl = modalOptions?.getScopeElement?.()
  if (
    active &&
    scopeEl &&
    !scopeEl.contains(active) &&
    !active.contains(scopeEl) &&
    active.closest('[data-pane-id], [data-which-key-explorer], [data-part="node-rename-input"]')
  ) {
    return
  }
  const pluginState = modalKeymapPluginKey.getState(editor.state)
  if (!pluginState) return
  if (pluginState.mode === 'insert' && !editor.isEditable) {
    if (!modalOptions?.onEdit || modalOptions.onEdit()) {
      editor.setEditable(true)
      hotkeys?.setMode('insert')
      try {
        editor.view.dispatch(editor.state.tr.setMeta('editableChanged', true))
      } catch {
        // Ignore
      }
      const sel = editor.state.selection
      if (storage?.focusControlRequest) {
        const req = storage.focusControlRequest
        storage.focusControlRequest = null
        focusModalCompoundBlockControl(editor, req.pos, {
          control: req.control,
          offset: req.offset,
        })
      } else if (
        sel instanceof NodeSelection &&
        getNodeNavigation(editor, sel.node.type.name)?.kind === 'atom'
      ) {
        focusModalCompoundBlockControl(editor, sel.from)
      } else {
        editor.view.focus()
      }
    }
  } else if (pluginState.mode !== 'insert' && editor.isEditable) {
    modalOptions?.onExit?.()
    editor.setEditable(false)
    hotkeys?.setMode(pluginState.mode as EditorMode)
    try {
      editor.view.dispatch(editor.state.tr.setMeta('editableChanged', false))
    } catch {
      // Ignore
    }
  }
}

/**
 * Attaches a `modalKeymapPluginKey` metadata patch to `tr`.
 */
export function updateModalMeta(
  editor: TiptapEditor,
  tr: Transaction,
  patch: Partial<ModalKeymapPluginState>,
): Transaction {
  const storage = getModalStorage(editor)
  const prev = modalKeymapPluginKey.getState(editor.state) ?? {
    mode: storage?.mode ?? 'insert',
    preset: storage?.preset ?? 'helix',
    secondaryRanges: [],
    goalColumn: null,
    focused: true,
  }
  return tr.setMeta(modalKeymapPluginKey, {
    ...prev,
    focused: true,
    subtextCursor: null,
    ...patch,
  })
}

/**
 * Returns the plain-text subtext string (`noticeTitle`, `imageCaption`, or
 * `linkPreviewUrl`) stored on `node`.
 */
export function getSubtextValue(
  node: PMNode,
  kind: 'noticeTitle' | 'imageCaption' | 'linkPreviewUrl',
): string {
  if (kind === 'noticeTitle') {
    return String(node.attrs.title ?? 'Note')
  }
  if (kind === 'linkPreviewUrl') {
    return String(node.attrs.url ?? '')
  }
  return String(node.attrs.caption ?? '')
}

/**
 * Collects ordered leaf block descriptors (including subtext and code-block line
 * slices) across `doc` for modal line/paragraph navigation.
 */
export function collectLeafBlocks(doc: PMNode): BlockDescriptor[] {
  const blocks: BlockDescriptor[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'notice') {
      const subtextText = getSubtextValue(node, 'noticeTitle')
      blocks.push({
        node,
        pos,
        start: pos,
        end: pos + node.nodeSize,
        isTextblock: true,
        isAtom: false,
        subtextKind: 'noticeTitle',
        subtextText,
      })
      return true
    }
    if (node.isTextblock) {
      if (node.type.name === 'codeBlock') {
        const text = node.textContent
        const lines = text.split('\n')
        let offset = pos + 1
        for (const line of lines) {
          blocks.push({
            node,
            pos,
            start: offset,
            end: offset + line.length,
            isTextblock: true,
            isAtom: false,
          })
          offset += line.length + 1
        }
        return false
      }
      blocks.push({
        node,
        pos,
        start: pos + 1,
        end: pos + 1 + node.content.size,
        isTextblock: true,
        isAtom: false,
      })
      return false
    }
    if (node.isAtom && !node.isText) {
      if (node.type.name === 'image' || node.type.name === 'imageNode') {
        const subtextText = getSubtextValue(node, 'imageCaption')
        blocks.push({
          node,
          pos,
          start: pos,
          end: pos + node.nodeSize,
          isTextblock: true,
          isAtom: true,
          subtextKind: 'imageCaption',
          subtextText,
        })
        return false
      }
      if (node.type.name === 'linkPreview' && node.attrs.type !== 'embed') {
        const subtextText = getSubtextValue(node, 'linkPreviewUrl')
        blocks.push({
          node,
          pos,
          start: pos,
          end: pos + node.nodeSize,
          isTextblock: true,
          isAtom: true,
          subtextKind: 'linkPreviewUrl',
          subtextText,
        })
        return false
      }
      blocks.push({
        node,
        pos,
        start: pos,
        end: pos + node.nodeSize,
        isTextblock: false,
        isAtom: true,
      })
      return false
    }
    return true
  })
  return blocks
}

/**
 * Collects ordered word and punctuation tokens across `doc` (including compound
 * block subtext fields) for `w`, `b`, and `e` word motions.
 */
export function collectWords(doc: PMNode): WordToken[] {
  const tokens: WordToken[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'notice') {
      const titleText = getSubtextValue(node, 'noticeTitle')
      const regex = /\w+|[^\w\s]+/g
      let match: RegExpExecArray | null = regex.exec(titleText)
      while (match !== null) {
        tokens.push({
          start: pos,
          end: pos,
          text: match[0],
          blockStart: pos,
          blockEnd: pos,
          subtext: {
            pos,
            kind: 'noticeTitle',
            offsetStart: match.index,
            offsetEnd: match.index + match[0].length,
          },
        })
        match = regex.exec(titleText)
      }
      return true
    }
    if (node.type.name === 'image' || node.type.name === 'imageNode') {
      const capText = getSubtextValue(node, 'imageCaption')
      const regex = /\w+|[^\w\s]+/g
      let match: RegExpExecArray | null = regex.exec(capText)
      while (match !== null) {
        tokens.push({
          start: pos,
          end: pos,
          text: match[0],
          blockStart: pos,
          blockEnd: pos,
          subtext: {
            pos,
            kind: 'imageCaption',
            offsetStart: match.index,
            offsetEnd: match.index + match[0].length,
          },
        })
        match = regex.exec(capText)
      }
      return false
    }
    if (node.type.name === 'linkPreview' && node.attrs.type !== 'embed') {
      const urlText = getSubtextValue(node, 'linkPreviewUrl')
      const regex = /\w+|[^\w\s]+/g
      let match: RegExpExecArray | null = regex.exec(urlText)
      while (match !== null) {
        tokens.push({
          start: pos,
          end: pos,
          text: match[0],
          blockStart: pos,
          blockEnd: pos,
          subtext: {
            pos,
            kind: 'linkPreviewUrl',
            offsetStart: match.index,
            offsetEnd: match.index + match[0].length,
          },
        })
        match = regex.exec(urlText)
      }
      return false
    }
    if (!node.isTextblock) return true
    const blockStart = pos + 1
    const blockEnd = pos + 1 + node.content.size
    let offset = 0

    node.forEach((child) => {
      if (child.isText && child.text) {
        const regex = /\w+|[^\w\s]+/g
        let match: RegExpExecArray | null = regex.exec(child.text)
        while (match !== null) {
          tokens.push({
            start: blockStart + offset + match.index,
            end: blockStart + offset + match.index + match[0].length,
            text: match[0],
            blockStart,
            blockEnd,
          })
          match = regex.exec(child.text)
        }
      } else if (child.isAtom) {
        tokens.push({
          start: blockStart + offset,
          end: blockStart + offset + child.nodeSize,
          text: '\uFFFC',
          blockStart,
          blockEnd,
        })
      }
      offset += child.nodeSize
    })

    return false
  })
  return tokens
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let curr = el?.parentElement ?? null
  while (curr) {
    if (curr.getAttribute('role') === 'region' || curr.classList.contains('article-scroll')) {
      return curr
    }
    if (typeof window !== 'undefined') {
      const style = window.getComputedStyle(curr)
      if (/(auto|scroll)/.test(style.overflowY) && curr.scrollHeight > curr.clientHeight) {
        return curr
      }
    }
    curr = curr.parentElement
  }
  return null
}

/**
 * Dispatches `tr` on `editor.view` and keeps the active modal cursor decoration
 * visible inside its scroll container when `tr.scrolledIntoView` is set.
 */
export function dispatchModalTransaction(editor: TiptapEditor, tr: Transaction): void {
  const shouldScroll = tr.scrolledIntoView
  editor.view.dispatch(tr)
  if (!shouldScroll) return
  try {
    const dom = editor.view.dom
    if (typeof HTMLElement === 'undefined' || !(dom instanceof HTMLElement)) return
    const container = findScrollContainer(dom)
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    if (containerRect.height <= 0) return
    if (editor.state.selection.from <= 2) {
      container.scrollTop = 0
      return
    }
    const targetEl = dom.querySelector<HTMLElement>(
      '[data-pm-modal-cursor], [data-pm-modal-node-selection]',
    )
    const rect = targetEl
      ? targetEl.getBoundingClientRect()
      : editor.view.coordsAtPos(editor.state.selection.head)
    const margin = 24
    if (rect.bottom > containerRect.bottom - margin) {
      container.scrollTop += rect.bottom - (containerRect.bottom - margin)
    } else if (rect.top < containerRect.top + margin) {
      container.scrollTop -= containerRect.top + margin - rect.top
    }
  } catch {
    // Ignore in headless tests
  }
}

/**
 * Returns the inclusive end position of the character or inline atom at `pos`.
 */
export function getCharEnd(doc: PMNode, pos: number): number {
  if (pos < 0 || pos >= doc.content.size) return pos
  const $pos = doc.resolve(pos)
  if ($pos.parent.isTextblock && pos < $pos.end()) {
    const after = $pos.nodeAfter
    if (after && after.isAtom && !after.isText) {
      return pos + after.nodeSize
    }
    return pos + 1
  }
  if (!$pos.parent.isTextblock) {
    const after = $pos.nodeAfter
    if (after && after.isAtom) {
      return pos + after.nodeSize
    }
  }
  return pos
}

/**
 * Returns the active character position of the cursor head for `sel` or
 * `extendedRange`.
 */
export function getCursorCharPos(
  doc: PMNode,
  sel: Selection,
  extendedRange?: { anchor: number; head: number } | null,
): number {
  if (extendedRange) {
    if (extendedRange.head > extendedRange.anchor) {
      const $head = doc.resolve(Math.min(doc.content.size, extendedRange.head))
      if (
        $head.parent.isTextblock &&
        extendedRange.head > $head.start() &&
        extendedRange.head - 1 >= extendedRange.anchor
      ) {
        return extendedRange.head - 1
      }
    }
    return extendedRange.head
  }
  if (sel instanceof NodeSelection) return sel.from
  if (sel.empty) return sel.head
  if (sel.head > sel.anchor) {
    const $head = doc.resolve(sel.head)
    if ($head.parent.isTextblock && sel.head > $head.start() && sel.head - 1 >= sel.from) {
      return sel.head - 1
    }
  }
  return sel.head
}

/**
 * Returns the character position of the selection anchor for `sel` or
 * `extendedRange`.
 */
export function getAnchorCharPos(
  doc: PMNode,
  sel: Selection,
  extendedRange?: { anchor: number; head: number } | null,
): number {
  if (extendedRange) {
    if (extendedRange.head < extendedRange.anchor) {
      const $anchor = doc.resolve(Math.min(doc.content.size, extendedRange.anchor))
      if (
        $anchor.parent.isTextblock &&
        extendedRange.anchor > $anchor.start() &&
        extendedRange.anchor - 1 >= extendedRange.head
      ) {
        return extendedRange.anchor - 1
      }
    }
    return extendedRange.anchor
  }
  if (sel instanceof NodeSelection) return sel.from
  if (sel.empty) return sel.anchor
  if (sel.head < sel.anchor) {
    const $anchor = doc.resolve(sel.anchor)
    if ($anchor.parent.isTextblock && sel.anchor > $anchor.start() && sel.anchor - 1 >= sel.from) {
      return sel.anchor - 1
    }
  }
  return sel.anchor
}

/**
 * Returns the first and last inline text positions inside container `node` at
 * `nodePos`.
 */
export function getContainerInnerTextBounds(
  node: PMNode,
  nodePos: number,
): { firstTextStart: number; lastTextEnd: number } {
  let firstTextStart = -1
  let lastTextEnd = -1
  if (node.isTextblock) {
    return {
      firstTextStart: nodePos + 1,
      lastTextEnd: nodePos + 1 + node.content.size,
    }
  }
  node.descendants((child, relPos) => {
    if (child.isTextblock) {
      const absStart = nodePos + 1 + relPos + 1
      const absEnd = absStart + child.content.size
      if (firstTextStart === -1) firstTextStart = absStart
      lastTextEnd = absEnd
      return false
    }
    return true
  })
  return { firstTextStart, lastTextEnd }
}

/**
 * Expands `[from, to]` to cover any container or atom block whose inner text is
 * completely spanned by the range.
 */
export function expandWholeContainerRange(
  doc: PMNode,
  from: number,
  to: number,
): { from: number; to: number } {
  if (from >= to) return { from, to }
  let nextFrom = from
  let nextTo = to
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'notice' || node.type.name === 'blockquote') {
      const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(node, pos)
      if (
        firstTextStart !== -1 &&
        lastTextEnd !== -1 &&
        nextFrom <= firstTextStart &&
        nextTo >= lastTextEnd
      ) {
        nextFrom = Math.min(nextFrom, pos)
        nextTo = Math.max(nextTo, pos + node.nodeSize)
      }
      return false
    }
    if (node.isAtom && !node.isText) {
      if (nextFrom <= pos && nextTo >= pos + node.nodeSize) {
        nextFrom = Math.min(nextFrom, pos)
        nextTo = Math.max(nextTo, pos + node.nodeSize)
      }
      return false
    }
    return true
  })
  return { from: nextFrom, to: nextTo }
}

/**
 * Creates a valid ProseMirror `NodeSelection` or `TextSelection` spanning from
 * `anchorPos` to `headPos`.
 */
export function createSafeModalSelection(
  doc: PMNode,
  anchorPos: number,
  headPos: number,
): Selection {
  const from = Math.min(anchorPos, headPos)
  const to = Math.max(anchorPos, headPos)
  if (from < to) {
    const directNode = doc.nodeAt(from)
    if (directNode && from + directNode.nodeSize === to && NodeSelection.isSelectable(directNode)) {
      return NodeSelection.create(doc, from)
    }
  }

  const resolveInlinePos = (pos: number, preferDir: 1 | -1): number => {
    const clamped = Math.max(0, Math.min(doc.content.size, pos))
    const $pos = doc.resolve(clamped)
    if ($pos.parent.inlineContent) return clamped
    const found =
      Selection.findFrom($pos, preferDir, true) ??
      Selection.findFrom($pos, -preferDir as 1 | -1, true)
    return found ? (preferDir > 0 ? found.from : found.to) : clamped
  }

  const forward = headPos >= anchorPos
  const safeAnchor = resolveInlinePos(anchorPos, forward ? 1 : -1)
  const safeHead = resolveInlinePos(headPos, forward ? -1 : 1)
  if (doc.resolve(safeAnchor).parent.inlineContent && doc.resolve(safeHead).parent.inlineContent) {
    return TextSelection.create(doc, safeAnchor, safeHead)
  }
  return Selection.near(doc.resolve(headPos))
}

/**
 * Computes the updated ProseMirror `Selection` and `{ anchor, head }` range when
 * extending a modal selection to `nextCursorChar` or `targetAtomBlock`.
 */
export function computeExtendedRangeAndSelection(
  doc: PMNode,
  sel: Selection,
  nextCursorChar: number,
  targetAtomBlock?: BlockDescriptor,
  prevExtendedRange?: { anchor: number; head: number } | null,
): { selection: Selection; extendedRange: { anchor: number; head: number } } {
  const anchorStart = getAnchorCharPos(doc, sel, prevExtendedRange)
  const anchorEnd =
    !prevExtendedRange && sel instanceof NodeSelection ? sel.to : getCharEnd(doc, anchorStart)
  const targetStart = targetAtomBlock ? targetAtomBlock.start : nextCursorChar
  const targetEnd = targetAtomBlock ? targetAtomBlock.end : getCharEnd(doc, nextCursorChar)

  if (targetStart >= anchorStart) {
    const rawFrom = anchorStart
    const rawTo = Math.max(anchorEnd, targetEnd)
    return {
      selection: createSafeModalSelection(doc, rawFrom, rawTo),
      extendedRange: { anchor: rawFrom, head: rawTo },
    }
  }

  const rawFrom = targetStart
  const rawTo = anchorEnd
  return {
    selection: createSafeModalSelection(doc, rawTo, rawFrom),
    extendedRange: { anchor: rawTo, head: rawFrom },
  }
}

/**
 * Finds the index in `blocks` containing the current modal cursor or subtext
 * cursor.
 */
export function findCurrentBlockIndex(
  blocks: BlockDescriptor[],
  doc: PMNode,
  sel: Selection,
  extendedRange?: { anchor: number; head: number } | null,
  subtextCursor?: SubtextCursorState | null,
): number {
  if (blocks.length === 0) return -1
  if (subtextCursor) {
    const subIdx = blocks.findIndex(
      (b) => b.subtextKind === subtextCursor.kind && b.pos === subtextCursor.pos,
    )
    if (subIdx !== -1) return subIdx
  }
  if (!extendedRange && sel instanceof NodeSelection) {
    const nodeIdx = blocks.findIndex((b) => b.pos === sel.from)
    if (nodeIdx !== -1) return nodeIdx
  }

  const cursorPos = getCursorCharPos(doc, sel, extendedRange)
  const textIdx = blocks.findIndex(
    (b) => !b.subtextKind && b.isTextblock && cursorPos >= b.start && cursorPos <= b.end,
  )
  if (textIdx !== -1) return textIdx

  const head = extendedRange ? extendedRange.head : sel.head
  const anchor = extendedRange ? extendedRange.anchor : sel.anchor
  if (head !== anchor) {
    if (head > anchor) {
      const forwardAtomIdx = blocks.findIndex((b) => b.isAtom && head === b.end)
      if (forwardAtomIdx !== -1) return forwardAtomIdx
    } else if (head < anchor) {
      const backwardAtomIdx = blocks.findIndex((b) => b.isAtom && head === b.start)
      if (backwardAtomIdx !== -1) return backwardAtomIdx
    }
  }

  const atomIdx = blocks.findIndex((b) => b.isAtom && cursorPos >= b.start && cursorPos <= b.end)
  return atomIdx !== -1 ? atomIdx : 0
}

function serializeModalSliceText(doc: PMNode, from: number, to: number): string {
  if (from >= to) return ''
  let hasRichNode = false
  const parts: string[] = []

  doc.nodesBetween(from, to, (node, pos) => {
    const fullyCovered = pos >= from && pos + node.nodeSize <= to
    if (fullyCovered) {
      if (node.type.name === 'imageNode' || node.type.name === 'image') {
        hasRichNode = true
        parts.push(`![${String(node.attrs.alt ?? '')}](${String(node.attrs.src ?? '')})`)
        return false
      }
      if (node.type.name === 'linkPreview') {
        hasRichNode = true
        const label = String(node.attrs.title || node.attrs.url || 'link')
        parts.push(`[${label}](${String(node.attrs.url ?? '')})`)
        return false
      }
      if (node.type.name === 'urlMention') {
        hasRichNode = true
        const label = String(node.attrs.title || node.attrs.url || 'mention')
        parts.push(`[${label}](${String(node.attrs.url ?? '')})`)
        return false
      }
      if (node.type.name === 'internalMention') {
        hasRichNode = true
        parts.push(`@${String(node.attrs.label || node.attrs.id || 'mention')}`)
        return false
      }
      if (node.type.name === 'horizontalRule') {
        hasRichNode = true
        parts.push('---')
        return false
      }
      if (node.type.name === 'unparsedBlock' || node.type.name === 'unparsedInline') {
        hasRichNode = true
        parts.push(String(node.attrs.raw ?? node.textContent ?? ''))
        return false
      }
      if (node.type.name === 'notice') {
        hasRichNode = true
        const variant = String(node.attrs.variant ?? 'info')
        const title = node.attrs.title ? `${String(node.attrs.title)}: ` : ''
        parts.push(`::: ${variant}\n${title}${node.textContent}\n:::`)
        return false
      }
    }
    if (node.isTextblock) {
      const start = Math.max(from, pos + 1)
      const end = Math.min(to, pos + 1 + node.content.size)
      if (end > start) {
        parts.push(doc.textBetween(start, end, '\n'))
      }
      return false
    }
    return true
  })

  if (hasRichNode && parts.length > 0) {
    return parts.join('\n')
  }
  const plain = doc.textBetween(from, to, '\n')
  if (plain) return plain
  return parts.join('\n')
}

function createModalTargetForEditor(
  editor: TiptapEditor,
  options: ModalEditingOptions,
): ModalEditorTarget {
  return {
    move(motion: ModalMotion, { preset, mode, count }): boolean {
      if (motion === 'lineSelect') {
        return executeSelectLines(editor, count)
      }
      if (mode === 'select') {
        return executeSelectModeExtend(editor, motion, count)
      }
      return executeNormalModeMove(editor, motion, { preset, count })
    },

    selectTextObject(spec: ModalTextObjectSpec): boolean {
      return executeNormalModeTextObject(editor, spec)
    },

    transformSelection(action: ModalSelectionTransform): boolean {
      return executeSelectionTransform(editor, action)
    },

    execOperator(
      op: ModalOperator,
      { mode, count },
    ): { enterInsert?: boolean; yankedText?: string } | boolean {
      return executeModalOperator(editor, op, { mode, count }, options)
    },

    setModalState({ mode: nextMode, preset: nextPreset }): void {
      applyModalStateTransition(editor, { mode: nextMode, preset: nextPreset })
    },

    hasActiveSuggestion(): boolean {
      return detectActiveSuggestionOverlay(editor)
    },
  }
}

function executeModalOperator(
  editor: TiptapEditor,
  op: ModalOperator,
  { mode, count }: { mode: KeymapMode; count: number },
  options: ModalEditingOptions,
): { enterInsert?: boolean; yankedText?: string } | boolean {
  const state = editor.state
  const doc = state.doc
  const sel = state.selection
  const storage = getModalStorage(editor)
  if (!storage) return false
  const pluginState = modalKeymapPluginKey.getState(state)
  const secondaryRanges = pluginState?.secondaryRanges ?? []

  if (op === 'undo') {
    const cmds = editor.commands as unknown as Record<string, (() => boolean) | undefined>
    if (typeof cmds.undo === 'function' && cmds.undo()) {
      return true
    }
    return undo(state, (tr) => dispatchModalTransaction(editor, tr))
  }

  if (op === 'redo') {
    const cmds = editor.commands as unknown as Record<string, (() => boolean) | undefined>
    if (typeof cmds.redo === 'function' && cmds.redo()) {
      return true
    }
    return redo(state, (tr) => dispatchModalTransaction(editor, tr))
  }

  if (op === 'insertStart' || op === 'appendEnd' || op === 'openBelow' || op === 'openAbove') {
    return executeInsertModeEntry(editor, op, options)
  }

  const extRange = pluginState?.extendedRange
  let primaryFrom = extRange ? Math.min(extRange.anchor, extRange.head) : sel.from
  let primaryTo = extRange ? Math.max(extRange.anchor, extRange.head) : sel.to
  if (primaryFrom === primaryTo) {
    const $head = sel.$head
    if ($head.parent.isTextblock) {
      if (op === 'yank') {
        primaryFrom = $head.start()
        primaryTo = $head.end()
      } else {
        primaryTo = Math.min($head.end(), primaryFrom + Math.max(1, count))
      }
    }
  } else if (mode === 'select') {
    const expanded = expandWholeContainerRange(doc, primaryFrom, primaryTo)
    primaryFrom = expanded.from
    primaryTo = expanded.to
  }

  if (op === 'yank') {
    const slice = doc.slice(primaryFrom, primaryTo)
    storage.registerSlice = slice
    const yankedText = serializeModalSliceText(doc, primaryFrom, primaryTo)
    if (yankedText && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(yankedText).catch(() => {})
    }
    options.onNotification?.({
      level: 'info',
      message: 'Yanked selection',
      code: 'modal.yank',
      detail: { text: yankedText },
    })
    const collapsedSelection =
      sel instanceof NodeSelection
        ? NodeSelection.create(doc, sel.from)
        : Selection.near(doc.resolve(primaryFrom), 1)
    let tr = state.tr.setSelection(collapsedSelection)
    if (mode === 'select') {
      storage.mode = 'normal'
      tr = updateModalMeta(editor, tr, {
        mode: 'normal',
        secondaryRanges: [],
        extendedRange: null,
      })
    } else {
      tr = updateModalMeta(editor, tr, { extendedRange: null })
    }
    dispatchModalTransaction(editor, tr)
    return { enterInsert: false, yankedText }
  }

  if (op === 'delete' || op === 'change') {
    const enforceH1 = options.enforceTitle !== false
    const firstChild = doc.firstChild
    const hasTitleH1 =
      enforceH1 && firstChild?.type.name === 'heading' && firstChild.attrs.level === 1
    const titleEnd = hasTitleH1 ? 1 + firstChild!.content.size : -1

    const clampRange = (from: number, to: number): { from: number; to: number } => {
      if (hasTitleH1 && from <= titleEnd) {
        const clampedFrom = Math.max(1, from)
        const clampedTo = to <= titleEnd + 1 ? Math.min(titleEnd, to) : to
        return { from: clampedFrom, to: Math.max(clampedFrom, clampedTo) }
      }
      return { from, to }
    }

    const primaryClamped = clampRange(primaryFrom, primaryTo)
    const slice = doc.slice(primaryClamped.from, primaryClamped.to)
    storage.registerSlice = slice

    const allRanges = [
      primaryClamped,
      ...secondaryRanges.map((r) =>
        clampRange(r.from, r.to > r.from ? r.to : Math.min(doc.content.size, r.from + 1)),
      ),
    ].sort((a, b) => b.from - a.from)

    let tr = closeHistory(state.tr)
    for (const r of allRanges) {
      if (r.to > r.from) {
        tr = tr.delete(r.from, r.to)
      }
    }

    if (tr.doc.childCount === 0 && state.schema.nodes.paragraph) {
      tr = tr.insert(0, state.schema.nodes.paragraph.create())
    }

    const nextPos = Math.min(tr.doc.content.size, primaryClamped.from)
    const resolved = Selection.near(tr.doc.resolve(nextPos))
    tr = tr.setSelection(resolved)
    const nextMode: KeymapMode = op === 'change' ? 'insert' : 'normal'
    storage.mode = nextMode
    tr = updateModalMeta(editor, tr, {
      mode: nextMode,
      secondaryRanges: [],
      extendedRange: null,
    })
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return { enterInsert: op === 'change' }
  }

  if (op === 'pasteAfter' || op === 'pasteBefore') {
    const slice = storage.registerSlice
    if (!slice || slice.size === 0) return false

    const isClosedBlockSlice =
      slice.openStart === 0 && slice.openEnd === 0 && Boolean(slice.content.firstChild?.isBlock)

    if (isClosedBlockSlice) {
      let insertPos: number
      if (sel instanceof NodeSelection && sel.node.isBlock) {
        insertPos = op === 'pasteAfter' ? sel.to : sel.from
      } else {
        const $ref = op === 'pasteAfter' ? sel.$to : sel.$from
        if ($ref.depth >= 1) {
          insertPos = op === 'pasteAfter' ? $ref.after(1) : $ref.before(1)
        } else {
          insertPos = op === 'pasteAfter' ? sel.to : sel.from
        }
      }

      const enforceH1 = options.enforceTitle !== false
      if (
        enforceH1 &&
        insertPos === 0 &&
        doc.firstChild?.type.name === 'heading' &&
        doc.firstChild.attrs.level === 1
      ) {
        insertPos = doc.firstChild.nodeSize
      }

      let tr = closeHistory(state.tr)
      let currentInsertPos = insertPos
      for (let i = 0; i < Math.max(1, count); i += 1) {
        tr = tr.insert(currentInsertPos, slice.content)
        currentInsertPos += slice.content.size
      }

      const firstInserted = slice.content.firstChild
      if (
        firstInserted &&
        (firstInserted.isAtom ||
          firstInserted.type.name === 'notice' ||
          firstInserted.type.name === 'codeBlock') &&
        NodeSelection.isSelectable(firstInserted)
      ) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, insertPos))
      } else {
        tr = tr.setSelection(
          Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, insertPos + 1)), 1),
        )
      }
      if (mode === 'select') {
        storage.mode = 'normal'
        tr = updateModalMeta(editor, tr, {
          mode: 'normal',
          secondaryRanges: [],
          extendedRange: null,
        })
      } else {
        tr = updateModalMeta(editor, tr, { extendedRange: null })
      }
      dispatchModalTransaction(editor, tr.scrollIntoView())
      return true
    }

    let insertPos = op === 'pasteAfter' ? sel.to : sel.from
    if (
      op === 'pasteAfter' &&
      sel.empty &&
      sel.$head.parent.isTextblock &&
      insertPos < sel.$head.end()
    ) {
      insertPos += 1
    }

    let tr = closeHistory(state.tr)
    for (let i = 0; i < Math.max(1, count); i += 1) {
      tr = tr.replaceRange(insertPos, insertPos, slice)
    }
    if (mode === 'select') {
      storage.mode = 'normal'
      tr = updateModalMeta(editor, tr, {
        mode: 'normal',
        secondaryRanges: [],
        extendedRange: null,
      })
    } else {
      tr = updateModalMeta(editor, tr, { extendedRange: null })
    }
    dispatchModalTransaction(editor, tr.scrollIntoView())
    return true
  }

  return false
}

function detectActiveSuggestionOverlay(editor: TiptapEditor): boolean {
  const doc = typeof document !== 'undefined' ? document : null
  if (!doc) return false
  const activePopup = doc.querySelector(
    '[data-slash-menu-surface], [data-mention-menu-surface], [data-editor-slash-menu], [data-editor-mention-menu], [data-editor-overlay], .tippy-box[data-state="visible"]',
  )
  if (activePopup) return true

  let root: Element | Document
  try {
    root = editor.view.dom.parentElement ?? doc
  } catch {
    root = doc
  }
  if (root.querySelector('[role="dialog"]')) return true

  const toolbars = Array.from(root.querySelectorAll<HTMLElement>('[role="toolbar"]'))
  for (const tb of toolbars) {
    const style = doc.defaultView?.getComputedStyle(tb)
    if (
      style &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    ) {
      return true
    }
  }
  return false
}
