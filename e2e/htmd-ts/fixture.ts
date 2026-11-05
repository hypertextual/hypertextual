import {
  createStandaloneHotkeyService,
  DefaultEmbeddedEditorRegistry,
  type Editor,
  type EditorMediaAsset,
  type EditorMediaService,
  type EditorNotification,
} from 'core-ts'
import { HtmdEditor, type HtmdNodeViewFactory, type JSONContent } from 'htmd-ts'

const hotkeys = createStandaloneHotkeyService({
  initialMode: 'insert',
  attachWindowListener: false,
})
window.addEventListener(
  'keydown',
  (event) => {
    hotkeys.dispatchKeyDown(event)
  },
  true,
)

const notificationsEl = document.getElementById('notifications')!
const modeIndicator = document.getElementById('mode-indicator')!
const overlayIndicator = document.getElementById('overlay-indicator')!
const embedIndicator = document.getElementById('embed-indicator')!
const serializedOutput = document.getElementById('serialized-output')!
const editorSurface = document.getElementById('editor-surface')!
const editorHost = document.getElementById('editor-host')!
const embedContainer = document.getElementById('embed-container')!

function pushNotification(notification: EditorNotification) {
  const item = document.createElement('li')
  item.dataset.level = notification.level
  item.textContent = notification.message
  notificationsEl.appendChild(item)
}

const storedMedia = new Map<string, string>([
  [
    '.images/diagram.svg',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="teal"/></svg>',
  ],
])
const reverseMedia = new Map<string, string>()
for (const [ref, url] of storedMedia) {
  reverseMedia.set(url, ref)
}

const mediaService: EditorMediaService = {
  async get(source): Promise<EditorMediaAsset> {
    const trimmed = source.trim()
    const url = storedMedia.get(trimmed) ?? trimmed
    return { source: trimmed, url }
  },
  async batchGet(sources): Promise<EditorMediaAsset[]> {
    const out: EditorMediaAsset[] = []
    for (const s of sources) {
      const trimmed = s.trim()
      const hit = storedMedia.get(trimmed)
      if (hit) out.push({ source: trimmed, url: hit })
    }
    return out
  },
  async write(file: File): Promise<EditorMediaAsset> {
    const source = `.images/${file.name}`
    const url =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="coral"/></svg>'
    storedMedia.set(source, url)
    reverseMedia.set(url, source)
    return { source, url }
  },
  toPortableSource(displayUrl) {
    return reverseMedia.get(displayUrl) ?? displayUrl
  },
}

const embedRegistry = new DefaultEmbeddedEditorRegistry()

interface EmbeddedStubDoc {
  query: string
}

type EmbeddedStubCommands = {
  executeQuery: () => boolean
}

embedRegistry.register<EmbeddedStubDoc, EmbeddedStubCommands>('dbmd', (options) => {
  let doc: EmbeddedStubDoc = options.document ?? { query: 'SELECT 1' }
  let mountedInput: HTMLInputElement | null = null
  let unregisterScope: (() => void) | null = null

  const stubEditor: Editor<EmbeddedStubDoc, EmbeddedStubCommands> = {
    kind: 'dbmd',
    formats: ['dbmd'],
    scopeId: 'editor:dbmd',
    isEditable: options.editable ?? true,
    mode: 'insert',
    services: options.services ?? {},
    keymap: {},
    mount(el: HTMLElement) {
      const wrapper = document.createElement('div')
      wrapper.dataset.embeddedEditor = 'dbmd'
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('aria-label', 'Embedded DBMD query')
      input.value = doc.query
      wrapper.appendChild(input)
      el.appendChild(wrapper)
      mountedInput = input

      if (options.services?.hotkeys) {
        unregisterScope = options.services.hotkeys.registerKeyScope({
          id: 'editor:dbmd',
          priority: 'editor',
          element: () => wrapper,
          enabled: () => document.activeElement === input,
          getContext: () => stubEditor,
          keymap: () => ({
            Enter: {
              id: 'dbmd.execute',
              key: 'Enter',
              label: 'Execute Query',
              run: () => {
                embedIndicator.textContent = `executed:${input.value}`
                return true
              },
            },
            Escape: {
              id: 'dbmd.exit',
              key: 'Escape',
              label: 'Exit Embedded Editor',
              run: () => {
                embedIndicator.textContent = 'exited-to-parent'
                options.onExitToParent?.()
                return true
              },
            },
          }),
        })
      }
    },
    destroy() {
      unregisterScope?.()
      unregisterScope = null
      mountedInput?.parentElement?.remove()
      mountedInput = null
    },
    getDocument: () => doc,
    setDocument(next: EmbeddedStubDoc) {
      doc = next
      if (mountedInput) mountedInput.value = next.query
    },
    serialize: () => doc.query,
    deserialize: (raw: string) => ({
      source: raw,
      content: { query: raw },
      editable: true,
      title: 'DBMD Query',
      issues: [],
      imageSources: [],
      displayImages() {},
      transformImages: (c) => c,
      update(next) {
        doc = next
        return { source: next.query, title: 'DBMD Query' }
      },
      serialize: () => doc.query,
      copyDraft: () => doc.query,
    }),
    setEditable() {},
    focus() {
      mountedInput?.focus()
    },
    blur() {
      mountedInput?.blur()
    },
    getCounts: () => ({ wordCount: 1, charCount: doc.query.length, pageCount: 1, readDuration: 1 }),
    execCommand<K extends keyof EmbeddedStubCommands & string>(
      name: K,
      ..._args: Parameters<EmbeddedStubCommands[K]>
    ) {
      void _args
      if (name === 'executeQuery') {
        embedIndicator.textContent = `executed:${doc.query}`
        return true
      }
      return false
    },
    subscribe: () => () => {},
  }

  stubEditor.mount(options.element)
  return stubEditor
})

const customNoticeView: HtmdNodeViewFactory = () => (ctx) => {
  let currentVariant = String(ctx.node.attrs.variant ?? 'info')
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-node-view-wrapper', '')
  wrapper.setAttribute('data-custom-notice', currentVariant)

  const header = document.createElement('div')
  header.setAttribute('contenteditable', 'false')

  const badge = document.createElement('button')
  badge.type = 'button'
  badge.setAttribute('aria-label', 'Cycle notice style')
  badge.textContent = currentVariant
  badge.addEventListener('click', () => {
    const next = currentVariant === 'warning' ? 'success' : 'warning'
    ctx.updateAttributes({ variant: next })
  })
  header.appendChild(badge)

  const contentHost = document.createElement('div')
  contentHost.setAttribute('data-node-view-content', '')

  wrapper.append(header, contentHost)

  return {
    dom: wrapper,
    update(nextNode) {
      if (nextNode.type.name !== 'notice') return false
      currentVariant = String(nextNode.attrs.variant ?? 'info')
      wrapper.setAttribute('data-custom-notice', currentVariant)
      badge.textContent = currentVariant
      return true
    },
  }
}

const initialDoc = HtmdEditor.deserialize('# Standalone Heading\n\nInitial body paragraph.\n')
let currentDoc = initialDoc

const editor = new HtmdEditor({
  element: editorHost,
  surfaceElement: editorSurface,
  content: currentDoc.content ?? undefined,
  editable: true,
  nodeViews: {
    notice: customNoticeView,
  },
  overlays: {
    image: { width: 320, height: 180 },
  },
  services: {
    hotkeys,
    notifications: { notify: pushNotification },
    media: mediaService,
    embedRegistry,
  },
  onchange(json: JSONContent) {
    const portable = currentDoc.transformImages(json, (src) => mediaService.toPortableSource(src))
    currentDoc.update(portable)
  },
  onedit() {
    editor.setEditable(true)
    hotkeys.setMode('insert')
    modeIndicator.textContent = 'edit'
    requestAnimationFrame(() => {
      editor.focus()
    })
    return true
  },
  onexit() {
    editor.setEditable(false)
    hotkeys.setMode('normal')
    modeIndicator.textContent = 'normal'
    editorSurface.focus()
  },
  onOverlayChange(overlay) {
    overlayIndicator.textContent = overlay ? overlay.name : 'none'
  },
})

hotkeys.registerKeyScope({
  id: 'pane:standalone-surface',
  priority: 'pane',
  element: () => editorSurface,
  enabled: () => !editor.isEditable,
  getContext: () => editor,
  keymap: {
    i: {
      id: 'surface.enterInsert',
      key: 'i',
      label: 'Enter Insert Mode',
      mode: 'normal',
      run: () => {
        editor.setEditable(true)
        hotkeys.setMode('insert')
        modeIndicator.textContent = 'edit'
        editor.focus()
        return true
      },
    },
  },
})

document.getElementById('btn-serialize')!.addEventListener('click', () => {
  const portable = currentDoc.transformImages(editor.getDocument(), (src) =>
    mediaService.toPortableSource(src),
  )
  const change = currentDoc.update(portable)
  serializedOutput.textContent = change.source
})

document.getElementById('btn-load-sample')!.addEventListener('click', async () => {
  const sample = HtmdEditor.deserialize(
    '# Loaded Sample\n\n![Diagram](.images/diagram.svg)\n\n:::chart\n{"unsupported":true}\n:::\n',
  )
  const resolvedAssets = await mediaService.batchGet(sample.imageSources)
  const urlMap = new Map(resolvedAssets.map((a) => [a.source, a.url]))
  sample.displayImages((src) => urlMap.get(src) ?? src)
  currentDoc = sample
  if (sample.content) {
    editor.setDocument(sample.content)
  }
  for (const issue of sample.issues) {
    pushNotification({
      level: 'warning',
      message: `Unparsed ${issue.kind}: ${issue.message}`,
      code: issue.code,
    })
  }
})

document.getElementById('btn-insert-notice')!.addEventListener('click', () => {
  editor.execCommand('insertNotice', { variant: 'info' })
})

document.getElementById('btn-insert-media')!.addEventListener('click', async () => {
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'uploaded.svg', {
    type: 'image/svg+xml',
  })
  const written = await mediaService.write(file)
  editor.execCommand('insertImage', {
    src: written.url,
    alt: 'Uploaded asset',
  })
})

document.getElementById('btn-open-overlay')!.addEventListener('click', () => {
  editor.execCommand('openOverlay', 'image')
})

document.getElementById('btn-mount-embed')!.addEventListener('click', () => {
  embedContainer.innerHTML = ''
  editorHost.appendChild(embedContainer)
  embedRegistry.create<EmbeddedStubDoc>({
    kind: 'dbmd',
    element: embedContainer,
    document: { query: 'SELECT 1' },
    editable: true,
    services: { hotkeys },
    onExitToParent: () => {
      editor.focus()
    },
  })
  embedIndicator.textContent = 'mounted'
})
