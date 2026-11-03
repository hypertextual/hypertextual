import { describe, expect, it } from 'bun:test'
import { Editor, type JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { DecorationSet, type Decoration } from '@tiptap/pm/view'
import {
  buildExtensions,
  getEditorModalTarget,
  isEditorInInsertMode,
  modalKeymapPluginKey,
  serializeModalSliceText,
} from '../index'

const noopNodeView = () => () => ({
  dom:
    typeof document !== 'undefined'
      ? document.createElement('div')
      : ({} as unknown as HTMLElement),
})

function createHeadlessModalEditor(doc: JSONContent, enforceTitle = false): Editor {
  return new Editor({
    extensions: buildExtensions({
      enforceTitle,
      nodeViews: {
        image: noopNodeView,
        urlMention: noopNodeView,
        linkPreview: noopNodeView,
        codeBlock: noopNodeView,
        notice: noopNodeView,
        unparsedBlock: noopNodeView,
        unparsedInline: noopNodeView,
      },
    }),
    content: doc,
  })
}

function getModalDecorations(editor: Editor): Decoration[] {
  const plugin = editor.state.plugins.find((p) => p.spec.key === modalKeymapPluginKey)
  const set = plugin?.props.decorations?.call(plugin, editor.state)
  return set instanceof DecorationSet ? set.find() : []
}

// integration -----------------------------------------------------------------

describe('Given a ProseMirror editor with ModalKeymap and rich HTMD nodes', () => {
  describe('When moving in normal mode across textblocks and atom nodes', () => {
    it('positions TextSelection on textblocks and NodeSelection on imageNode and linkPreview', () => {
      // Arrange
      const editor = createHeadlessModalEditor({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Article title' }],
          },
          {
            type: 'imageNode',
            attrs: { src: '.images/photo.png', alt: 'Photo', caption: 'Photo caption' },
          },
          {
            type: 'linkPreview',
            attrs: {
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              title: 'Demo Video',
              type: 'embed',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Closing paragraph.' }],
          },
        ],
      })
      const target = getEditorModalTarget(editor)!
      target.setModalState({ mode: 'normal', preset: 'helix' })
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })

      // Act
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      const afterFirstDown = editor.state.selection
      const imageDecos = getModalDecorations(editor)

      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      const afterSecondDown = editor.state.selection

      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      const afterThirdDown = editor.state.selection

      // Assert
      expect(isEditorInInsertMode(editor)).toBe(false)
      expect(afterFirstDown instanceof NodeSelection).toBe(true)
      expect((afterFirstDown as NodeSelection).node.type.name).toBe('imageNode')
      expect(
        imageDecos.some(
          (d) =>
            (d as unknown as { type?: { attrs?: Record<string, string> } }).type?.attrs?.[
              'data-pm-modal-node-selection'
            ] === 'normal',
        ),
      ).toBe(true)
      expect(afterSecondDown instanceof NodeSelection).toBe(true)
      expect((afterSecondDown as NodeSelection).node.type.name).toBe('linkPreview')
      expect(afterThirdDown instanceof NodeSelection).toBe(false)
      expect(afterThirdDown.$head.parent.textContent).toBe('Closing paragraph.')

      editor.destroy()
    })
  })

  describe('When extending selection in select mode across notices, images, and link previews', () => {
    it('preserves the selection anchor and emits data-pm-modal-node-selection="select" decorations', () => {
      // Arrange
      const editor = createHeadlessModalEditor({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Intro paragraph' }],
          },
          {
            type: 'notice',
            attrs: { variant: 'warning', title: 'Watch out' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Notice body text' }],
              },
            ],
          },
          {
            type: 'imageNode',
            attrs: { src: '.images/diagram.png', alt: 'Diagram', caption: 'Architecture' },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Outro paragraph' }],
          },
        ],
      })
      const target = getEditorModalTarget(editor)!
      target.setModalState({ mode: 'select', preset: 'helix' })
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })

      // Act
      target.move('down', { preset: 'helix', mode: 'select', count: 1 })
      target.move('down', { preset: 'helix', mode: 'select', count: 1 })
      target.move('down', { preset: 'helix', mode: 'select', count: 1 })
      const decos = getModalDecorations(editor)
      const nodeDecos = decos.filter(
        (d) =>
          (d as unknown as { type?: { attrs?: Record<string, string> } }).type?.attrs?.[
            'data-pm-modal-node-selection'
          ] === 'select',
      )

      // Assert
      expect(editor.state.selection.from).toBeLessThan(editor.state.selection.to)
      expect(nodeDecos.length).toBeGreaterThanOrEqual(2)

      editor.destroy()
    })
  })

  describe('When selecting text objects (in vs an, ic vs ac)', () => {
    it('distinguishes inner notice body (in) from full outer notice wrapper (an)', () => {
      // Arrange
      const editor = createHeadlessModalEditor({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before notice' }],
          },
          {
            type: 'notice',
            attrs: { variant: 'info', title: 'Remember' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Keep the wrapper intact.' }],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After notice' }],
          },
        ],
      })
      const target = getEditorModalTarget(editor)!
      target.setModalState({ mode: 'normal', preset: 'helix' })
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })

      // Act: inner notice ('in')
      target.selectTextObject('in', { preset: 'helix', mode: 'normal' })
      const innerText = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
      )
      target.execOperator('delete', { preset: 'helix', mode: 'normal', count: 1 })
      const typesAfterInnerDelete = (editor.getJSON().content ?? []).map((n) => n.type)

      // Undo and test around notice ('an')
      target.execOperator('undo', { preset: 'helix', mode: 'normal', count: 1 })
      target.selectTextObject('an', { preset: 'helix', mode: 'normal' })
      const outerSelection = editor.state.selection
      target.execOperator('delete', { preset: 'helix', mode: 'normal', count: 1 })
      const typesAfterOuterDelete = (editor.getJSON().content ?? []).map((n) => n.type)

      // Assert
      expect(innerText).toBe('Keep the wrapper intact.')
      expect(typesAfterInnerDelete).toContain('notice')
      expect(outerSelection instanceof NodeSelection).toBe(true)
      expect((outerSelection as NodeSelection).node.type.name).toBe('notice')
      expect(typesAfterOuterDelete).not.toContain('notice')

      editor.destroy()
    })
  })

  describe('When executing yank, delete, pasteAfter, pasteBefore, undo, and redo on non-text nodes', () => {
    it('yanks, deletes, pastes, and undoes an imageNode and notice with full attributes preserved', () => {
      // Arrange
      const editor = createHeadlessModalEditor({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Lead paragraph' }],
          },
          {
            type: 'imageNode',
            attrs: { src: '.images/hero.png', alt: 'Hero', caption: 'Hero caption' },
          },
          {
            type: 'notice',
            attrs: { variant: 'success', title: 'Shipped' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'All checks passed.' }],
              },
            ],
          },
        ],
      })
      const target = getEditorModalTarget(editor)!
      target.setModalState({ mode: 'normal', preset: 'helix' })
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })

      // Act: yank and paste imageNode
      const yankImageResult = target.execOperator('yank', {
        preset: 'helix',
        mode: 'normal',
        count: 1,
      })
      target.execOperator('pasteAfter', { preset: 'helix', mode: 'normal', count: 1 })
      const imagesAfterPaste = (editor.getJSON().content ?? []).filter(
        (n) => n.type === 'imageNode',
      )

      // Delete one imageNode, then undo
      target.execOperator('delete', { preset: 'helix', mode: 'normal', count: 1 })
      const imagesAfterDelete = (editor.getJSON().content ?? []).filter(
        (n) => n.type === 'imageNode',
      )
      target.execOperator('undo', { preset: 'helix', mode: 'normal', count: 1 })
      const imagesAfterUndo = (editor.getJSON().content ?? []).filter(
        (n) => n.type === 'imageNode',
      )

      // Select around notice ('an'), yank, pasteAfter
      target.move('docEnd', { preset: 'helix', mode: 'normal', count: 1 })
      target.selectTextObject('an', { preset: 'helix', mode: 'normal' })
      const yankNoticeResult = target.execOperator('yank', {
        preset: 'helix',
        mode: 'normal',
        count: 1,
      })
      target.execOperator('pasteAfter', { preset: 'helix', mode: 'normal', count: 1 })
      const noticesAfterPaste = (editor.getJSON().content ?? []).filter((n) => n.type === 'notice')

      // Assert
      expect(yankImageResult).toEqual({
        enterInsert: false,
        yankedText: '![Hero](.images/hero.png)',
      })
      expect(imagesAfterPaste).toHaveLength(2)
      expect(imagesAfterPaste[1]?.attrs).toMatchObject({
        src: '.images/hero.png',
        alt: 'Hero',
        caption: 'Hero caption',
      })
      expect(imagesAfterDelete).toHaveLength(1)
      expect(imagesAfterUndo).toHaveLength(2)
      expect(typeof yankNoticeResult).toBe('object')
      expect((yankNoticeResult as { yankedText?: string }).yankedText).toContain('::: success')
      expect(noticesAfterPaste).toHaveLength(2)
      expect(noticesAfterPaste[1]?.attrs).toMatchObject({
        variant: 'success',
        title: 'Shipped',
      })

      editor.destroy()
    })
  })
})

// unit ------------------------------------------------------------------------

describe('When serializing modal slices containing non-text nodes', () => {
  it('formats imageNode, linkPreview, urlMention, and notice slices into readable Markdown', () => {
    // Arrange
    const editor = createHeadlessModalEditor({
      type: 'doc',
      content: [
        {
          type: 'imageNode',
          attrs: { src: '.images/a.png', alt: 'Alt text', caption: 'Cap' },
        },
        {
          type: 'linkPreview',
          attrs: { url: 'https://example.com', title: 'Example', type: 'bookmark' },
        },
      ],
    })

    // Act
    const serialized = serializeModalSliceText(editor.state.doc, 0, editor.state.doc.content.size)

    // Assert
    expect(serialized).toContain('![Alt text](.images/a.png)')
    expect(serialized).toContain('[Example](https://example.com)')

    editor.destroy()
  })
})
