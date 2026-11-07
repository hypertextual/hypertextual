import { describe, expect, it } from 'bun:test'
import { createStandaloneHotkeyService, type EditorNotification } from 'core-ts'
import { parse } from '../lib.js'
import {
  CodeBlock,
  CurrentEmptyBlock,
  defineHtmdExtension,
  EditorOverlays,
  HeadingWithId,
  HelixPreset,
  HtmdDocument,
  HtmdEditor,
  ImageNode,
  InsertMode,
  InternalMention,
  KakounePreset,
  LinkPreview,
  ModalEditing,
  NormalMode,
  NoticeNode,
  PasteUrl,
  SelectMode,
  SlashCommands,
  TitleHeading,
  UnparsableBlockFallback,
  UnparsableInlineFallback,
  UrlMention,
  VimPreset,
} from './index.js'

// integration ---------------------------------------------------------------

describe('When opening an article with HtmdEditor.deserialize and HtmdDocument', () => {
  it('keeps the original source while exposing native document JSON', () => {
    // Given
    const source = '\uFEFF# Original\r\n\r\nBody.\r\n'

    // When
    const document = HtmdEditor.deserialize(source)

    // Then
    expect(document.editable).toBe(true)
    expect(document.content).toEqual(parse(source).content)
    expect(document.title).toBe('Original')
    expect(document.serialize()).toBe(source)
  })

  it('opens unsupported source as editable unparsed content', () => {
    // Given
    const source = ':::unknown\nKeep original\n:::'

    // When
    const document = HtmdEditor.deserialize(source)

    // Then
    expect(document.editable).toBe(true)
    expect(document.content!.content![0]!.type).toBe('unparsedBlock')
    expect(document.source).toBe(source)
    expect(document.reason).toBeUndefined()
    expect(document.issues).toEqual(parse(source).issues)
    expect(document.issues.length).toBeGreaterThan(0)
    expect(document.copyDraft()).toBe(source)
  })
})

describe('When editing an HtmdDocument', () => {
  it('writes synchronous SDK output with the current heading and source conventions', () => {
    // Given
    const document = HtmdEditor.deserialize('\uFEFF# Original\r\n\r\nBody.\r\n')
    const changed = structuredClone(document.content!)
    changed.content![0]!.content![0]!.text = 'Updated'

    // When
    const change = document.update(changed)

    // Then
    expect(change.title).toBe('Updated')
    expect(HtmdEditor.extractTitle(change.source)).toBe('Updated')
    expect(change.source.startsWith('\uFEFF')).toBe(true)
    expect(change.source).toContain('\r\n')
    expect(parse(change.source).content).toEqual(changed)
  })

  it('retains the latest JSON draft when format validation rejects the edit', () => {
    // Given
    const document = new HtmdDocument('# Article\n', parse('# Article\n').content)
    const draft = structuredClone(document.content!)
    draft.content!.push({ type: 'unknownWidget' })

    // When / Then
    expect(() => document.update(draft)).toThrow()
    expect(JSON.parse(document.copyDraft())).toEqual(draft)
    expect(document.source).toBe('# Article\n')
  })
})

describe('When transforming article image references in HtmdDocument', () => {
  it('keeps display URLs separate from the portable draft and original source', () => {
    // Given
    const source = '# Picture\n\n![Photo](.images/photo.png "Caption")\n'
    const document = HtmdEditor.deserialize(source)

    // When
    document.displayImages((path) => `blob:test-${path}`)
    const portable = document.transformImages(document.content!, (url) =>
      url.replace('blob:test-', ''),
    )

    // Then
    expect(document.imageSources).toEqual(['.images/photo.png'])
    expect(JSON.stringify(document.content)).toContain('blob:test-.images/photo.png')
    expect(JSON.stringify(portable)).not.toContain('blob:')
    expect(document.serialize()).toBe(source)
  })
})

// unit ----------------------------------------------------------------------

describe('HtmdEditor format adapter and headless lifecycle', () => {
  it('identifies supported .htmd and .md filenames and untitled files', () => {
    expect(HtmdEditor.kind).toBe('htmd')
    expect(HtmdEditor.formats).toEqual(['htmd', 'md'])
    expect(HtmdEditor.supportsFile('note.htmd')).toBe(true)
    expect(HtmdEditor.supportsFile('README.md')).toBe(true)
    expect(HtmdEditor.supportsFile('canvas.excalidraw')).toBe(false)
    expect(HtmdEditor.stripExtension('note.htmd')).toBe('note')
    expect(HtmdEditor.isUntitledFile('Untitled 1.md')).toBe(true)
    expect(HtmdEditor.isUntitledFile('Untitled.htmd')).toBe(true)
    expect(HtmdEditor.isUntitledFile('Guide.md')).toBe(false)
    expect(HtmdEditor.isUnsupportedFileError('Only .md and .htmd articles can be edited.')).toBe(
      true,
    )
  })

  it('initializes headlessly, registers editor:htmd and extension keyscopes, and executes commands', () => {
    const hotkeys = createStandaloneHotkeyService({ initialMode: 'insert' })
    const notifications: EditorNotification[] = []
    const deserialized = HtmdEditor.deserialize('# Title\n\nHello world\n')

    const editor = new HtmdEditor({
      content: deserialized.content!,
      editable: true,
      enforceTitle: false,
      services: {
        hotkeys,
        notifications: {
          notify: (n) => notifications.push(n),
        },
      },
    })

    expect(editor.kind).toBe('htmd')
    expect(editor.scopeId).toBe('editor:htmd')
    expect(editor.isEditable).toBe(true)
    expect(editor.getCounts().wordCount).toBeGreaterThanOrEqual(3)

    const activeIds = hotkeys.getActiveBindings().map((b) => b.id)
    expect(activeIds).toContain('htmd.exitToNormal')
    expect(activeIds).toContain('notice.focusTitle')
    expect(activeIds).toContain('codeBlock.indent')

    expect(editor.execCommand('insertNotice', { variant: 'warning', title: 'Watch out' })).toBe(
      true,
    )
    const serialized = editor.serialize()
    expect(serialized).toContain('[!WARNING] Watch out')

    editor.exitToNormal()
    expect(editor.isEditable).toBe(false)
    expect(hotkeys.getMode()).toBe('normal')

    editor.destroy()
    hotkeys.destroy()
  })

  it('defines all HTMD extensions via defineHtmdExtension', () => {
    const extensions = [
      CodeBlock,
      CurrentEmptyBlock,
      EditorOverlays,
      HeadingWithId,
      HelixPreset,
      ImageNode,
      InsertMode,
      InternalMention,
      KakounePreset,
      LinkPreview,
      ModalEditing,
      NormalMode,
      NoticeNode,
      PasteUrl,
      SelectMode,
      SlashCommands,
      TitleHeading,
      UnparsableBlockFallback,
      UnparsableInlineFallback,
      UrlMention,
      VimPreset,
    ]
    expect(extensions).toHaveLength(21)
    for (const ext of extensions) {
      expect(typeof ext.spec.name).toBe('string')
      expect(typeof ext.configure).toBe('function')
      expect(typeof ext.extend).toBe('function')
    }

    const custom = defineHtmdExtension({
      name: 'customBehavior',
      kind: 'behavior',
    })
    expect(custom.spec.name).toBe('customBehavior')
  })

  it('inherits and overrides extension keymaps and navigation via .extend() and .configure()', () => {
    const ExtendedNotice = NoticeNode.extend({
      navigation: (_ctx, parent) => ({
        ...parent!,
        controls: ['input[data-custom-title]'],
      }),
      keymap: (_ctx, parent) => ({
        ...parent,
        'Mod-Shift-n': {
          id: 'notice.quickInsert',
          key: 'Mod-Shift-n',
          label: 'Quick Insert Notice',
          mode: 'insert',
          run: () => true,
        },
      }),
    }).configure({
      keymap: {
        'Mod-Alt-n': {
          id: 'notice.altInsert',
          key: 'Mod-Alt-n',
          label: 'Alt Insert Notice',
          mode: 'insert',
          run: () => true,
        },
      },
    })

    const nav = ExtendedNotice.spec.navigation!({
      options: ExtendedNotice.options,
      storage: {},
    })
    expect(nav.kind).toBe('container')
    expect(nav.controls).toEqual(['input[data-custom-title]'])

    const keymap = ExtendedNotice.spec.keymap!({
      editor: {} as never,
      options: ExtendedNotice.options,
      storage: {},
    })
    expect(Object.keys(keymap)).toContain('Tab')
    expect(Object.keys(keymap)).toContain('Mod-Shift-n')
    expect(Object.keys(keymap)).toContain('Mod-Alt-n')
  })
})
