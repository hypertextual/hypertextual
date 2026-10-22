import type { JSONContent } from '@tiptap/core'
import type { WorkspaceClient } from './workspace'

export function mapImages(content: string, transform: (src: string) => string): string {
  const doc = JSON.parse(content) as JSONContent
  function walk(node: JSONContent) {
    if (node.type === 'imageNode' && node.attrs?.src)
      node.attrs.src = transform(String(node.attrs.src))
    node.content?.forEach(walk)
  }
  walk(doc)
  return JSON.stringify(doc)
}

export async function displayImages(
  content: string,
  path: string,
  client: WorkspaceClient,
  urls: Map<string, string>,
): Promise<string> {
  const sources = new Set<string>()
  mapImages(content, (src) => {
    if (!/^(https?:|data:|blob:)/i.test(src)) sources.add(src)
    return src
  })
  const displayed = new Map<string, string>()
  await Promise.all(
    [...sources].map(async (source) => {
      try {
        const asset = await client.readImage(path, source)
        urls.set(asset.url, asset.source)
        displayed.set(source, asset.url)
      } catch {
        /* Keep the reference so a missing image never destroys the article. */
      }
    }),
  )
  return mapImages(content, (src) => displayed.get(src) ?? src)
}

export function articleTitle(content: string): string {
  const doc = JSON.parse(content) as JSONContent
  const heading = doc.content?.find((node) => node.type === 'heading' && node.attrs?.level === 1)
  return (
    heading?.content
      ?.map((node) => node.text ?? '')
      .join('')
      .trim() ?? ''
  )
}
