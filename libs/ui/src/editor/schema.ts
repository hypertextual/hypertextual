import { getSchema } from '@tiptap/core'
import { buildExtensions } from './core/build-extensions'
import type { NodeViewFactory } from './core/types'

// Schema inspection does not mount framework node views.
const view: NodeViewFactory = () => () => ({ dom: document.createElement('span') })
export const editorSchema = getSchema(
  buildExtensions({
    enforceTitle: false,
    nodeViews: { image: view, urlMention: view, linkPreview: view, codeBlock: view, notice: view },
  }),
)
