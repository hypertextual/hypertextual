// libs/ui/src/editor/core/extensions/modal-keymap.ts
// Self-contained Tiptap/ProseMirror extension implementing Helix/Vim/Kakoune modal editing
// behind the ProseMirror-free ModalEditorTarget seam from @cloudvoyant/helical-ui.
import { Extension, type Editor } from '@tiptap/core'
import { closeHistory, undo, redo } from '@tiptap/pm/history'
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
  registerModalEditor,
  type KeybindingPreset,
  type KeymapMode,
  type ModalEditorTarget,
  type ModalMotion,
  type ModalOperator,
  type ModalSelectionTransform,
  type ModalTextObjectSpec,
} from '@cloudvoyant/helical-ui'

export interface ModalKeymapOptions {
  enforceTitle?: boolean
}

export interface SecondaryCursorRange {
  from: number
  to: number
  head: number
}

export interface ModalKeymapPluginState {
  mode: KeymapMode
  preset: KeybindingPreset
  secondaryRanges: SecondaryCursorRange[]
  goalColumn: number | null
  extendedRange?: { anchor: number; head: number } | null
  focused?: boolean
}

export interface ModalKeymapStorage {
  target: ModalEditorTarget | null
  mode: KeymapMode
  preset: KeybindingPreset
  registerSlice: Slice | null
  clickToInsert: boolean
  activeCompoundBlockPos?: number | null
  cleanupDomRegistration?: () => void
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

interface BlockDescriptor {
  node: PMNode
  pos: number
  start: number
  end: number
  isTextblock: boolean
  isAtom: boolean
}

interface WordToken {
  start: number
  end: number
  text: string
  blockStart: number
  blockEnd: number
}

function collectLeafBlocks(doc: PMNode): BlockDescriptor[] {
  const blocks: BlockDescriptor[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'notice' || node.type.name === 'codeBlock') {
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
    if (node.isTextblock) {
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

function collectWords(doc: PMNode): WordToken[] {
  const tokens: WordToken[] = []
  doc.descendants((node, pos) => {
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

function dispatchTransaction(editor: Editor, tr: Transaction): void {
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

export function isEditorInInsertMode(editor: Editor): boolean {
  const storage = (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage }).modalKeymap
  if (!storage) return true
  return storage.mode === 'insert'
}

export function subscribeToEditorTransactions(
  editor: Editor,
  onUpdate: () => void,
): () => void {
  editor.on('update', onUpdate)
  editor.on('transaction', onUpdate)
  return () => {
    editor.off('update', onUpdate)
    editor.off('transaction', onUpdate)
  }
}

export function getEditorModalTarget(editor: Editor): ModalEditorTarget | undefined {
  const storage = (editor.storage as unknown as { modalKeymap?: ModalKeymapStorage }).modalKeymap
  if (!storage) return undefined
  if (editor.state.plugins.length === 0 && editor.extensionManager?.plugins?.length) {
    editor.view.updateState(
      editor.state.reconfigure({ plugins: editor.extensionManager.plugins }),
    )
  }
  if (!storage.target) {
    storage.target = createModalTargetForEditor(editor, { enforceTitle: true })
  }
  return storage.target
}

function getCharEnd(doc: PMNode, pos: number): number {
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

function getCursorCharPos(
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

function getAnchorCharPos(
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

function getContainerInnerTextBounds(
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

function expandWholeContainerRange(
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

function createSafeModalSelection(doc: PMNode, anchorPos: number, headPos: number): Selection {
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

function computeExtendedRangeAndSelection(
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

function findCurrentBlockIndex(
  blocks: BlockDescriptor[],
  doc: PMNode,
  sel: Selection,
  extendedRange?: { anchor: number; head: number } | null,
): number {
  if (blocks.length === 0) return -1
  if (!extendedRange && sel instanceof NodeSelection) {
    const nodeIdx = blocks.findIndex((b) => b.pos === sel.from)
    if (nodeIdx !== -1) return nodeIdx
  }

  const cursorPos = getCursorCharPos(doc, sel, extendedRange)
  const textIdx = blocks.findIndex(
    (b) => b.isTextblock && cursorPos >= b.start && cursorPos <= b.end,
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
  editor: Editor,
  options: ModalKeymapOptions,
): ModalEditorTarget {
  const getStorage = (): ModalKeymapStorage =>
    (editor.storage as unknown as { modalKeymap: ModalKeymapStorage }).modalKeymap

  const updateMeta = (tr: Transaction, patch: Partial<ModalKeymapPluginState>): Transaction => {
    const prev = modalKeymapPluginKey.getState(editor.state) ?? {
      mode: getStorage().mode,
      preset: getStorage().preset,
      secondaryRanges: [],
      goalColumn: null,
      focused: true,
    }
    return tr.setMeta(modalKeymapPluginKey, {
      ...prev,
      focused: true,
      ...patch,
    })
  }

  return {
    move(motion: ModalMotion, { preset, mode, count }): boolean {
      const state = editor.state
      const doc = state.doc
      const sel = state.selection
      const steps = Math.max(1, count)
      const isSelectionFirst = (preset === 'helix' || preset === 'kakoune') && mode === 'normal'
      const isExtend = mode === 'select'

      let tr = state.tr
      const pluginState = modalKeymapPluginKey.getState(state)

      if (motion === 'wordForward' || motion === 'wordBackward' || motion === 'wordEnd') {
        const words = collectWords(doc)
        if (words.length === 0) return false

        const cursor = sel.head
        let targetWord: WordToken | undefined

        if (motion === 'wordForward') {
          const idx = words.findIndex((w) => w.start > cursor)
          if (idx === -1) {
            targetWord = words[words.length - 1]
          } else {
            const currentWord = words.find((w) => cursor >= w.start && cursor < w.end)
            if (isSelectionFirst && currentWord && sel.empty) {
              targetWord =
                words[Math.min(words.length - 1, words.indexOf(currentWord) + (steps - 1))]
            } else {
              targetWord = words[Math.min(words.length - 1, idx + steps - 1)]
            }
          }
        } else if (motion === 'wordEnd') {
          const idx = words.findIndex((w) => w.end > cursor)
          targetWord =
            idx === -1 ? words[words.length - 1] : words[Math.min(words.length - 1, idx + steps - 1)]
        } else {
          const backRef = sel.empty ? cursor : sel.from
          let idx = -1
          for (let i = words.length - 1; i >= 0; i -= 1) {
            if (words[i]!.start < backRef) {
              idx = i
              break
            }
          }
          targetWord = idx === -1 ? words[0] : words[Math.max(0, idx - (steps - 1))]
        }

        if (!targetWord) return false

        let nextExtendedRange: { anchor: number; head: number } | null = null
        if (isExtend) {
          const nextCursor =
            motion === 'wordBackward'
              ? targetWord.start
              : Math.max(targetWord.start, targetWord.end - 1)
          const ext = computeExtendedRangeAndSelection(
            doc,
            sel,
            nextCursor,
            undefined,
            pluginState?.extendedRange,
          )
          tr = tr.setSelection(ext.selection)
          nextExtendedRange = ext.extendedRange
        } else if (isSelectionFirst) {
          if (motion === 'wordBackward') {
            tr = tr.setSelection(TextSelection.create(doc, targetWord.end, targetWord.start))
          } else {
            tr = tr.setSelection(TextSelection.create(doc, targetWord.start, targetWord.end))
          }
        } else {
          const destPos =
            motion === 'wordEnd'
              ? Math.max(targetWord.start, targetWord.end - 1)
              : targetWord.start
          tr = tr.setSelection(TextSelection.create(doc, destPos))
        }

        tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'lineSelect') {
        const blocks = collectLeafBlocks(doc)
        if (blocks.length === 0) return false

        const currentFrom = pluginState?.extendedRange
          ? Math.min(pluginState.extendedRange.anchor, pluginState.extendedRange.head)
          : sel.from
        const currentTo = pluginState?.extendedRange
          ? Math.max(pluginState.extendedRange.anchor, pluginState.extendedRange.head)
          : sel.to

        const currentBlockIdx = blocks.findIndex((b) =>
          b.isTextblock
            ? currentFrom >= b.start && currentFrom <= b.end
            : currentFrom >= b.start && currentFrom < b.end,
        )
        const startIdx =
          currentBlockIdx === -1
            ? findCurrentBlockIndex(blocks, doc, sel, pluginState?.extendedRange)
            : currentBlockIdx
        const startBlock = blocks[startIdx]!

        const alreadyCoversCurrent =
          currentFrom < currentTo &&
          currentFrom <= startBlock.start &&
          currentTo >= startBlock.end

        let endBlockIdx = startIdx + (steps - 1)
        if (alreadyCoversCurrent) {
          let currentEndIdx = startIdx
          for (let i = startIdx; i < blocks.length; i += 1) {
            const b = blocks[i]!
            if (currentTo >= b.start && currentTo <= b.end) {
              currentEndIdx = i
            }
          }
          endBlockIdx = currentEndIdx + steps
        }
        const endBlock = blocks[Math.min(blocks.length - 1, endBlockIdx)]!

        if (
          startBlock === endBlock &&
          startBlock.isAtom &&
          NodeSelection.isSelectable(startBlock.node)
        ) {
          tr = tr.setSelection(NodeSelection.create(doc, startBlock.pos))
        } else {
          tr = tr.setSelection(createSafeModalSelection(doc, startBlock.start, endBlock.end))
        }
        const nextExtendedRange = { anchor: startBlock.start, head: endBlock.end }
        if (mode === 'normal') {
          getStorage().mode = 'select'
          tr = updateMeta(tr, {
            mode: 'select',
            goalColumn: null,
            extendedRange: nextExtendedRange,
          })
        } else {
          tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        }
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'lineStart' || motion === 'lineEnd') {
        if (sel instanceof NodeSelection && !isExtend) {
          return true
        }
        const cursorPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
        const $head = doc.resolve(cursorPos)
        if (!$head.parent.isTextblock) {
          return false
        }
        let nextExtendedRange: { anchor: number; head: number } | null = null
        if (isExtend) {
          const dest =
            motion === 'lineStart' ? $head.start() : Math.max($head.start(), $head.end() - 1)
          const ext = computeExtendedRangeAndSelection(
            doc,
            sel,
            dest,
            undefined,
            pluginState?.extendedRange,
          )
          tr = tr.setSelection(ext.selection)
          nextExtendedRange = ext.extendedRange
        } else {
          const dest = motion === 'lineStart' ? $head.start() : $head.end()
          tr = tr.setSelection(TextSelection.create(doc, dest))
        }
        tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'docStart' || motion === 'docEnd') {
        const edgeSel = motion === 'docStart' ? Selection.atStart(doc) : Selection.atEnd(doc)
        let nextExtendedRange: { anchor: number; head: number } | null = null
        if (isExtend) {
          const dest =
            motion === 'docStart' ? edgeSel.head : Math.max(edgeSel.$head.start(), edgeSel.head - 1)
          const ext = computeExtendedRangeAndSelection(
            doc,
            sel,
            dest,
            undefined,
            pluginState?.extendedRange,
          )
          tr = tr.setSelection(ext.selection)
          nextExtendedRange = ext.extendedRange
        } else {
          tr = tr.setSelection(edgeSel)
        }
        tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'paragraphForward' || motion === 'paragraphBackward') {
        const dir = motion === 'paragraphForward' ? 1 : -1
        const blocks = collectLeafBlocks(doc)
        if (blocks.length === 0) return false

        const currentIdx = findCurrentBlockIndex(blocks, doc, sel, pluginState?.extendedRange)
        const targetIdx = Math.max(0, Math.min(blocks.length - 1, currentIdx + dir * steps))
        const targetBlock = blocks[targetIdx]!
        let nextExtendedRange: { anchor: number; head: number } | null = null

        if (isExtend) {
          if (targetBlock.isAtom) {
            const ext = computeExtendedRangeAndSelection(
              doc,
              sel,
              targetBlock.start,
              targetBlock,
              pluginState?.extendedRange,
            )
            tr = tr.setSelection(ext.selection)
            nextExtendedRange = ext.extendedRange
          } else {
            const dest =
              dir > 0 ? Math.max(targetBlock.start, targetBlock.end - 1) : targetBlock.start
            const ext = computeExtendedRangeAndSelection(
              doc,
              sel,
              dest,
              undefined,
              pluginState?.extendedRange,
            )
            tr = tr.setSelection(ext.selection)
            nextExtendedRange = ext.extendedRange
          }
        } else if (targetBlock.isAtom && NodeSelection.isSelectable(targetBlock.node)) {
          tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
        } else if (isSelectionFirst) {
          tr = tr.setSelection(TextSelection.create(doc, targetBlock.start, targetBlock.end))
        } else {
          tr = tr.setSelection(TextSelection.create(doc, targetBlock.start))
        }

        tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'left' || motion === 'right') {
        const dir = motion === 'left' ? -1 : 1
        if (doc.content.size === 0) return false

        let targetPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
        for (let i = 0; i < steps; i += 1) {
          const $pos = doc.resolve(targetPos)
          const nextInBlock = targetPos + dir
          if (
            $pos.parent.isTextblock &&
            nextInBlock >= $pos.start() &&
            nextInBlock <= $pos.end()
          ) {
            const childNode = dir > 0 ? $pos.nodeAfter : $pos.nodeBefore
            if (
              childNode &&
              childNode.isAtom &&
              !childNode.isText &&
              NodeSelection.isSelectable(childNode)
            ) {
              const atomPos = dir > 0 ? targetPos : targetPos - childNode.nodeSize
              if (isExtend) {
                targetPos = atomPos
                continue
              }
              tr = tr.setSelection(NodeSelection.create(doc, atomPos))
              tr = updateMeta(tr, { goalColumn: null, extendedRange: null })
              dispatchTransaction(editor, tr.scrollIntoView())
              return true
            }
            targetPos = nextInBlock
          } else {
            const found = Selection.findFrom(
              doc.resolve(Math.max(0, Math.min(doc.content.size, targetPos + dir))),
              dir,
              true,
            )
            if (found) {
              targetPos = found.head
            }
          }
        }

        let nextExtendedRange: { anchor: number; head: number } | null = null
        if (isExtend) {
          const ext = computeExtendedRangeAndSelection(
            doc,
            sel,
            targetPos,
            undefined,
            pluginState?.extendedRange,
          )
          tr = tr.setSelection(ext.selection)
          nextExtendedRange = ext.extendedRange
        } else {
          tr = tr.setSelection(TextSelection.create(doc, targetPos))
        }
        tr = updateMeta(tr, { goalColumn: null, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      if (motion === 'down' || motion === 'up') {
        const dir = motion === 'down' ? 1 : -1
        const blocks = collectLeafBlocks(doc)
        if (blocks.length === 0) return false

        const cursorPos = getCursorCharPos(doc, sel, pluginState?.extendedRange)
        const currentIdx = findCurrentBlockIndex(blocks, doc, sel, pluginState?.extendedRange)
        const currentBlock = blocks[currentIdx]!
        const currentColumn = currentBlock.isTextblock
          ? Math.max(0, cursorPos - currentBlock.start)
          : 0
        const goalCol = pluginState?.goalColumn ?? currentColumn

        const targetIdx = Math.max(0, Math.min(blocks.length - 1, currentIdx + dir * steps))
        const targetBlock = blocks[targetIdx]!
        let nextExtendedRange: { anchor: number; head: number } | null = null

        if (isExtend) {
          if (targetBlock.isAtom) {
            const ext = computeExtendedRangeAndSelection(
              doc,
              sel,
              targetBlock.start,
              targetBlock,
              pluginState?.extendedRange,
            )
            tr = tr.setSelection(ext.selection)
            nextExtendedRange = ext.extendedRange
          } else {
            const maxTargetPos =
              targetBlock.end > targetBlock.start ? targetBlock.end - 1 : targetBlock.start
            const nextHead =
              dir > 0 ? maxTargetPos : Math.min(targetBlock.start + goalCol, maxTargetPos)
            const ext = computeExtendedRangeAndSelection(
              doc,
              sel,
              nextHead,
              undefined,
              pluginState?.extendedRange,
            )
            tr = tr.setSelection(ext.selection)
            nextExtendedRange = ext.extendedRange
          }
        } else if (targetBlock.isAtom && NodeSelection.isSelectable(targetBlock.node)) {
          tr = tr.setSelection(NodeSelection.create(doc, targetBlock.pos))
        } else {
          const nextHead = Math.min(targetBlock.start + goalCol, targetBlock.end)
          tr = tr.setSelection(TextSelection.create(doc, nextHead))
        }

        tr = updateMeta(tr, { goalColumn: goalCol, extendedRange: nextExtendedRange })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      return false
    },

    selectTextObject(spec: ModalTextObjectSpec): boolean {
      const state = editor.state
      const doc = state.doc
      const sel = state.selection
      const isInner = spec.startsWith('i')
      const kind = spec.slice(1)

      if (kind === 'w') {
        const words = collectWords(doc)
        if (words.length === 0) return false
        const cursor = sel.head
        const matched =
          words.find((w) => cursor >= w.start && cursor <= w.end) ??
          words.find((w) => w.start >= cursor) ??
          words[words.length - 1]!

        let from = matched.start
        let to = matched.end

        if (!isInner) {
          const $end = doc.resolve(to)
          const afterText = doc.textBetween(to, $end.end(), '')
          const trailingWs = /^\s+/.exec(afterText)
          if (trailingWs) {
            to += trailingWs[0].length
          } else {
            const $start = doc.resolve(from)
            const beforeText = doc.textBetween($start.start(), from, '')
            const leadingWs = /\s+$/.exec(beforeText)
            if (leadingWs) {
              from -= leadingWs[0].length
            }
          }
        }

        const tr = state.tr.setSelection(TextSelection.create(doc, from, to))
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      const matchesNodeType = (typeName: string): boolean => {
        switch (kind) {
          case 'p':
            return typeName === 'paragraph' || typeName === 'heading'
          case 'c':
            return typeName === 'codeBlock'
          case 'n':
            return typeName === 'notice' || typeName === 'blockquote'
          case 'l':
            return typeName === 'listItem' || typeName === 'taskItem'
          default:
            return false
        }
      }

      const $head = sel.$head
      let targetNode: PMNode | null = null
      let targetPos = -1

      if (sel instanceof NodeSelection && matchesNodeType(sel.node.type.name)) {
        targetNode = sel.node
        targetPos = sel.from
      } else {
        for (let d = $head.depth; d >= 1; d -= 1) {
          const ancestor = $head.node(d)
          if (matchesNodeType(ancestor.type.name)) {
            targetNode = ancestor
            targetPos = $head.before(d)
            break
          }
        }
      }

      if (!targetNode || targetPos < 0) return false

      const foundNode: PMNode = targetNode
      const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(foundNode, targetPos)
      if (firstTextStart === -1 || lastTextEnd === -1) return false

      if (isInner) {
        let tr = state.tr.setSelection(TextSelection.create(doc, firstTextStart, lastTextEnd))
        tr = updateMeta(tr, { extendedRange: null })
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      // Around ('a*'): select the full outer block node [targetPos, targetPos + foundNode.nodeSize]
      // so yanking or deleting 'an' / 'ac' / 'ap' / 'al' operates on the entire node including its wrapper.
      let tr = state.tr.setSelection(
        createSafeModalSelection(doc, targetPos, targetPos + foundNode.nodeSize),
      )
      tr = updateMeta(tr, {
        extendedRange: { anchor: targetPos, head: targetPos + foundNode.nodeSize },
      })
      dispatchTransaction(editor, tr.scrollIntoView())
      return true
    },

    transformSelection(action: ModalSelectionTransform): boolean {
      const state = editor.state
      const doc = state.doc
      const sel = state.selection
      const pluginState = modalKeymapPluginKey.getState(state)
      const currentSecondary = pluginState?.secondaryRanges ?? []

      if (action === 'collapse') {
        const nextSelection =
          sel instanceof NodeSelection
            ? sel
            : TextSelection.create(doc, getCursorCharPos(doc, sel))
        let tr = state.tr.setSelection(nextSelection)
        tr = updateMeta(tr, { secondaryRanges: [] })
        dispatchTransaction(editor, tr)
        return true
      }

      if (action === 'flip') {
        if (sel.empty || sel instanceof NodeSelection) return false
        const tr = state.tr.setSelection(TextSelection.create(doc, sel.head, sel.anchor))
        dispatchTransaction(editor, tr)
        return true
      }

      if (action === 'keepPrimary') {
        const tr = updateMeta(state.tr, { secondaryRanges: [] })
        dispatchTransaction(editor, tr)
        return true
      }

      if (action === 'addCursorBelow' || action === 'addCursorAbove') {
        const dir = action === 'addCursorBelow' ? 1 : -1
        const blocks = collectLeafBlocks(doc).filter((b) => b.isTextblock)
        if (blocks.length < 2) return false

        const referenceHead =
          currentSecondary.length > 0
            ? currentSecondary[currentSecondary.length - 1]!.head
            : sel.head
        const currentIdx = blocks.findIndex(
          (b) => referenceHead >= b.start && referenceHead <= b.end,
        )
        if (currentIdx === -1) return false
        const nextIdx = currentIdx + dir
        if (nextIdx < 0 || nextIdx >= blocks.length) return false

        const currBlock = blocks[currentIdx]!
        const nextBlock = blocks[nextIdx]!
        const colOffset = referenceHead - currBlock.start
        const selLength = Math.max(0, sel.to - sel.from)

        const nextFrom = Math.min(nextBlock.start + colOffset, nextBlock.end)
        const nextTo = Math.min(nextFrom + selLength, nextBlock.end)
        const nextRange: SecondaryCursorRange = {
          from: nextFrom,
          to: nextTo,
          head: nextTo,
        }

        const tr = updateMeta(state.tr, {
          secondaryRanges: [...currentSecondary, nextRange],
        })
        dispatchTransaction(editor, tr)
        return true
      }

      return false
    },

    execOperator(
      op: ModalOperator,
      { mode, count },
    ): { enterInsert?: boolean; yankedText?: string } | boolean {
      const state = editor.state
      const doc = state.doc
      const sel = state.selection
      const storage = getStorage()
      const pluginState = modalKeymapPluginKey.getState(state)
      const secondaryRanges = pluginState?.secondaryRanges ?? []

      if (op === 'undo') {
        if (typeof editor.commands?.undo === 'function') {
          const ok = editor.commands.undo()
          if (ok) return true
        }
        return undo(state, (tr) => dispatchTransaction(editor, tr))
      }

      if (op === 'redo') {
        if (typeof editor.commands?.redo === 'function') {
          const ok = editor.commands.redo()
          if (ok) return true
        }
        return redo(state, (tr) => dispatchTransaction(editor, tr))
      }

      if (op === 'insertStart') {
        let nextSel: Selection
        if (
          sel instanceof NodeSelection &&
          (sel.node.type.name === 'notice' || sel.node.type.name === 'codeBlock')
        ) {
          const { firstTextStart } = getContainerInnerTextBounds(sel.node, sel.from)
          nextSel =
            firstTextStart !== -1 ? TextSelection.create(doc, firstTextStart) : sel
        } else {
          nextSel = sel instanceof NodeSelection ? sel : TextSelection.create(doc, sel.from)
        }
        let tr = state.tr.setSelection(nextSel)
        tr = updateMeta(tr, { mode: 'insert', secondaryRanges: [] })
        storage.mode = 'insert'
        dispatchTransaction(editor, tr)
        return { enterInsert: true }
      }

      if (op === 'appendEnd') {
        let dest: number
        if (
          sel instanceof NodeSelection &&
          (sel.node.type.name === 'notice' || sel.node.type.name === 'codeBlock')
        ) {
          const { lastTextEnd } = getContainerInnerTextBounds(sel.node, sel.from)
          dest = lastTextEnd !== -1 ? lastTextEnd : sel.to
        } else {
          dest =
            sel instanceof NodeSelection
              ? sel.to
              : sel.empty
                ? Math.min(sel.$head.end(), sel.to + 1)
                : sel.to
        }
        let tr = state.tr.setSelection(TextSelection.create(doc, dest))
        tr = updateMeta(tr, { mode: 'insert', secondaryRanges: [] })
        storage.mode = 'insert'
        dispatchTransaction(editor, tr)
        return { enterInsert: true }
      }

      if (op === 'openBelow' || op === 'openAbove') {
        let beforeBlock: number
        let afterBlock: number
        if (sel instanceof NodeSelection && sel.node.isBlock) {
          beforeBlock = sel.from
          afterBlock = sel.to
        } else {
          const $pos = sel.$head
          if ($pos.depth >= 1) {
            beforeBlock = $pos.before(1)
            afterBlock = $pos.after(1)
          } else {
            beforeBlock = sel.from
            afterBlock = sel.to
          }
        }

        const enforceH1 = options.enforceTitle !== false
        const isFirstTitle =
          enforceH1 &&
          beforeBlock === 0 &&
          doc.firstChild?.type.name === 'heading' &&
          doc.firstChild.attrs.level === 1

        const insertPos = op === 'openBelow' || isFirstTitle ? afterBlock : beforeBlock
        const paragraphType = state.schema.nodes.paragraph
        if (!paragraphType) return false

        const newParagraph = paragraphType.create()
        let tr = closeHistory(state.tr).insert(insertPos, newParagraph)
        tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
        tr = updateMeta(tr, { mode: 'insert', secondaryRanges: [], extendedRange: null })
        storage.mode = 'insert'
        dispatchTransaction(editor, tr.scrollIntoView())
        return { enterInsert: true }
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
        const collapsedSelection =
          sel instanceof NodeSelection
            ? NodeSelection.create(doc, sel.from)
            : Selection.near(doc.resolve(primaryFrom), 1)
        let tr = state.tr.setSelection(collapsedSelection)
        if (mode === 'select') {
          storage.mode = 'normal'
          tr = updateMeta(tr, { mode: 'normal', secondaryRanges: [], extendedRange: null })
        } else {
          tr = updateMeta(tr, { extendedRange: null })
        }
        dispatchTransaction(editor, tr)
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
        tr = updateMeta(tr, { mode: nextMode, secondaryRanges: [], extendedRange: null })
        dispatchTransaction(editor, tr.scrollIntoView())
        return { enterInsert: op === 'change' }
      }

      if (op === 'pasteAfter' || op === 'pasteBefore') {
        const slice = storage.registerSlice
        if (!slice || slice.size === 0) return false

        const isClosedBlockSlice =
          slice.openStart === 0 &&
          slice.openEnd === 0 &&
          Boolean(slice.content.firstChild?.isBlock)

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
            tr = updateMeta(tr, { mode: 'normal', secondaryRanges: [], extendedRange: null })
          } else {
            tr = updateMeta(tr, { extendedRange: null })
          }
          dispatchTransaction(editor, tr.scrollIntoView())
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
          tr = updateMeta(tr, { mode: 'normal', secondaryRanges: [], extendedRange: null })
        } else {
          tr = updateMeta(tr, { extendedRange: null })
        }
        dispatchTransaction(editor, tr.scrollIntoView())
        return true
      }

      return false
    },

    setModalState({ mode: nextMode, preset: nextPreset }): void {
      const storage = getStorage()
      const prev = modalKeymapPluginKey.getState(editor.state)
      const exitingInsert = (prev?.mode === 'insert' || storage.mode === 'insert') && nextMode === 'normal'
      let compoundPosToSelect: number | null = null
      if (exitingInsert) {
        if (
          typeof storage.activeCompoundBlockPos === 'number' &&
          storage.activeCompoundBlockPos >= 0 &&
          storage.activeCompoundBlockPos < editor.state.doc.content.size
        ) {
          compoundPosToSelect = storage.activeCompoundBlockPos
        } else {
          const { $from } = editor.state.selection
          for (let d = $from.depth; d >= 1; d -= 1) {
            const name = $from.node(d).type.name
            if (name === 'notice' || name === 'codeBlock') {
              compoundPosToSelect = $from.before(d)
              break
            }
          }
        }
        storage.activeCompoundBlockPos = null
      }
      if (
        storage.mode === nextMode &&
        storage.preset === nextPreset &&
        prev?.mode === nextMode &&
        prev?.preset === nextPreset &&
        compoundPosToSelect === null
      ) {
        return
      }
      storage.mode = nextMode
      storage.preset = nextPreset
      if (
        prev &&
        prev.mode === nextMode &&
        prev.preset === nextPreset &&
        prev.secondaryRanges.length === 0 &&
        compoundPosToSelect === null
      ) {
        return
      }
      try {
        let tr = editor.state.tr
        if (compoundPosToSelect !== null) {
          const node = editor.state.doc.nodeAt(compoundPosToSelect)
          if (node && NodeSelection.isSelectable(node)) {
            tr = tr.setSelection(NodeSelection.create(editor.state.doc, compoundPosToSelect))
          }
        }
        tr = updateMeta(tr, {
          mode: nextMode,
          preset: nextPreset,
          ...(nextMode === 'insert' ? { secondaryRanges: [] } : {}),
        })
        dispatchTransaction(editor, tr)
      } catch {
        // Ignore if editor is mid-destruction
      }
    },

    hasActiveSuggestion(): boolean {
      const doc = typeof document !== 'undefined' ? document : null
      if (!doc) return false
      const activePopup = doc.querySelector(
        '[data-slash-menu-surface], [data-mention-menu-surface], [data-editor-slash-menu], [data-editor-mention-menu], [data-editor-overlay], .tippy-box[data-state="visible"]',
      )
      if (activePopup) return true

      let root: Element | Document = doc
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
    },
  }
}

export const ModalKeymap = Extension.create<ModalKeymapOptions, ModalKeymapStorage>({
  name: 'modalKeymap',

  addOptions() {
    return {
      enforceTitle: true,
    }
  },

  addStorage() {
    return {
      target: null,
      mode: 'insert',
      preset: 'helix',
      registerSlice: null,
      clickToInsert: true,
      activeCompoundBlockPos: null,
      cleanupDomRegistration: undefined,
    }
  },

  onCreate() {
    const target = this.storage.target ?? createModalTargetForEditor(this.editor, this.options)
    this.storage.target = target

    try {
      const dom = this.editor.view.dom
      if (typeof HTMLElement !== 'undefined' && dom instanceof HTMLElement) {
        this.storage.cleanupDomRegistration = registerModalEditor(dom, target)
      }
    } catch {
      // Headless editor without a mounted DOM view
    }
  },

  onDestroy() {
    this.storage.cleanupDomRegistration?.()
    this.storage.cleanupDomRegistration = undefined
    this.storage.target = null
  },

  addProseMirrorPlugins() {
    const { storage, editor, options } = this
    if (!storage.target) {
      storage.target = createModalTargetForEditor(editor, options)
    }

    return [
      new Plugin<ModalKeymapPluginState>({
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
            const meta = tr.getMeta(modalKeymapPluginKey) as
              | Partial<ModalKeymapPluginState>
              | undefined
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
            if (
              !(active instanceof Element) ||
              active === doc.body ||
              active === doc.documentElement
            ) {
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
                  if (
                    tag !== 'input' &&
                    tag !== 'textarea' &&
                    !targetNode.closest('input, textarea')
                  ) {
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
                if (
                  !fullyCovered &&
                  (node.type.name === 'notice' || node.type.name === 'blockquote')
                ) {
                  const { firstTextStart, lastTextEnd } = getContainerInnerTextBounds(node, pos)
                  innerCovered =
                    pluginState.mode === 'select' &&
                    firstTextStart !== -1 &&
                    lastTextEnd !== -1 &&
                    from <= firstTextStart &&
                    to >= lastTextEnd
                }

                if (fullyCovered || innerCovered) {
                  decos.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: isPrimary
                        ? selection instanceof NodeSelection && pos === selection.from
                          ? 'pm-modal-node-selection pm-modal-cursor'
                          : 'pm-modal-node-selection'
                        : 'pm-modal-node-selection pm-multi-selection',
                      'data-pm-modal-node-selection': pluginState.mode,
                      ...(isPrimary && selection instanceof NodeSelection && pos === selection.from
                        ? { 'data-pm-modal-cursor': pluginState.mode }
                        : {}),
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
                    class: 'pm-modal-node-selection pm-modal-cursor',
                    'data-pm-modal-node-selection': pluginState.mode,
                    'data-pm-modal-cursor': pluginState.mode,
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
                      key: isMulti
                        ? `multi-cursor-${pos}`
                        : `modal-cursor-${pos}-${pluginState.mode}`,
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

            if (!pluginState.extendedRange && selection instanceof NodeSelection) {
              pushNodeDecorationsInRange(selection.from, selection.to, true)
            } else if (primaryRange.from === primaryRange.to) {
              pushCursorDecoration(head, false)
            } else if (primaryRange.from < primaryRange.to) {
              pushNodeDecorationsInRange(primaryRange.from, primaryRange.to, true)
              decos.push(
                Decoration.inline(primaryRange.from, primaryRange.to, {
                  class: 'pm-modal-selection',
                  'data-pm-modal-selection': pluginState.mode,
                }),
              )
              const $head = doc.resolve(Math.min(doc.content.size, primaryRange.head))
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
      }),
    ]
  },
})
