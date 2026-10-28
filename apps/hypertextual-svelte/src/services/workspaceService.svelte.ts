import type { TreeNode, ContextMenuItem } from '@hypertextual/ui'
import { parse } from 'htmd-ts'
import { ArticleViewModel } from '../models/articleViewModel'
import { WorkspaceNodeViewModel } from '../models/workspaceNodeViewModel'
import {
  errorMessage,
  type WorkspaceClient,
  type WorkspaceNode,
  type ArticleMetadata,
} from '../clients/workspaceClient'
import { EditorService } from './editorService.svelte'

export interface FolderRefresh {
  path: string
  version: number
}

/** Workspace view model. Rust retains filesystem ownership and path validation. */
export class WorkspaceService {
  root = $state('~/.hypertextual/workspace')
  entries = $state<WorkspaceNode[]>([])
  loading = $state(true)
  error = $state<string | null>(null)
  creationError = $state<string | null>(null)
  pendingEntry = $state<WorkspaceNode | null>(null)
  pendingParent = $state('')
  refreshFolder = $state<FolderRefresh | undefined>()
  treeVersion = $state(0)
  busy = $state(false)
  titles = $state<Record<string, string>>({})
  private listed = $state<Record<string, WorkspaceNode>>({})
  private active = true
  readonly editor: EditorService

  constructor(private client: WorkspaceClient) {
    this.editor = new EditorService(client, {
      titleChanged: (path, title) => this.updateTitle(path, title),
      saved: (path, saved, title) => this.saved(path, saved, title),
    })
  }

  get blocked() {
    return this.busy || this.editor.busy || this.editor.closing
  }
  get cannotCreate() {
    return (
      this.blocked ||
      this.editor.loading ||
      this.loading ||
      Boolean(this.error || this.pendingEntry)
    )
  }
  get selectedTitle() {
    const selected = this.editor.selected
    return selected ? (this.titles[selected.path] ?? selected.name) : 'No article selected'
  }
  get items() {
    return [
      { label: 'Local workspace', value: this.root },
      { label: 'Add workspace… (coming soon)', value: '__add__', disabled: true },
    ]
  }
  get nodes() {
    return [
      ...(this.pendingEntry && !this.pendingParent
        ? [new WorkspaceNodeViewModel(this.pendingEntry).toTreeNode()]
        : []),
      ...this.entries.map((entry) => new WorkspaceNodeViewModel(entry).toTreeNode()),
    ]
  }
  get pendingNode() {
    return this.pendingEntry
      ? new WorkspaceNodeViewModel(this.pendingEntry).toTreeNode()
      : undefined
  }

  async open() {
    this.loading = true
    this.error = null
    try {
      const result = await this.client.open()
      if (!this.active) return
      this.root = result.root
      this.entries = result.entries
      await this.loadTitles(result.entries)
    } catch (error) {
      if (this.active) this.error = errorMessage(error)
    } finally {
      if (this.active) this.loading = false
    }
  }

  async loadChildren(node: TreeNode) {
    if (node.value === this.pendingEntry?.path) return []
    const items = await this.client.list(node.value)
    if (!this.active) return []
    for (const entry of items) this.listed[entry.path] = entry
    await this.loadTitles(items)
    return items.map((entry) => new WorkspaceNodeViewModel(entry).toTreeNode())
  }

  async select(path: string) {
    if (this.blocked) return
    const entry = this.entries.find((item) => item.path === path) ?? this.listed[path]
    if (entry) await this.editor.open(entry)
  }

  async newArticle(parent = '') {
    if (this.cannotCreate) return
    this.busy = true
    this.creationError = null
    let created: WorkspaceNode | undefined
    try {
      if (!(await this.editor.flush())) return
      const siblings = await this.client.list(parent)
      let number = 1
      let name = 'Untitled.md'
      while (siblings.some((entry) => entry.name === name)) name = `Untitled ${++number}.md`
      created = await this.client.createFile(name, parent)
      if (!parent) this.entries = [...this.entries, created]
      else this.refresh(parent)
    } catch (error) {
      this.creationError = errorMessage(error)
    } finally {
      this.busy = false
    }
    if (created) {
      await this.editor.open(created)
      this.editor.focusRequest++
    }
  }

  startCreate(kind: 'file' | 'directory', parent = '') {
    if (kind === 'file') {
      void this.newArticle(parent)
      return
    }
    if (this.cannotCreate) return
    this.pendingParent = parent
    let number = 1
    let name = 'New folder'
    while (this.entries.some((entry) => entry.name === name)) name = `New folder ${++number}`
    this.pendingEntry = { path: '__hypertextual-new__', name, kind }
  }

  async commitEntry(path: string, name: string) {
    if (this.blocked) throw new Error('Wait for the current operation to finish.')
    this.busy = true
    let openNext: WorkspaceNode | undefined
    try {
      if (!(await this.editor.flush()))
        throw new Error('Save or resolve the current draft before changing files.')
      if (this.pendingEntry?.path === path) {
        const created =
          this.pendingEntry.kind === 'directory'
            ? await this.client.createFolder(name, this.pendingParent)
            : await this.client.createFile(name, this.pendingParent)
        if (!this.pendingParent)
          this.entries = [...this.entries, created].sort(
            (a, b) =>
              Number(a.kind !== 'directory') - Number(b.kind !== 'directory') ||
              a.name.localeCompare(b.name),
          )
        else this.refresh(this.pendingParent)
        this.pendingEntry = null
        if (created.kind === 'file') openNext = created
      } else {
        const renamed = await this.client.rename(path, name)
        const selected = this.editor.selected
        if (selected && (selected.path === path || selected.path.startsWith(`${path}/`))) {
          openNext = {
            ...selected,
            path: renamed.path + selected.path.slice(path.length),
            name: selected.path === path ? renamed.name : selected.name,
          }
          this.editor.clear()
        }
        this.entries = this.entries.map((entry) => (entry.path === path ? renamed : entry))
        try {
          this.entries = await this.client.list('')
          await this.loadTitles(this.entries)
        } catch (error) {
          this.creationError = errorMessage(error)
        }
        this.treeVersion++
      }
    } finally {
      this.busy = false
    }
    if (openNext) await this.editor.open(openNext)
  }

  async contextAction(path: string, action: string) {
    if (action === 'new-file' || action === 'new-folder') {
      this.startCreate(action === 'new-file' ? 'file' : 'directory', path)
      return
    }
    if (action !== 'delete' || this.blocked) return
    this.busy = true
    this.creationError = null
    try {
      if (!(await this.editor.flush())) return
      await this.client.delete(path)
      const selected = this.editor.selected
      if (selected && (selected.path === path || selected.path.startsWith(`${path}/`)))
        this.editor.clear()
      this.entries = this.entries.filter((entry) => entry.path !== path)
      try {
        this.entries = await this.client.list('')
      } catch (error) {
        this.creationError = errorMessage(error)
      }
      this.treeVersion++
    } catch (error) {
      this.creationError = errorMessage(error)
    } finally {
      this.busy = false
    }
  }

  contextItems(node: TreeNode): ContextMenuItem[] {
    return [
      ...(node.branch
        ? [
            { value: 'new-file', label: 'New article' },
            { value: 'new-folder', label: 'New folder' },
          ]
        : []),
      { value: 'rename', label: 'Rename', shortcut: 'F2' },
      { value: 'delete', label: 'Move to Trash', destructive: true },
    ]
  }

  dispose() {
    this.active = false
    this.editor.dispose()
  }

  private updateTitle(path: string, title: string) {
    if (title) this.titles[path] = title
    else delete this.titles[path]
  }
  private refresh(path: string) {
    this.refreshFolder = { path, version: (this.refreshFolder?.version ?? 0) + 1 }
  }
  private saved(oldPath: string, saved: ArticleMetadata, title: string) {
    this.entries = this.entries.map((item) =>
      item.path === oldPath ? { ...item, path: saved.path, name: saved.name } : item,
    )
    this.updateTitle(saved.path, title)
    if (oldPath !== saved.path) {
      delete this.titles[oldPath]
      const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
      if (parent) this.refresh(parent)
    }
  }
  private async loadTitles(items: WorkspaceNode[]) {
    await Promise.all(
      items
        .filter((entry) => entry.kind === 'file' && /\.(md|htmd)$/i.test(entry.name))
        .map(async (entry) => {
          try {
            const read = await this.client.read(entry.path)
            if (this.active && this.editor.selected?.path !== entry.path)
              this.updateTitle(
                entry.path,
                new ArticleViewModel(read.content, parse(read.content).content).title,
              )
          } catch {
            /* Keep unreadable entries visible under their filenames. */
          }
        }),
    )
  }
}
