import { getSchema, type JSONContent } from '@tiptap/core'
import { buildExtensions, type NodeViewFactory } from '@cloudvoyant/helical-ui'
import { articleIdentity, decodeArticle as decodeSource, type Article } from './editor-markdown'

// Schema inspection does not instantiate node views or mount an editor.
const schemaView: NodeViewFactory = () => () => ({ dom: document.createElement('span') })
const schema = getSchema(
  buildExtensions({
    enforceTitle: false,
    nodeViews: {
      image: schemaView,
      urlMention: schemaView,
      linkPreview: schemaView,
      codeBlock: schemaView,
      notice: schemaView,
    },
  }),
)

/** Keep source read-only if the published Helical schema cannot preserve it. */
export function decodeArticle(source: string): Article {
  const article = decodeSource(source)
  if (!article.editable) return article
  try {
    const content = JSON.parse(article.content) as JSONContent
    const normalized = schema.nodeFromJSON(content)
    normalized.check()
    if (articleIdentity(normalized.toJSON()) === articleIdentity(content)) return article
  } catch {
    // Keep unsupported nodes, attributes, or invalid documents intact on disk.
  }
  return {
    source,
    content: '',
    editable: false,
    reason:
      'This article contains formatting that the editor cannot preserve yet. The original source is shown read-only.',
  }
}

export { encodeArticle, type Article } from './editor-markdown'
