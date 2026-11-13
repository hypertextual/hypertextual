import { describe, expect, it } from 'bun:test'
import {
  createWhichKeyController,
  type KeymapMode,
  type WhichKeyNode,
} from '@cloudvoyant/helical-ui'
import {
  DefaultEmbeddedEditorRegistry,
  type Editor,
  type EditorHotkeyService,
  type EditorMediaAsset,
  type EditorMediaService,
  type EditorMode,
  type EditorNotification,
  type EditorPreset,
} from 'core-ts'
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
  MermaidEditor,
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
  type HtmdOverlayState,
} from './index.js'

function createKeyEvent(key: string, target?: unknown): KeyboardEvent {
  let defaultPrevented = false
  return {
    key,
    target: target ?? null,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    get defaultPrevented() {
      return defaultPrevented
    },
    preventDefault() {
      defaultPrevented = true
    },
    stopPropagation() {},
  } as unknown as KeyboardEvent
}

function createTestHotkeyService(initialMode: EditorMode = 'insert') {
  const controller = createWhichKeyController({
    defaultMode: initialMode as KeymapMode,
    disableOnMobile: false,
  })
  const hotkeys: EditorHotkeyService & { dispatchKeyDown(event: KeyboardEvent): boolean } = {
    registerKeyScope: (scope) =>
      controller.registerKeymap(
        scope.id,
        () => {
          const resolved = typeof scope.keymap === 'function' ? scope.keymap() : scope.keymap
          const nodes: Record<string, WhichKeyNode> = {}
          for (const [rawKey, binding] of Object.entries(resolved)) {
            if (!binding) continue
            const mode: KeymapMode | KeymapMode[] = binding.mode
              ? Array.isArray(binding.mode)
                ? ([...binding.mode] as KeymapMode[])
                : (binding.mode as KeymapMode)
              : ['normal', 'select', 'insert']
            nodes[rawKey] = {
              key: rawKey,
              label: binding.label,
              mode,
              when: binding.when
                ? (ctx) => (ctx.event ? binding.when!(scope.getContext(), ctx.event) : false)
                : undefined,
              action: (ctx) => (ctx.event ? binding.run(scope.getContext(), ctx.event) : false),
            }
          }
          return nodes
        },
        {
          priority: scope.priority,
          enabled: scope.enabled,
          ...((typeof scope.element === 'function' ? scope.element() : scope.element)
            ? { element: scope.element }
            : {}),
        },
      ),
    dispatchKeyDown: (event) => controller.handleKeyDown(event),
    getMode: () => controller.getState().mode as EditorMode,
    setMode: (mode) => controller.setMode(mode as KeymapMode),
    getPreset: () => controller.getState().preset as EditorPreset,
    setPreset: (preset) => controller.setPreset(preset),
    isOverlayOpen: () => false,
    subscribe: (listener) =>
      controller.subscribe((state) => {
        listener({
          mode: state.mode as EditorMode,
          preset: state.preset as EditorPreset,
          overlayOpen: Boolean(state.isOpen || state.explorerOpen),
        })
      }),
  }
  return { controller, hotkeys }
}

// integration ---------------------------------------------------------------

describe('Given an md/htmd document', () => {
  describe('When deserializing', () => {
    it('it preserves BOM, CRLF, and exact source bytes while exposing AST and title', () => {
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

    it('it wraps unsupported syntax in editable unparsedBlock nodes and reports them via EditorNotificationService', () => {
      // Given
      const source = '# Article\n\n:::unknown\nKeep original\n:::\n'
      const notifications: EditorNotification[] = []

      // When
      const document = HtmdEditor.deserialize(source)
      const editor = new HtmdEditor({
        content: document.content!,
        editable: true,
        services: {
          notifications: {
            notify: (n) => notifications.push(n),
          },
        },
      })

      // Then
      expect(document.editable).toBe(true)
      expect(document.content!.content![1]!.type).toBe('unparsedBlock')
      expect(document.issues.length).toBeGreaterThan(0)
      expect(notifications.some((n) => n.level === 'warning')).toBe(true)
      editor.destroy()
    })
  })

  describe('When editing', () => {
    it('it updates the document AST and title', () => {
      // Given
      const document = HtmdEditor.deserialize('\uFEFF# Original\r\n\r\nBody.\r\n')
      const changed = structuredClone(document.content!)
      changed.content![0]!.content![0]!.text = 'Updated'

      // When
      const change = document.update(changed)

      // Then
      expect(change.title).toBe('Updated')
      expect(HtmdEditor.extractTitle(change.source)).toBe('Updated')
    })

    it('it retains the unsaved JSON draft when schema validation rejects an update', () => {
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

  describe('When inserting or updating media', () => {
    it('it resolves display URLs via EditorMediaService while keeping portable paths on the draft', async () => {
      // Given
      const source = '# Picture\n\n![Photo](.images/photo.png "Caption")\n'
      const document = HtmdEditor.deserialize(source)
      const mediaService: EditorMediaService = {
        async get(src): Promise<EditorMediaAsset> {
          return { source: src, url: `blob:test-${src}` }
        },
        async batchGet(sources): Promise<EditorMediaAsset[]> {
          return sources.map((src) => ({ source: src, url: `blob:test-${src}` }))
        },
        async write(file: File): Promise<EditorMediaAsset> {
          return { source: `.images/${file.name}`, url: `blob:test-.images/${file.name}` }
        },
        toPortableSource(displayUrl: string): string {
          return displayUrl.replace('blob:test-', '')
        },
      }

      // When
      const resolved = await mediaService.batchGet(document.imageSources)
      const urlMap = new Map(resolved.map((a) => [a.source, a.url]))
      document.displayImages((path) => urlMap.get(path) ?? path)
      const portable = document.transformImages(document.content!, (url) =>
        mediaService.toPortableSource(url),
      )

      // Then
      expect(document.imageSources).toEqual(['.images/photo.png'])
      expect(JSON.stringify(document.content)).toContain('blob:test-.images/photo.png')
      expect(JSON.stringify(portable)).not.toContain('blob:')
      expect(document.serialize()).toBe(source)
    })
  })

  describe('When serializing', () => {
    it('it round-trips edited blocks, marks, media paths, and unparsedBlock nodes using the original file conventions', () => {
      // Given
      const source =
        '\uFEFF# Original\r\n\r\n![Diagram](.images/diagram.svg)\r\n\r\n:::chart\r\n{"raw":true}\r\n:::\r\n'
      const document = HtmdEditor.deserialize(source)
      document.displayImages((path) => `blob:test-${path}`)

      const editor = new HtmdEditor({
        content: document.content!,
        editable: true,
        enforceTitle: false,
      })

      // When
      editor.execCommand('insertNotice', { variant: 'info', title: 'Summary' })
      const portable = document.transformImages(editor.getDocument(), (url) =>
        url.replace('blob:test-', ''),
      )
      const saved = document.update(portable)

      // Then
      expect(saved.source.startsWith('\uFEFF')).toBe(true)
      expect(saved.source).toContain('\r\n')
      expect(saved.source).toContain('.images/diagram.svg')
      expect(saved.source).toContain(':::chart')
      expect(saved.source).toContain('[!NOTE] Summary')
      editor.destroy()
    })
  })
})

describe('Given an HtmdEditor with a mounted embedded child editor', () => {
  describe('When dispatching keys inside the child editor', () => {
    it('it routes key events to the child scope before editor:htmd', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('insert')
      const embedRegistry = new DefaultEmbeddedEditorRegistry()
      const parentTarget = {
        nodeType: 1,
        parentElement: null,
        contains(node: unknown) {
          return node === parentTarget || node === childTarget
        },
      } as unknown as HTMLElement
      const childTarget = {
        nodeType: 1,
        parentElement: parentTarget,
        contains(node: unknown) {
          return node === childTarget
        },
      } as unknown as HTMLElement

      let executedQuery = ''
      embedRegistry.register<{ query: string }, { executeQuery: () => boolean }>('dbmd', (opts) => {
        const unregister = opts.services?.hotkeys?.registerKeyScope({
          id: 'editor:dbmd',
          priority: 'editor',
          element: () => opts.element,
          getContext: () => null,
          keymap: {
            Enter: {
              id: 'dbmd.execute',
              key: 'Enter',
              label: 'Execute Query',
              run: () => {
                executedQuery = opts.document?.query ?? ''
                return true
              },
            },
            Escape: {
              id: 'dbmd.exit',
              key: 'Escape',
              label: 'Exit Embedded Editor',
              run: () => {
                opts.onExitToParent?.()
                return true
              },
            },
          },
        })
        const stub: Editor<{ query: string }, { executeQuery: () => boolean }> = {
          kind: 'dbmd',
          formats: ['dbmd'],
          scopeId: 'editor:dbmd',
          isEditable: true,
          mode: 'insert',
          services: opts.services ?? {},
          keymap: {},
          mount() {},
          destroy() {
            unregister?.()
          },
          getDocument: () => opts.document ?? { query: '' },
          setDocument() {},
          serialize: () => opts.document?.query ?? '',
          deserialize: (raw) => ({
            source: raw,
            content: { query: raw },
            editable: true,
            title: 'Query',
            issues: [],
            imageSources: [],
            displayImages() {},
            transformImages: (c) => c,
            update: (next) => ({ source: next.query, title: 'Query' }),
            serialize: () => raw,
            copyDraft: () => raw,
          }),
          setEditable() {},
          focus() {},
          blur() {},
          getCounts: () => ({ wordCount: 1, charCount: 8, pageCount: 1, readDuration: 1 }),
          execCommand: () => true,
          subscribe: () => () => {},
        }
        return stub
      })

      const editor = new HtmdEditor({
        surfaceElement: parentTarget,
        editable: true,
        services: { hotkeys, embedRegistry },
      })
      const childEditor = embedRegistry.create({
        kind: 'dbmd',
        element: childTarget,
        document: { query: 'SELECT * FROM articles' },
        services: { hotkeys },
      })

      // When
      const enterEvent = createKeyEvent('Enter', childTarget)
      const handled = hotkeys.dispatchKeyDown(enterEvent)

      // Then
      expect(handled).toBe(true)
      expect(executedQuery).toBe('SELECT * FROM articles')
      expect(editor.isEditable).toBe(true)

      childEditor.destroy()
      editor.destroy()
    })
  })

  describe('When pressing Escape inside the child editor', () => {
    it('it exits the child scope and restores focus to editor:htmd', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('insert')
      const embedRegistry = new DefaultEmbeddedEditorRegistry()
      const parentTarget = {
        nodeType: 1,
        parentElement: null,
        contains(node: unknown) {
          return node === parentTarget || node === childTarget
        },
      } as unknown as HTMLElement
      const childTarget = {
        nodeType: 1,
        parentElement: parentTarget,
        contains(node: unknown) {
          return node === childTarget
        },
      } as unknown as HTMLElement

      let exitedToParent = false
      embedRegistry.register<{ query: string }, Record<string, never>>('dbmd', (opts) => {
        const unregister = opts.services?.hotkeys?.registerKeyScope({
          id: 'editor:dbmd',
          priority: 'editor',
          element: () => opts.element,
          getContext: () => null,
          keymap: {
            Escape: {
              id: 'dbmd.exit',
              key: 'Escape',
              label: 'Exit Embedded Editor',
              run: () => {
                opts.onExitToParent?.()
                return true
              },
            },
          },
        })
        return {
          kind: 'dbmd',
          formats: ['dbmd'],
          scopeId: 'editor:dbmd',
          isEditable: true,
          mode: 'insert',
          services: opts.services ?? {},
          keymap: {},
          mount() {},
          destroy() {
            unregister?.()
          },
          getDocument: () => ({ query: '' }),
          setDocument() {},
          serialize: () => '',
          deserialize: (raw) => ({
            source: raw,
            content: { query: raw },
            editable: true,
            title: '',
            issues: [],
            imageSources: [],
            displayImages() {},
            transformImages: (c) => c,
            update: () => ({ source: '', title: '' }),
            serialize: () => '',
            copyDraft: () => '',
          }),
          setEditable() {},
          focus() {},
          blur() {},
          getCounts: () => ({ wordCount: 0, charCount: 0, pageCount: 1, readDuration: 1 }),
          execCommand: () => false,
          subscribe: () => () => {},
        }
      })

      const editor = new HtmdEditor({
        surfaceElement: parentTarget,
        editable: true,
        services: { hotkeys, embedRegistry },
      })
      const childEditor = embedRegistry.create({
        kind: 'dbmd',
        element: childTarget,
        document: { query: '' },
        services: { hotkeys },
        onExitToParent: () => {
          exitedToParent = true
        },
      })

      // When
      const escapeEvent = createKeyEvent('Escape', childTarget)
      const handled = hotkeys.dispatchKeyDown(escapeEvent)

      // Then
      expect(handled).toBe(true)
      expect(exitedToParent).toBe(true)
      expect(editor.isEditable).toBe(true)

      childEditor.destroy()
      editor.destroy()
    })
  })
})

describe('Given an HtmdEditor in insert mode', () => {
  describe('When executing block, mark, and overlay commands', () => {
    it('it inserts notices, code blocks, images, bookmarks, and YouTube embeds and round-trips Markdown', () => {
      // Given
      const doc = HtmdEditor.deserialize('# Title\n\nBody paragraph\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: true,
        enforceTitle: false,
      })

      // When
      expect(editor.execCommand('insertNotice', { variant: 'warning', title: 'Alert' })).toBe(true)
      expect(
        editor.insertOrReplaceBookmark(editor.getSelectionState().to, {
          url: 'https://example.com',
          title: 'Example',
          description: 'Site',
          image: null,
          favicon: null,
          provider: 'example.com',
        }),
      ).toBe(true)
      expect(
        editor.insertOrReplaceImage(editor.getSelectionState().to, {
          src: '.images/pic.png',
          alt: 'Pic',
          caption: 'My caption',
        }),
      ).toBe(true)
      expect(
        editor.insertYouTubeEmbed(
          editor.getSelectionState().to,
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ),
      ).toBe(true)

      // Then
      const markdown = editor.serialize()
      expect(markdown).toContain('[!WARNING] Alert')
      expect(markdown).toContain('https://example.com')
      expect(markdown).toContain('.images/pic.png')
      expect(markdown).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      editor.destroy()
    })

    it('it toggles inline marks and links and updates word and character counts', () => {
      // Given
      const doc = HtmdEditor.deserialize('# Heading\n\nHello world\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: true,
        enforceTitle: false,
      })

      // When
      expect(editor.execCommand('toggleBold')).toBe(true)
      expect(editor.execCommand('setLink', 'https://hypertextual.dev')).toBe(true)
      expect(editor.execCommand('unsetLink')).toBe(true)

      // Then
      const counts = editor.getCounts()
      expect(counts.wordCount).toBeGreaterThanOrEqual(3)
      expect(counts.charCount).toBeGreaterThan(10)
      editor.destroy()
    })

    it('it opens and closes named overlays with position and payload state', () => {
      // Given
      const states: Array<HtmdOverlayState | null> = []
      const editor = new HtmdEditor({
        editable: true,
        overlays: {
          bookmark: { width: 320, height: 240, gap: 4 },
        },
        onOverlayChange: (overlay) => states.push(overlay),
      })

      // When
      expect(editor.openOverlay('bookmark', { position: 2, data: { url: 'https://a.com' } })).toBe(
        true,
      )
      expect(editor.closeOverlay('bookmark')).toBe(true)

      // Then
      expect(states).toHaveLength(2)
      expect(states[0]?.name).toBe('bookmark')
      expect(states[0]?.position).toBe(2)
      expect(states[0]?.data).toEqual({ url: 'https://a.com' })
      expect(states[1]).toBeNull()
      editor.destroy()
    })
  })

  describe('When pressing Escape', () => {
    it('it exits to normal mode, disables editing, and re-selects the enclosing compound block', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('insert')
      const doc = HtmdEditor.deserialize('# Title\n\n> [!NOTE] Callout\n> Inside notice\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: true,
        services: { hotkeys },
      })

      // When
      const escaped = hotkeys.dispatchKeyDown(createKeyEvent('Escape'))

      // Then
      expect(escaped).toBe(true)
      expect(editor.isEditable).toBe(false)
      expect(editor.mode).toBe('normal')
      expect(hotkeys.getMode()).toBe('normal')
      editor.destroy()
    })
  })
})

describe('Given an HtmdEditor in normal mode', () => {
  describe('When pressing movement keys (j, k, w, b, gg, G)', () => {
    it('it moves across blocks and compound subtext controls (Notice title, Image caption, Bookmark URL)', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize(
        '# Title\n\nFirst paragraph words\n\n> [!NOTE] Notice Header\n> Notice body\n\n![Alt](.images/a.png "Image Caption")\n\n:::bookmark {url="https://example.com" title="Example" description="Desc" type="bookmark"} :::\n',
      )
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!

      // When / Then
      expect(target.move('down', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(target.move('down', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.getSubtextCursor()?.kind).toBe('noticeTitle')
      expect(target.move('wordForward', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(target.move('wordBackward', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)

      expect(target.move('down', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(target.move('down', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.getSubtextCursor()?.kind).toBe('imageCaption')
      expect(editor.getSelectionState().isNodeSelection).toBe(true)

      expect(target.move('down', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.getSubtextCursor()?.kind).toBe('linkPreviewUrl')

      expect(target.move('up', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.getSubtextCursor()?.kind).toBe('imageCaption')
      expect(target.move('docEnd', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      editor.destroy()
    })
  })

  describe('When pressing insert operators (i, a, o, O, Enter)', () => {
    it('it enters insert mode at the target position or compound block control', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize('# Title\n\n> [!NOTE] Notice Header\n> Body\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!

      // When (i -> insertStart)
      const enteredI = target.execOperator('insertStart', {
        preset: 'helix',
        mode: 'normal',
        count: 1,
      })
      expect(enteredI).toEqual({ enterInsert: true })
      expect(editor.isEditable).toBe(true)

      // Exit back to normal and test openBelow (o)
      editor.exitToNormal()
      expect(editor.isEditable).toBe(false)
      const enteredO = target.execOperator('openBelow', {
        preset: 'helix',
        mode: 'normal',
        count: 1,
      })
      expect(enteredO).toEqual({ enterInsert: true })
      expect(editor.isEditable).toBe(true)

      // Exit back to normal, move onto notice title, and press Enter (enterCompoundBlock)
      editor.exitToNormal()
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      const enterHandled = hotkeys.dispatchKeyDown(createKeyEvent('Enter'))
      expect(enterHandled).toBe(true)
      expect(editor.isEditable).toBe(true)
      editor.destroy()
    })
  })

  describe('When pressing selection operators (v, x)', () => {
    it('it enters select mode and highlights the current range or line', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize('# Title\n\nFirst line\n\nSecond line\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!

      // When
      target.setModalState({ mode: 'select', preset: 'helix' })
      expect(editor.mode).toBe('select')

      target.setModalState({ mode: 'normal', preset: 'helix' })
      expect(target.move('lineSelect', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.mode).toBe('select')
      expect(editor.getSelectionState().empty).toBe(false)
      editor.destroy()
    })
  })

  describe('When switching presets (Helix, Vim, Kakoune)', () => {
    it('it applies the active preset grammar to subsequent motions and operators', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize('# Title\n\nAlpha beta gamma\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!

      // When (Helix selection-first word motion vs Vim collapsed word motion)
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('wordForward', { preset: 'helix', mode: 'normal', count: 1 })
      hotkeys.setPreset('vim')
      expect(hotkeys.getPreset()).toBe('vim')
      target.move('wordForward', { preset: 'vim', mode: 'normal', count: 1 })

      hotkeys.setPreset('kakoune')
      expect(hotkeys.getPreset()).toBe('kakoune')
      expect(target.move('wordForward', { preset: 'kakoune', mode: 'normal', count: 1 })).toBe(true)
      editor.destroy()
    })
  })
})

describe('Given an HtmdEditor in select mode', () => {
  describe('When transforming the selection (d, y, p, u)', () => {
    it('it deletes, yanks, pastes, and undoes across text and block selections', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize('# Title\n\nParagraph to transform\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!

      // When (select line -> yank -> pasteAfter -> delete -> undo)
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('lineSelect', { preset: 'helix', mode: 'normal', count: 1 })
      const yanked = target.execOperator('yank', { preset: 'helix', mode: 'select', count: 1 })
      expect(typeof yanked === 'object' && yanked.yankedText).toContain('Paragraph to transform')

      expect(target.execOperator('pasteAfter', { preset: 'helix', mode: 'normal', count: 1 })).toBe(
        true,
      )
      target.move('lineSelect', { preset: 'helix', mode: 'normal', count: 1 })
      expect(
        Boolean(target.execOperator('delete', { preset: 'helix', mode: 'select', count: 1 })),
      ).toBe(true)
      expect(target.execOperator('undo', { preset: 'helix', mode: 'normal', count: 1 })).toBe(true)
      expect(editor.serialize()).toContain('Paragraph to transform')

      // Select and delete an unparsedBlock node cleanly
      const docWithUnparsed = HtmdEditor.deserialize('# Title\n\n:::chart\n{"raw":true}\n:::\n')
      editor.setDocument(docWithUnparsed.content!)
      target.move('docStart', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('lineSelect', { preset: 'helix', mode: 'normal', count: 2 })
      expect(
        Boolean(target.execOperator('delete', { preset: 'helix', mode: 'select', count: 1 })),
      ).toBe(true)
      expect(editor.serialize()).not.toContain(':::chart')
      editor.destroy()
    })
  })

  describe('When pressing Escape', () => {
    it('it collapses the selection and returns to normal mode', () => {
      // Given
      const { hotkeys } = createTestHotkeyService('normal')
      const doc = HtmdEditor.deserialize('# Title\n\nSelectable line\n')
      const editor = new HtmdEditor({
        content: doc.content!,
        editable: false,
        services: { hotkeys },
      })
      const target = editor.getModalTarget()!
      target.move('down', { preset: 'helix', mode: 'normal', count: 1 })
      target.move('lineSelect', { preset: 'helix', mode: 'normal', count: 1 })
      expect(editor.mode).toBe('select')

      // When
      expect(target.move('wordForward', { preset: 'helix', mode: 'select', count: 1 })).toBe(true)
      expect(target.transformSelection('collapse')).toBe(true)
      target.setModalState({ mode: 'normal', preset: 'helix' })

      // Then
      expect(editor.mode).toBe('normal')
      expect(editor.getSelectionState().empty).toBe(true)
      editor.destroy()
    })
  })
})

// unit ----------------------------------------------------------------------

describe('Given a filename or error message', () => {
  describe('When checking format support on HtmdEditor', () => {
    it('it matches .md and .htmd extensions and strips extensions', () => {
      expect(HtmdEditor.kind).toBe('htmd')
      expect(HtmdEditor.formats).toEqual(['htmd', 'md'])
      expect(HtmdEditor.supportsFile('note.htmd')).toBe(true)
      expect(HtmdEditor.supportsFile('README.md')).toBe(true)
      expect(HtmdEditor.supportsFile('canvas.excalidraw')).toBe(false)
      expect(HtmdEditor.stripExtension('note.htmd')).toBe('note')
    })

    it('it identifies untitled filenames and unsupported-format errors', () => {
      expect(HtmdEditor.isUntitledFile('Untitled 1.md')).toBe(true)
      expect(HtmdEditor.isUntitledFile('Untitled.htmd')).toBe(true)
      expect(HtmdEditor.isUntitledFile('Guide.md')).toBe(false)
      expect(HtmdEditor.isUnsupportedFileError('Only .md and .htmd articles can be edited.')).toBe(
        true,
      )
    })
  })
})

describe('Given an extension defined with defineHtmdExtension', () => {
  describe('When inspecting all built-in HTMD extensions', () => {
    it('it exposes schema, keymap, commands, and navigation contracts on all 22 extensions', () => {
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
        MermaidEditor,
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
      expect(extensions).toHaveLength(22)
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
  })

  describe('When calling .configure() and .extend()', () => {
    it('it merges options and overrides parent keymap, commands, and navigation', () => {
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
})
