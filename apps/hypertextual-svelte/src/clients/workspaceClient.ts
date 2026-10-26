import { invoke, isTauri } from '@tauri-apps/api/core'

export interface WorkspaceEntry {
  path: string
  name: string
  kind: 'directory' | 'file' | 'unavailable'
}
export interface ArticleContent {
  content: string
  revision: string
}
export interface ArticleMetadata {
  path: string
  name: string
  revision: string
}
export interface ImageAsset {
  source: string
  url: string
}
export interface WorkspaceClient {
  saveArticle(
    path: string,
    content: string,
    revision: string,
    title: string,
  ): Promise<ArticleMetadata>
  importImage(path: string, bytes: number[]): Promise<ImageAsset>
  readImage(path: string, source: string): Promise<ImageAsset>
  open(): Promise<{ root: string; entries: WorkspaceEntry[] }>
  list(path: string): Promise<WorkspaceEntry[]>
  create(): Promise<WorkspaceEntry>
  createFile(name: string, parentPath?: string): Promise<WorkspaceEntry>
  delete(path: string): Promise<void>
  rename(path: string, name: string): Promise<WorkspaceEntry>
  createFolder(name: string, parentPath?: string): Promise<WorkspaceEntry>
  read(path: string): Promise<ArticleContent>
  write(path: string, content: string, revision: string): Promise<string>
}
export const workspaceClient: WorkspaceClient = {
  saveArticle: (relativePath, content, expectedRevision, title) =>
    invoke('workspace_save_article', { relativePath, content, expectedRevision, title }),
  importImage: (articlePath, bytes) => invoke('workspace_import_image', { articlePath, bytes }),
  readImage: (articlePath, source) => invoke('workspace_read_image', { articlePath, source }),
  open: () => {
    if (!isTauri())
      return Promise.reject(
        new Error('Open Hypertextual in the desktop app to access ~/.hypertextual/workspace.'),
      )
    return invoke('workspace_open')
  },
  create: () => invoke('workspace_create'),
  createFile: (name, parentPath = '') => invoke('workspace_create_file', { name, parentPath }),
  delete: (relativePath) => invoke('workspace_delete', { relativePath }),
  rename: (relativePath, name) => invoke('workspace_rename', { relativePath, name }),
  createFolder: (name, parentPath = '') => invoke('workspace_create_folder', { name, parentPath }),
  list: (relativePath) => invoke('workspace_list', { relativePath }),
  read: (relativePath) => invoke('workspace_read', { relativePath }),
  write: (relativePath, content, expectedRevision) =>
    invoke('workspace_write', { relativePath, content, expectedRevision }),
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return String(error)
}
