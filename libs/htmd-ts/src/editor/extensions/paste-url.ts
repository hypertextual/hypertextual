import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { defineHtmdExtension } from '../define-htmd-extension.js'

// types ---------------------------------------------------------------------

const pasteUrlKey = new PluginKey('pasteUrl')

// api -----------------------------------------------------------------------

/**
 * Intercepts bare HTTP(S) URLs pasted from the clipboard and inserts them as
 * linked text nodes before the default Link paste handler runs:
 *
 * ```text
 * Paste "https://example.com"  -->  [https://example.com](https://example.com)|
 * ```
 */
export const PasteUrl = defineHtmdExtension({
  name: 'pasteUrl',
  kind: 'behavior',
  priority: 1100,
  pmPlugins() {
    return [createPasteUrlPlugin()]
  },
})

// pm ------------------------------------------------------------------------

function createPasteUrlPlugin(): Plugin {
  return new Plugin({
    key: pasteUrlKey,
    props: { handlePaste: insertPastedUrlAsLink },
  })
}

// helpers -------------------------------------------------------------------

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
