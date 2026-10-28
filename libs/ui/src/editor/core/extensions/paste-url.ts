import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const pasteUrlKey = new PluginKey('pasteUrl')

/** Paste a bare HTTP(S) URL as linked text before the default Link paste handler runs. */
export const PasteUrl = Extension.create({
  name: 'pasteUrl',
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pasteUrlKey,
        props: { handlePaste: insertPastedUrlAsLink },
      }),
    ]
  },
})

function insertPastedUrlAsLink(view: EditorView, event: ClipboardEvent): boolean {
  const value = event.clipboardData?.getData('text/plain').trim() ?? ''
  if (!value || /\s/.test(value)) return false

  try {
    const protocol = new URL(value).protocol
    if (protocol !== 'http:' && protocol !== 'https:') return false
  } catch {
    return false
  }

  const link = view.state.schema.marks.link
  if (!link) return false

  event.preventDefault()
  const text = view.state.schema.text(value, [link.create({ href: value })])
  view.dispatch(view.state.tr.replaceSelectionWith(text, false).scrollIntoView())
  return true
}
