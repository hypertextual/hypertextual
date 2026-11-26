import { DefaultEmbeddedEditorRegistry, type EditorHostServices } from 'core-ts'
import type { TreeNode, ContextMenuItem, TabItem } from '@hypertextual/ui'
import { WorkspaceNodeViewModel } from '../models/workspaceNodeViewModel'
import {
  errorCode,
  errorMessage,
  type WorkspaceClient,
  type WorkspaceNode,
  type WorkspaceOpenResult,
  type WorkspaceRecord,
  type WorkspaceStatePatch,
  type WorkspaceUiState,
  type ArticleMetadata,
} from '../clients/workspaceClient'
import { EditorService } from './editorService.svelte'
import { HotkeyService } from './hotkeyService.svelte'
import { SettingsService } from './settingsService.svelte'

export interface FolderRefresh {
  path: string
  version: number
}

interface CachedWorkspaceSnapshot {
  entries: WorkspaceNode[]
  titles: Record<string, string>
  listed: Record<string, WorkspaceNode>
  openTabs: string[]
  activeTab: string | null
  expandedFolders: string[]
  sidebarOpen: boolean
}

export const WORKSPACE_ACTION_OPEN = '__open_workspace__'

/** Workspace view model. Rust retains filesystem ownership and path validation. */
export class WorkspaceService {
  root = $state('~/.hypertextual/workspace')
  workspaces = $state<WorkspaceRecord[]>([])
  activeWorkspaceName = $state('Local workspace')
  missingWorkspace = $state<WorkspaceRecord | null>(null)
  pendingWorkspacePath = $state<string | null>(null)
  entries = $state<WorkspaceNode[]>([])
  openTabs = $state<string[]>([])
  activeTab = $state<string | null>(null)
  expandedFolders = $state<string[]>([])
  loading = $state(true)
  error = $state<string | null>(null)
  creationError = $state<string | null>(null)
  pendingEntry = $state<WorkspaceNode | null>(null)
  pendingParent = $state('')
  renamingPath = $state<string | null>(null)
  sidebarOpen = $state(true)
  commandOpen = $state(false)
  refreshFolder = $state<FolderRefresh | undefined>()
  treeVersion = $state(0)
  busy = $state(false)
  titles = $state<Record<string, string>>({})
  private dirChildren = $state<Record<string, WorkspaceNode[]>>({})
  private listed = $state<Record<string, WorkspaceNode>>({})
  private workspaceCache = new Map<string, CachedWorkspaceSnapshot>()
  private openRequestSeq = 0
  private pendingStatePatch: WorkspaceStatePatch = {}
  private statePatchTimer: ReturnType<typeof setTimeout> | null = null
  private active = true
  readonly editor: EditorService
  readonly settings = new SettingsService()
  readonly hotkeys: HotkeyService
  readonly editorServices: EditorHostServices

  constructor(private client: WorkspaceClient) {
    this.editor = new EditorService(client, {
      titleChanged: (path, title) => this.updateTitle(path, title),
      saved: (path, saved, title) => this.saved(path, saved, title),
      mediaImported: (articlePath) => this.handleMediaImported(articlePath),
    })
    this.hotkeys = new HotkeyService(this)
    this.editorServices = {
      media: this.editor.mediaService,
      embedRegistry: new DefaultEmbeddedEditorRegistry(),
      openExternal: (source) => this.openExternalAsset(source),
    }
  }

  get blocked() {
    return this.busy || this.editor.busy || this.editor.closing
  }
  get cannotCreate() {
    return (
      this.blocked ||
      this.editor.loading ||
      this.loading ||
      Boolean(this.error || this.missingWorkspace || this.pendingEntry)
    )
  }
  get activeWorkspace(): WorkspaceRecord | null {
    return (
      this.workspaces.find(
        (w) => w.name.toLowerCase() === this.activeWorkspaceName.toLowerCase(),
      ) ?? null
    )
  }
  get selectedTitle() {
    const selected = this.editor.selected
    return selected ? (this.titles[selected.path] ?? selected.name) : 'No article selected'
  }
  get items() {
    const records =
      this.workspaces.length > 0
        ? this.workspaces.map((record) => ({
            label: record.available ? record.name : `${record.name} (missing)`,
            value: record.name,
            disabled: record.backing.kind === 'remote',
          }))
        : [{ label: this.activeWorkspaceName, value: this.activeWorkspaceName }]
    return [...records, { label: 'Open workspace…', value: WORKSPACE_ACTION_OPEN }]
  }
  get tabItems(): TabItem[] {
    return this.openTabs.map((path) => {
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
      const label = this.titles[path] ?? name
      const dirty = this.editor.selected?.path === path && this.editor.dirty
      return {
        value: path,
        label,
        title: path,
        dirty,
        closable: true,
      }
    })
  }
  get nodes() {
    const filterVisible = (items: WorkspaceNode[]) =>
      this.settings.showHiddenFiles ? items : items.filter((entry) => !entry.name.startsWith('.'))
    const attachChildren = (entry: WorkspaceNode): TreeNode => {
      const base = new WorkspaceNodeViewModel(entry).toTreeNode()
      if (entry.kind === 'directory' && this.dirChildren[entry.path]) {
        return {
          ...base,
          children: filterVisible(this.dirChildren[entry.path]!).map(attachChildren),
        }
      }
      return base
    }
    return [
      ...(this.pendingEntry && !this.pendingParent
        ? [new WorkspaceNodeViewModel(this.pendingEntry).toTreeNode()]
        : []),
      ...filterVisible(this.entries).map(attachChildren),
    ]
  }
  get pendingNode() {
    return this.pendingEntry
      ? new WorkspaceNodeViewModel(this.pendingEntry).toTreeNode()
      : undefined
  }

  toggleShowHiddenFiles(): boolean {
    const next = this.settings.toggleShowHiddenFiles()
    this.treeVersion++
    void this.refreshRoot()
    return next
  }

  private async refreshRoot() {
    try {
      const items = await this.client.list('')
      if (!this.active) return
      this.entries = items
      this.treeVersion++
    } catch {
      // Keep current sidebar entries if background refresh fails.
    }
  }

  private handleMediaImported(articlePath: string) {
    const parent = articlePath.includes('/')
      ? articlePath.slice(0, articlePath.lastIndexOf('/'))
      : ''
    if (!parent) void this.refreshRoot()
    else this.refresh(parent)
  }

  async openExternalAsset(source: string) {
    if (!source || /^https?:|^data:|^blob:/i.test(source)) return
    const articlePath = this.editor.selected?.path ?? ''
    const parent = articlePath.includes('/')
      ? articlePath.slice(0, articlePath.lastIndexOf('/'))
      : ''
    const relative = parent ? `${parent}/${source}` : source
    await this.client.openDefaultApp(relative)
  }

  async open() {
    const seq = ++this.openRequestSeq
    this.loading = true
    this.error = null
    this.missingWorkspace = null
    try {
      await this.refreshRegistry()
      const result = await this.client.open()
      if (!this.active || seq !== this.openRequestSeq) return
      await this.applyOpenResult(result, seq)
    } catch (error) {
      if (!this.active || seq !== this.openRequestSeq) return
      if (errorCode(error) === 'missingWorkspace' && this.activeWorkspace) {
        this.missingWorkspace = this.activeWorkspace
        this.entries = []
        this.openTabs = []
        this.activeTab = null
        this.editor.clear()
      } else {
        this.error = errorMessage(error)
      }
    } finally {
      if (this.active && seq === this.openRequestSeq) this.loading = false
    }
  }

  hasWorkspaceName(candidate: string, ignoreName?: string): boolean {
    const normalized = candidate.trim().toLowerCase()
    if (!normalized) return false
    return this.workspaces.some(
      (record) =>
        record.name.toLowerCase() === normalized &&
        (!ignoreName || record.name.toLowerCase() !== ignoreName.toLowerCase()),
    )
  }

  defaultNameForPath(folderPath: string): string {
    const trimmed = folderPath.replace(/[\\/]+$/, '')
    const sepIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
    const base = sepIndex >= 0 ? trimmed.slice(sepIndex + 1) : trimmed
    if (!base || this.hasWorkspaceName(base)) return ''
    return base
  }

  async beginOpenWorkspace(): Promise<void> {
    if (this.blocked) return
    try {
      const picked = await this.pickFolder('Open workspace folder')
      if (!picked || !this.active) return
      const normalized = picked.replace(/[\\/]+$/, '')
      const existing = this.workspaces.find(
        (record) =>
          (record.backing.kind === 'local' || record.backing.kind === 'synced') &&
          record.backing.path.replace(/[\\/]+$/, '') === normalized,
      )
      if (existing) {
        await this.switchWorkspace(existing.name)
        return
      }
      this.pendingWorkspacePath = picked
    } catch (error) {
      this.error = errorMessage(error)
    }
  }

  closeAddWorkspaceDialog() {
    this.pendingWorkspacePath = null
  }

  async pickFolder(title?: string): Promise<string | null> {
    return this.client.pickFolder(title)
  }

  async openWorkspaceFolder(path: string, name: string): Promise<void> {
    if (!(await this.prepareForWorkspaceSwitch())) return
    const seq = ++this.openRequestSeq
    this.loading = true
    this.error = null
    this.missingWorkspace = null
    try {
      const result = await this.client.openWorkspaceFolder(path, name)
      if (!this.active || seq !== this.openRequestSeq) return
      await this.refreshRegistry()
      await this.applyOpenResult(result, seq)
      this.pendingWorkspacePath = null
    } finally {
      if (this.active && seq === this.openRequestSeq) this.loading = false
    }
  }

  async switchWorkspace(name: string): Promise<void> {
    if (name === WORKSPACE_ACTION_OPEN) {
      void this.beginOpenWorkspace()
      return
    }
    if (name.toLowerCase() === this.activeWorkspaceName.toLowerCase() && !this.missingWorkspace) {
      return
    }
    if (!(await this.prepareForWorkspaceSwitch())) return

    const seq = ++this.openRequestSeq
    this.loading = true
    this.error = null
    this.missingWorkspace = null

    const cached = this.workspaceCache.get(name.toLowerCase())
    if (cached) {
      this.entries = cached.entries
      this.titles = { ...cached.titles }
      this.listed = { ...cached.listed }
      this.openTabs = [...cached.openTabs]
      this.activeTab = cached.activeTab
      this.expandedFolders = [...cached.expandedFolders]
      this.sidebarOpen = cached.sidebarOpen
    }

    try {
      const result = await this.client.switchWorkspace(name)
      if (!this.active || seq !== this.openRequestSeq) return
      await this.refreshRegistry()
      await this.applyOpenResult(result, seq)
    } catch (error) {
      if (!this.active || seq !== this.openRequestSeq) return
      if (errorCode(error) === 'missingWorkspace') {
        const target =
          this.workspaces.find((w) => w.name.toLowerCase() === name.toLowerCase()) ?? null
        this.activeWorkspaceName = target?.name ?? name
        this.missingWorkspace = target
        this.entries = []
        this.openTabs = []
        this.activeTab = null
        this.editor.clear()
      } else {
        this.error = errorMessage(error)
      }
    } finally {
      if (this.active && seq === this.openRequestSeq) this.loading = false
    }
  }

  async relocateMissingWorkspace(newPath: string): Promise<void> {
    const missing = this.missingWorkspace
    if (!missing) return
    const seq = ++this.openRequestSeq
    this.loading = true
    this.error = null
    try {
      const result = await this.client.relocateWorkspace(missing.name, newPath)
      if (!this.active || seq !== this.openRequestSeq) return
      this.missingWorkspace = null
      await this.refreshRegistry()
      await this.applyOpenResult(result, seq)
    } catch (error) {
      if (this.active && seq === this.openRequestSeq) this.error = errorMessage(error)
    } finally {
      if (this.active && seq === this.openRequestSeq) this.loading = false
    }
  }

  async removeWorkspace(name = this.activeWorkspaceName): Promise<void> {
    if (
      name.toLowerCase() === this.activeWorkspaceName.toLowerCase() &&
      !this.missingWorkspace &&
      !(await this.prepareForWorkspaceSwitch())
    ) {
      return
    }
    const seq = ++this.openRequestSeq
    this.loading = true
    this.error = null
    try {
      const snapshot = await this.client.removeWorkspace(name)
      if (!this.active || seq !== this.openRequestSeq) return
      this.workspaceCache.delete(name.toLowerCase())
      this.workspaces = snapshot.workspaces
      this.activeWorkspaceName = snapshot.activeWorkspace
      this.missingWorkspace = null
      const result = await this.client.open()
      if (!this.active || seq !== this.openRequestSeq) return
      await this.applyOpenResult(result, seq)
    } catch (error) {
      if (!this.active || seq !== this.openRequestSeq) return
      if (errorCode(error) === 'missingWorkspace' && this.activeWorkspace) {
        this.missingWorkspace = this.activeWorkspace
        this.entries = []
        this.openTabs = []
        this.activeTab = null
        this.editor.clear()
      } else {
        this.error = errorMessage(error)
      }
    } finally {
      if (this.active && seq === this.openRequestSeq) this.loading = false
    }
  }

  async renameActiveWorkspace(newName: string): Promise<void> {
    const oldName = this.activeWorkspaceName
    const renamed = await this.client.renameWorkspace(oldName, newName)
    const cached = this.workspaceCache.get(oldName.toLowerCase())
    if (cached) {
      this.workspaceCache.delete(oldName.toLowerCase())
      this.workspaceCache.set(renamed.name.toLowerCase(), cached)
    }
    this.activeWorkspaceName = renamed.name
    await this.refreshRegistry()
  }

  setSidebarOpen(next: boolean) {
    if (this.sidebarOpen === next) return
    this.sidebarOpen = next
    this.scheduleUiStatePatch({ sidebarOpen: next })
  }

  setExpandedFolders(next: string[]) {
    this.expandedFolders = next
    this.scheduleUiStatePatch({ expandedFolders: [...next] })
  }

  async loadChildren(node: TreeNode) {
    if (node.value === this.pendingEntry?.path) return []
    const items = await this.client.list(node.value)
    if (!this.active) return []
    for (const entry of items) this.listed[entry.path] = entry
    const visible = this.settings.showHiddenFiles
      ? items
      : items.filter((entry) => !entry.name.startsWith('.'))
    await this.loadTitles(visible)
    return visible.map((entry) => new WorkspaceNodeViewModel(entry).toTreeNode())
  }

  async select(path: string, options?: { newTab?: boolean }) {
    if (this.blocked) return
    const entry = this.entries.find((item) => item.path === path) ??
      this.listed[path] ?? {
        path,
        name: path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path,
        kind: 'file' as const,
      }
    if (entry.kind === 'directory') return

    const alreadyOpen = this.openTabs.includes(path)
    if (alreadyOpen && this.activeTab === path && this.editor.selected?.path === path) {
      return
    }

    if (!(await this.editor.flush())) return

    const nextTabs = [...this.openTabs]
    if (!alreadyOpen) {
      if (options?.newTab || nextTabs.length === 0 || !this.activeTab) {
        nextTabs.push(path)
      } else {
        const activeIdx = nextTabs.indexOf(this.activeTab)
        if (activeIdx >= 0) nextTabs[activeIdx] = path
        else nextTabs.push(path)
      }
    }

    const seq = ++this.openRequestSeq
    await this.editor.open(entry)
    if (!this.active || seq !== this.openRequestSeq) return
    if (this.editor.selected?.path === path) {
      this.openTabs = nextTabs
      this.activeTab = path
      this.scheduleUiStatePatch({ openTabs: nextTabs, activeTab: path })
    }
  }

  async activateTab(path: string): Promise<void> {
    if (!this.openTabs.includes(path)) return
    await this.select(path, { newTab: true })
  }

  async closeTab(path = this.activeTab): Promise<void> {
    if (!path || this.blocked) return
    const idx = this.openTabs.indexOf(path)
    if (idx < 0) return

    const closingActive = this.activeTab === path
    if (closingActive && !(await this.editor.flush())) return

    const nextTabs = this.openTabs.filter((tab) => tab !== path)
    let nextActive = this.activeTab
    if (closingActive) {
      nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)] ?? null
    }

    this.openTabs = nextTabs
    this.activeTab = nextActive
    this.scheduleUiStatePatch({ openTabs: nextTabs, activeTab: nextActive })

    if (closingActive) {
      if (nextActive) {
        const entry = this.findEntry(nextActive)
        await this.editor.open(entry)
      } else {
        this.editor.clear()
      }
    }
  }

  async cycleTab(delta: 1 | -1): Promise<void> {
    if (this.openTabs.length <= 1 || !this.activeTab) return
    const idx = this.openTabs.indexOf(this.activeTab)
    if (idx < 0) return
    const nextIdx = (idx + delta + this.openTabs.length) % this.openTabs.length
    const nextTab = this.openTabs[nextIdx]
    if (nextTab) await this.activateTab(nextTab)
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
      else {
        this.listed[created.path] = created
        this.refresh(parent)
      }
    } catch (error) {
      this.creationError = errorMessage(error)
    } finally {
      this.busy = false
    }
    if (created) {
      await this.select(created.path, { newTab: this.openTabs.length > 0 })
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

  startRename(path = this.editor.selected?.path): boolean {
    if (!path || this.blocked) return false
    this.setSidebarOpen(true)
    this.renamingPath = path
    return true
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
        else {
          this.listed[created.path] = created
          this.refresh(this.pendingParent)
        }
        this.pendingEntry = null
        if (created.kind === 'file') openNext = created
      } else {
        const renamed = await this.client.rename(path, name)
        const rewritePath = (p: string) =>
          p === path || p.startsWith(`${path}/`) ? renamed.path + p.slice(path.length) : p

        const nextTabs = this.openTabs.map(rewritePath)
        const nextActive = this.activeTab ? rewritePath(this.activeTab) : null
        const nextExpanded = this.expandedFolders.map(rewritePath)
        this.openTabs = nextTabs
        this.activeTab = nextActive
        this.expandedFolders = nextExpanded
        this.scheduleUiStatePatch({
          openTabs: nextTabs,
          activeTab: nextActive,
          expandedFolders: nextExpanded,
        })

        const selected = this.editor.selected
        if (selected && (selected.path === path || selected.path.startsWith(`${path}/`))) {
          openNext = {
            ...selected,
            path: rewritePath(selected.path),
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
      if (this.renamingPath === path) this.renamingPath = null
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
    let reopenPath: string | null = null
    try {
      if (!(await this.editor.flush())) return
      await this.client.delete(path)
      const isDeleted = (p: string) => p === path || p.startsWith(`${path}/`)
      const nextTabs = this.openTabs.filter((tab) => !isDeleted(tab))
      const activeDeleted = this.activeTab ? isDeleted(this.activeTab) : false
      const nextActive = activeDeleted ? (nextTabs[0] ?? null) : this.activeTab
      const nextExpanded = this.expandedFolders.filter((dir) => !isDeleted(dir))
      this.openTabs = nextTabs
      this.activeTab = nextActive
      this.expandedFolders = nextExpanded
      this.scheduleUiStatePatch({
        openTabs: nextTabs,
        activeTab: nextActive,
        expandedFolders: nextExpanded,
      })

      const selected = this.editor.selected
      if (selected && isDeleted(selected.path)) {
        this.editor.clear()
        reopenPath = nextActive
      }
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
    if (reopenPath) await this.editor.open(this.findEntry(reopenPath))
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
    if (this.statePatchTimer) clearTimeout(this.statePatchTimer)
    this.editor.dispose()
  }

  // Private -------------------------------------------------------------------

  private async refreshRegistry(): Promise<void> {
    try {
      const snapshot = await this.client.listWorkspaces()
      if (!this.active) return
      this.workspaces = snapshot.workspaces
      this.activeWorkspaceName = snapshot.activeWorkspace
    } catch {
      /* Older test fixtures without registry commands still work via workspace_open. */
    }
  }

  private async prepareForWorkspaceSwitch(): Promise<boolean> {
    if (this.editor.recoveryOpen) return false
    if (!(await this.editor.flush())) return false
    await this.flushUiStatePatch()
    if (!this.missingWorkspace && this.activeWorkspaceName) {
      this.workspaceCache.set(this.activeWorkspaceName.toLowerCase(), {
        entries: [...this.entries],
        titles: { ...this.titles },
        listed: { ...this.listed },
        openTabs: [...this.openTabs],
        activeTab: this.activeTab,
        expandedFolders: [...this.expandedFolders],
        sidebarOpen: this.sidebarOpen,
      })
    }
    return true
  }

  private async applyOpenResult(result: WorkspaceOpenResult, seq: number): Promise<void> {
    this.root = result.root
    if (result.workspace) {
      this.activeWorkspaceName = result.workspace.name
    }
    this.entries = result.entries
    this.listed = {}
    this.dirChildren = {}
    this.titles = {}
    this.pendingEntry = null
    this.renamingPath = null
    this.editor.clear()
    this.treeVersion++

    // Load article titles in the background so opening large vaults is non-blocking.
    void this.loadTitles(result.entries, seq)

    const uiState: WorkspaceUiState = result.uiState ?? {
      openTabs: [],
      activeTab: null,
      expandedFolders: [],
      sidebarOpen: true,
    }
    this.sidebarOpen = uiState.sidebarOpen

    // Restore expanded folders, pruning folders that no longer exist on disk.
    const validFolders: string[] = []
    for (const folder of uiState.expandedFolders) {
      try {
        const children = await this.client.list(folder)
        if (!this.active || seq !== this.openRequestSeq) return
        this.dirChildren[folder] = children
        for (const child of children) this.listed[child.path] = child
        void this.loadTitles(children, seq)
        validFolders.push(folder)
      } catch {
        /* Folder removed externally; prune from restored state. */
      }
    }
    this.expandedFolders = validFolders
    if (validFolders.length > 0) this.treeVersion++

    // Restore open tabs, pruning files that no longer exist on disk.
    const validTabs: string[] = []
    for (const tabPath of uiState.openTabs) {
      if (await this.entryExists(tabPath)) {
        validTabs.push(tabPath)
      }
    }
    if (!this.active || seq !== this.openRequestSeq) return

    const nextActive =
      uiState.activeTab && validTabs.includes(uiState.activeTab)
        ? uiState.activeTab
        : (validTabs[0] ?? null)

    this.openTabs = validTabs
    this.activeTab = nextActive

    if (
      validTabs.length !== uiState.openTabs.length ||
      validFolders.length !== uiState.expandedFolders.length ||
      nextActive !== uiState.activeTab
    ) {
      this.scheduleUiStatePatch({
        openTabs: validTabs,
        activeTab: nextActive,
        expandedFolders: validFolders,
      })
    }

    if (nextActive) {
      await this.editor.open(this.findEntry(nextActive))
    }
  }

  private async entryExists(path: string): Promise<boolean> {
    if (this.entries.some((e) => e.path === path) || this.listed[path]) return true
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    try {
      const siblings = await this.client.list(parent)
      for (const item of siblings) this.listed[item.path] = item
      return siblings.some((item) => item.path === path && item.kind === 'file')
    } catch {
      return false
    }
  }

  private findEntry(path: string): WorkspaceNode {
    return (
      this.entries.find((item) => item.path === path) ??
      this.listed[path] ?? {
        path,
        name: path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path,
        kind: 'file',
      }
    )
  }

  private scheduleUiStatePatch(patch: WorkspaceStatePatch) {
    this.pendingStatePatch = { ...this.pendingStatePatch, ...patch }
    if (this.statePatchTimer) clearTimeout(this.statePatchTimer)
    this.statePatchTimer = setTimeout(() => {
      void this.flushUiStatePatch()
    }, 100)
  }

  private async flushUiStatePatch(): Promise<void> {
    if (this.statePatchTimer) {
      clearTimeout(this.statePatchTimer)
      this.statePatchTimer = null
    }
    const patch = this.pendingStatePatch
    if (Object.keys(patch).length === 0 || !this.activeWorkspaceName) return
    this.pendingStatePatch = {}
    try {
      await this.client.patchWorkspaceUiState(this.activeWorkspaceName, patch)
    } catch {
      /* Non-fatal: UI state persistence is best-effort. */
    }
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
      if (this.listed[oldPath]) {
        this.listed[saved.path] = { ...this.listed[oldPath], path: saved.path, name: saved.name }
        delete this.listed[oldPath]
      }
      if (this.openTabs.includes(oldPath)) {
        const nextTabs = this.openTabs.map((t) => (t === oldPath ? saved.path : t))
        const nextActive = this.activeTab === oldPath ? saved.path : this.activeTab
        this.openTabs = nextTabs
        this.activeTab = nextActive
        this.scheduleUiStatePatch({ openTabs: nextTabs, activeTab: nextActive })
      }
      const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : ''
      if (parent) this.refresh(parent)
    }
  }
  private async loadTitles(items: WorkspaceNode[], seq = this.openRequestSeq) {
    const readable = items.filter(
      (entry) => entry.kind === 'file' && this.editor.supportsFile(entry.name),
    )
    const batchSize = 4
    for (let i = 0; i < readable.length; i += batchSize) {
      if (!this.active || seq !== this.openRequestSeq) return
      await Promise.all(
        readable.slice(i, i + batchSize).map(async (entry) => {
          try {
            const read = await this.client.read(entry.path)
            if (
              this.active &&
              seq === this.openRequestSeq &&
              this.editor.selected?.path !== entry.path
            )
              this.updateTitle(entry.path, this.editor.extractTitle(read.content))
          } catch {
            /* Keep unreadable entries visible under their filenames. */
          }
        }),
      )
    }
  }
}
