import { invoke, isTauri } from '@tauri-apps/api/core'

export interface WorkspaceNode {
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
export interface FileAsset {
  source: string
  url: string
}
export type WorkspaceSyncState = 'idle' | 'pending' | 'paused' | 'error'
export type WorkspaceBacking =
  | { kind: 'local'; path: string }
  | {
      kind: 'synced'
      path: string
      accountId: string
      remoteWorkspaceId: string
      syncState: WorkspaceSyncState
      rootDeviceId?: number
    }
  | { kind: 'remote'; accountId: string; remoteWorkspaceId: string }

export interface WorkspaceRecord {
  name: string
  backing: WorkspaceBacking
  lastOpenedAt: number
  available: boolean
}
export interface WorkspaceRegistrySnapshot {
  activeWorkspace: string
  workspaces: WorkspaceRecord[]
}
export interface WorkspaceUiState {
  openTabs: string[]
  activeTab: string | null
  expandedFolders: string[]
  sidebarOpen: boolean
}
export interface WorkspaceStatePatch {
  openTabs?: string[]
  activeTab?: string | null
  expandedFolders?: string[]
  sidebarOpen?: boolean
}
export interface WorkspaceOpenResult {
  workspace: WorkspaceRecord
  root: string
  entries: WorkspaceNode[]
  uiState: WorkspaceUiState
}

export interface WorkspaceClient {
  saveArticle(
    path: string,
    content: string,
    revision: string,
    title: string,
  ): Promise<ArticleMetadata>
  importFileAsset(path: string, bytes: number[], filename?: string): Promise<FileAsset>
  readFileAsset(path: string, source: string): Promise<FileAsset>
  open(): Promise<WorkspaceOpenResult>
  listWorkspaces(): Promise<WorkspaceRegistrySnapshot>
  pickFolder(title?: string): Promise<string | null>
  openWorkspaceFolder(path: string, name: string): Promise<WorkspaceOpenResult>
  createWorkspace(path: string, name: string): Promise<WorkspaceOpenResult>
  switchWorkspace(name: string): Promise<WorkspaceOpenResult>
  renameWorkspace(name: string, newName: string): Promise<WorkspaceRecord>
  relocateWorkspace(name: string, path: string): Promise<WorkspaceOpenResult>
  removeWorkspace(name: string): Promise<WorkspaceRegistrySnapshot>
  patchWorkspaceUiState(name: string, patch: WorkspaceStatePatch): Promise<WorkspaceUiState>
  list(path: string): Promise<WorkspaceNode[]>
  create(): Promise<WorkspaceNode>
  createFile(name: string, parentPath?: string): Promise<WorkspaceNode>
  delete(path: string): Promise<void>
  openDefaultApp(path: string): Promise<void>
  rename(path: string, name: string): Promise<WorkspaceNode>
  createFolder(name: string, parentPath?: string): Promise<WorkspaceNode>
  read(path: string): Promise<ArticleContent>
  write(path: string, content: string, revision: string): Promise<string>
}

export const workspaceClient: WorkspaceClient = {
  saveArticle: (relativePath, content, expectedRevision, title) =>
    invoke('workspace_save_article', { relativePath, content, expectedRevision, title }),
  importFileAsset: (articlePath, bytes, filename) =>
    invoke('workspace_import_file_asset', { articlePath, bytes, filename }),
  readFileAsset: (articlePath, source) =>
    invoke('workspace_read_file_asset', { articlePath, source }),
  open: () => {
    if (!isTauri())
      return Promise.reject(
        new Error('Open Hypertextual in the desktop app to access ~/.hypertextual/workspace.'),
      )
    return invoke('workspace_open')
  },
  listWorkspaces: () => invoke('workspace_list_all'),
  pickFolder: (title) => invoke('workspace_pick_folder', { title }),
  openWorkspaceFolder: (path, name) => invoke('workspace_open_folder', { path, name }),
  createWorkspace: (path, name) => invoke('workspace_create_workspace', { path, name }),
  switchWorkspace: (name) => invoke('workspace_switch', { name }),
  renameWorkspace: (name, newName) => invoke('workspace_rename_workspace', { name, newName }),
  relocateWorkspace: (name, path) => invoke('workspace_relocate', { name, path }),
  removeWorkspace: (name) => invoke('workspace_remove', { name }),
  patchWorkspaceUiState: (name, patch) => invoke('workspace_patch_ui_state', { name, patch }),
  create: () => invoke('workspace_create'),
  createFile: (name, parentPath = '') => invoke('workspace_create_file', { name, parentPath }),
  delete: (relativePath) => invoke('workspace_delete', { relativePath }),
  openDefaultApp: (relativePath) => invoke('workspace_open_default_app', { relativePath }),
  rename: (relativePath, name) => invoke('workspace_rename', { relativePath, name }),
  createFolder: (name, parentPath = '') => invoke('workspace_create_folder', { name, parentPath }),
  list: (relativePath) => invoke('workspace_list', { relativePath }),
  read: (relativePath) => invoke('workspace_read', { relativePath }),
  write: (relativePath, content, expectedRevision) =>
    invoke('workspace_write', { relativePath, content, expectedRevision }),
}

/** Extracts a human-readable message string from an unknown error value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return String(error)
}

/** Extracts a structured `WorkspaceError` code when present. */
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  const msg = errorMessage(error)
  const match = msg.match(/^\[([a-zA-Z]+)\]\s*/)
  return match?.[1] ?? null
}
