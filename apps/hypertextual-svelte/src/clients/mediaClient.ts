import type { EditorAssets } from '@hypertextual/ui'
import type { WorkspaceClient } from './workspaceClient'

/** Rust owns workspace containment and the colocated .images convention. */
export class MediaClient {
  constructor(private workspace: Pick<WorkspaceClient, 'readImage' | 'importImage'>) {}

  async preview(path: string): Promise<string> {
    return (await this.workspace.readImage('', path)).url
  }

  forArticle(path: string): EditorAssets {
    return {
      resolve: async (source) => (await this.workspace.readImage(path, source)).url,
      upload: async (file) => {
        const asset = await this.workspace.importImage(
          path,
          Array.from(new Uint8Array(await file.arrayBuffer())),
        )
        return { source: asset.source, src: asset.url }
      },
    }
  }
}
