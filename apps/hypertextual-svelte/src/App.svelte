<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    Button,
    Editor,
    Row,
    SidebarProvider,
    SidebarTrigger,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    Select,
    SelectTrigger,
    SelectValue,
    SelectIndicator,
    SelectContent,
    SelectItem,
    SelectItemText,
  } from '@cloudvoyant/helical-svelte'
  import { DraftRecoveryDialog } from '@hypertextual/ui'
  import { FilePlus2, FolderPlus, PanelLeft, FileText, ChevronDown } from 'lucide-svelte'
  import { articleTitle, displayImages, mapImages } from './lib/article-images'
  import { listen } from '@tauri-apps/api/event'
  import { invoke, isTauri } from '@tauri-apps/api/core'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import FileTree from './components/FileTree.svelte'
  import { decodeArticle, encodeArticle, type Article } from './lib/document-codec'
  import { Autosave, type SaveState } from './lib/autosave'
  import {
    errorMessage,
    workspaceClient,
    type WorkspaceClient,
    type WorkspaceEntry,
  } from './lib/workspace'

  // A supplied client is a test seam; production always uses Tauri commands.
  let { client = workspaceClient }: { client?: WorkspaceClient } = $props()
  let root = $state('~/.hypertextual/workspace')
  let entries = $state<WorkspaceEntry[]>([])
  let workspaceLoading = $state(true)
  let workspaceError = $state<string | null>(null)
  let selected = $state<WorkspaceEntry | null>(null)
  let article = $state<Article | null>(null)
  let openedImage = $state<string | null>(null)
  let loading = $state(false)
  let openingError = $state<string | null>(null)
  let codecError = $state<string | null>(null)
  let save = $state<SaveState>({ status: 'saved', error: null })
  let busy = $state(false)
  let closing = $state(false)
  let draft = ''
  let saver: Autosave | undefined
  let requestId = 0
  let mounted = false
  let copyStatus = $state('')
  let creationError = $state<string | null>(null)
  let pendingEntry = $state<WorkspaceEntry | null>(null)
  let pendingParent = $state('')
  let refreshFolder = $state<{ path: string; version: number } | undefined>()
  let treeVersion = $state(0)
  let editorKey = $state(0)
  let editorContent = $state('')
  let editor = $state<ReturnType<typeof Editor>>()
  let recoveryOpen = $state(false)
  const imageUrls = new Map<string, string>()
  const workspaceItems = $derived([
    { label: 'Local workspace', value: root },
    { label: 'Add workspace… (coming soon)', value: '__add__', disabled: true },
  ])
  let titles = $state<Record<string, string>>({})
  const selectedTitle = $derived(
    selected ? (titles[selected.path] ?? selected.name) : 'No article selected',
  )

  async function loadTitles(items: WorkspaceEntry[]) {
    await Promise.all(
      items
        .filter((entry) => entry.kind === 'file' && /\.(md|htmd)$/i.test(entry.name))
        .map(async (entry) => {
          try {
            const read = await client.read(entry.path)
            if (!mounted || selected?.path === entry.path) return
            const decoded = decodeArticle(read.content)
            if (decoded.content) updateTitle(entry.path, decoded.content)
          } catch {
            // An unreadable article still appears under its filename.
          }
        }),
    )
  }

  const treeClient: WorkspaceClient = {
    open: () => client.open(),
    saveArticle: (...args) => client.saveArticle(...args),
    importImage: (...args) => client.importImage(...args),
    readImage: (...args) => client.readImage(...args),
    create: () => client.create(),
    createFolder: (name, parent) => client.createFolder(name, parent),
    createFile: (name, parent) => client.createFile(name, parent),
    rename: (path, name) => client.rename(path, name),
    delete: (path) => client.delete(path),
    read: (path) => client.read(path),
    write: (path, content, revision) => client.write(path, content, revision),
    async list(path) {
      const items = await client.list(path)
      await loadTitles(items)
      return items
    },
  }

  function updateTitle(path: string, content: string) {
    const title = articleTitle(content)
    if (title) titles[path] = title
    else delete titles[path]
  }

  async function openWorkspace() {
    workspaceLoading = true
    workspaceError = null
    try {
      const result = await client.open()
      if (!mounted) return
      root = result.root
      entries = result.entries
      await loadTitles(result.entries)
    } catch (error) {
      workspaceError = errorMessage(error)
    } finally {
      workspaceLoading = false
    }
  }

  async function flush(): Promise<boolean> {
    if (codecError) {
      recoveryOpen = true
      return false
    }
    return (await saver?.flush()) ?? true
  }

  async function select(entry: WorkspaceEntry) {
    if (busy || (selected?.path === entry.path && !openingError)) return
    busy = true
    // Freeze edits while draining the old document, then allow newer selections to supersede reads.
    if (!(await flush())) {
      busy = false
      return
    }
    const id = ++requestId
    saver?.dispose()
    saver = undefined
    selected = entry
    article = null
    openedImage = null
    codecError = null
    openingError = null
    copyStatus = ''
    loading = true
    busy = false
    try {
      if (entry.kind === 'unavailable')
        throw new Error('This file is unavailable or links outside the workspace.')
      if (/\.(png|jpe?g|gif|webp)$/i.test(entry.name)) {
        const image = await client.readImage('', entry.path)
        if (id === requestId && mounted) openedImage = image.url
        return
      }
      const read = await client.read(entry.path)
      if (id !== requestId || !mounted) return
      article = decodeArticle(read.content)
      draft = article.content
      imageUrls.clear()
      editorContent = article.content
        ? await displayImages(article.content, entry.path, client, imageUrls)
        : ''
      if (id !== requestId || !mounted) return
      editorKey++
      if (article.content) updateTitle(entry.path, article.content)
      else delete titles[entry.path]
      save = { status: 'saved', error: null }
      if (article.editable) {
        let currentPath = entry.path
        const title = articleTitle(article.content)
        const synchronizeFilename =
          /^untitled(?:[ -]?\d+)?\.(md|htmd)$/i.test(entry.name) &&
          Boolean(title) &&
          title !== entry.name.replace(/\.(md|htmd)$/i, '')
        let persistedTitle = synchronizeFilename ? '' : title
        saver = new Autosave(
          read.content,
          read.revision,
          async (source, revision) => {
            const title = articleTitle(decodeArticle(source).content || draft)
            const saved = await client.saveArticle(
              currentPath,
              source,
              revision,
              title === persistedTitle ? '' : title,
            )
            persistedTitle = title
            const oldPath = currentPath
            currentPath = saved.path
            if (id === requestId && selected) {
              selected = { ...selected, path: saved.path, name: saved.name }
              entries = entries.map((item) =>
                item.path === oldPath ? { ...item, path: saved.path, name: saved.name } : item,
              )
              if (title) titles[saved.path] = title
              if (oldPath !== saved.path) {
                delete titles[oldPath]
                const parent = oldPath.includes('/')
                  ? oldPath.slice(0, oldPath.lastIndexOf('/'))
                  : ''
                if (parent)
                  refreshFolder = { path: parent, version: (refreshFolder?.version ?? 0) + 1 }
              }
            }
            return saved.revision
          },
          (state) => {
            if (id === requestId) {
              save = state
              if (state.error) recoveryOpen = true
            }
          },
        )
        if (synchronizeFilename) await saver.requestSave()
      }
    } catch (error) {
      if (id === requestId) openingError = errorMessage(error)
    } finally {
      if (id === requestId) loading = false
    }
  }

  async function newArticle(parent = '') {
    if (busy || closing || loading || workspaceLoading || workspaceError) return
    busy = true
    creationError = null
    let created: WorkspaceEntry | undefined
    try {
      if (!(await flush())) return
      const siblings = await client.list(parent)
      let number = 1
      let name = 'Untitled.md'
      while (siblings.some((entry) => entry.name === name)) name = `Untitled ${++number}.md`
      created = await client.createFile(name, parent)
      if (!parent) entries = [...entries, created]
      else refreshFolder = { path: parent, version: (refreshFolder?.version ?? 0) + 1 }
    } catch (error) {
      creationError = errorMessage(error)
    } finally {
      busy = false
    }
    if (created) {
      await select(created)
      await tick()
      editor?.focus()
    }
  }

  async function uploadImage(file: File) {
    if (!selected) throw new Error('Open an article first.')
    const asset = await client.importImage(
      selected.path,
      Array.from(new Uint8Array(await file.arrayBuffer())),
    )
    imageUrls.set(asset.url, asset.source)
    return { src: asset.url }
  }

  function startCreate(kind: 'file' | 'directory', parent = '') {
    if (kind === 'file') {
      void newArticle(parent)
      return
    }
    if (busy || closing || loading || workspaceLoading || workspaceError || pendingEntry) return
    pendingParent = parent
    const base = 'New folder'
    let number = 1
    let name = base
    while (entries.some((entry) => entry.name === name)) {
      number++
      name = `${base} ${number}`
    }
    pendingEntry = { path: '__hypertextual-new__', name, kind }
  }

  async function commitEntry(path: string, name: string) {
    if (busy || closing) throw new Error('Wait for the current operation to finish.')
    busy = true
    let openNext: WorkspaceEntry | undefined
    try {
      if (!(await flush()))
        throw new Error('Save or resolve the current draft before changing files.')
      if (pendingEntry?.path === path) {
        const created =
          pendingEntry.kind === 'directory'
            ? await client.createFolder(name, pendingParent)
            : await client.createFile(name, pendingParent)
        if (!pendingParent)
          entries = [...entries, created].sort(
            (a, b) =>
              Number(a.kind !== 'directory') - Number(b.kind !== 'directory') ||
              a.name.localeCompare(b.name),
          )
        if (pendingParent)
          refreshFolder = { path: pendingParent, version: (refreshFolder?.version ?? 0) + 1 }
        pendingEntry = null
        if (created.kind === 'file') openNext = created
      } else {
        const renamed = await client.rename(path, name)
        if (selected && (selected.path === path || selected.path.startsWith(`${path}/`))) {
          openNext = {
            ...selected,
            path: renamed.path + selected.path.slice(path.length),
            name: selected.path === path ? renamed.name : selected.name,
          }
          saver?.dispose()
          saver = undefined
          selected = null
        }
        entries = entries.map((entry) => (entry.path === path ? renamed : entry))
        try {
          entries = await client.list('')
          await loadTitles(entries)
        } catch (error) {
          creationError = errorMessage(error)
        }
        treeVersion++
      }
    } finally {
      busy = false
    }
    if (openNext) await select(openNext)
  }

  async function contextAction(path: string, action: string) {
    if (action === 'new-file' || action === 'new-folder') {
      startCreate(action === 'new-file' ? 'file' : 'directory', path)
      return
    }
    if (action !== 'delete' || busy || closing) return
    busy = true
    creationError = null
    try {
      if (!(await flush())) return
      await client.delete(path)
      if (selected && (selected.path === path || selected.path.startsWith(`${path}/`))) {
        saver?.dispose()
        saver = undefined
        selected = null
        article = null
        openedImage = null
      }
      entries = entries.filter((entry) => entry.path !== path)
      try {
        entries = await client.list('')
      } catch (error) {
        creationError = errorMessage(error)
      }
      treeVersion++
    } catch (error) {
      creationError = errorMessage(error)
    } finally {
      busy = false
    }
  }

  function edit(content: string) {
    content = mapImages(content, (src) => imageUrls.get(src) ?? src)
    draft = content
    copyStatus = ''
    if (!article?.editable || busy || closing) return
    if (selected) updateTitle(selected.path, content)
    try {
      const source = encodeArticle(article, content)
      codecError = null
      saver?.update(source)
    } catch (error) {
      const message = errorMessage(error)
      if (codecError !== message) recoveryOpen = true
      codecError = message
    }
  }

  async function copyDraft() {
    if (!article) return
    try {
      let source: string
      try {
        source = encodeArticle(article, draft)
      } catch {
        source = draft
      }
      await navigator.clipboard.writeText(source)
      copyStatus = 'Draft copied'
    } catch (error) {
      copyStatus = errorMessage(error)
    }
  }

  async function reloadFile() {
    if (!selected) return
    recoveryOpen = false
    const entry = selected
    busy = true
    await saver?.discard()
    saver = undefined
    codecError = null
    selected = null
    busy = false
    await select(entry)
  }

  onMount(() => {
    mounted = true
    void openWorkspace()
    const unlisteners: (() => void)[] = []
    async function close(quit: boolean) {
      if (closing) return
      closing = true
      if (await flush()) {
        try {
          if (quit) await invoke('workspace_finish_quit')
          else await getCurrentWindow().destroy()
        } catch (error) {
          openingError = errorMessage(error)
          closing = false
        }
      } else closing = false
    }
    if (isTauri()) {
      void Promise.all([
        getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault()
          void close(false)
        }),
        listen('workspace-quit-requested', () => {
          void close(true)
        }),
      ])
        .then(async (stops) => {
          if (!mounted) {
            stops.forEach((stop) => stop())
            return
          }
          unlisteners.push(...stops)
          await invoke('workspace_frontend_ready')
        })
        .catch((error) => {
          openingError = errorMessage(error)
        })
    }
    return () => {
      mounted = false
      ++requestId
      saver?.dispose()
      unlisteners.forEach((stop) => stop())
    }
  })

  function beforeUnload(event: BeforeUnloadEvent) {
    if (saver?.dirty || codecError) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
</script>

<svelte:head><title>Hypertextual</title></svelte:head>
<svelte:window onbeforeunload={beforeUnload} />

<SidebarProvider class="workspace-shell" style="--sidebar-width: 236px">
  <header class="titlebar" data-tauri-drag-region>
    <SidebarTrigger title="Toggle sidebar" aria-controls="workspace-sidebar">
      <PanelLeft size={14} strokeWidth={1.5} />
    </SidebarTrigger>
    <span class="brand" data-tauri-drag-region>hypertextual</span>
    <div class="workspace-chooser">
      <Select items={workspaceItems} value={[root]} size="sm">
        <SelectTrigger aria-label="Workspace selector" title={root} size="sm"
          ><SelectValue /><SelectIndicator
            ><ChevronDown size={12} strokeWidth={1.5} /></SelectIndicator
          ></SelectTrigger
        >
        <SelectContent
          >{#each workspaceItems as item}<SelectItem {item}
              ><SelectItemText>{item.label}</SelectItemText></SelectItem
            >{/each}</SelectContent
        >
      </Select>
    </div>
  </header>
  <Row class="workspace-body">
    <Sidebar
      id="workspace-sidebar"
      collapsible="offcanvas"
      class="workspace-sidebar"
      aria-label="Workspace"
    >
      <SidebarHeader class="sidebar-heading">
        <Row class="workspace-heading-row">
          <span>Workspace</span>
          <Row class="workspace-actions">
            <Button
              variant="text"
              size="sm"
              class="new-article"
              aria-label="New article"
              title="New article"
              disabled={busy ||
                closing ||
                loading ||
                workspaceLoading ||
                Boolean(workspaceError) ||
                Boolean(pendingEntry)}
              onclick={() => startCreate('file')}
            >
              <FilePlus2 size={14} strokeWidth={1.5} />
            </Button>
            <Button
              variant="text"
              size="sm"
              class="new-article"
              aria-label="New folder"
              title="New folder"
              disabled={busy ||
                closing ||
                workspaceLoading ||
                Boolean(workspaceError) ||
                Boolean(pendingEntry)}
              onclick={() => startCreate('directory')}
            >
              <FolderPlus size={14} strokeWidth={1.5} />
            </Button>
          </Row>
        </Row>
      </SidebarHeader>
      <SidebarContent>
        {#if creationError}<p class="sidebar-message error" role="alert">{creationError}</p>{/if}
        {#if workspaceLoading}
          <p class="sidebar-message" role="status">Opening workspace…</p>
        {:else if workspaceError}
          <p class="sidebar-message error" role="alert">{workspaceError}</p>
          {#if isTauri()}<Button variant="text" size="sm" onclick={openWorkspace}>Retry</Button
            >{/if}
        {:else if !entries.length && !pendingEntry}
          <p class="sidebar-message">
            Your workspace is empty. Create your first article with New article.
          </p>
        {:else}
          {#key treeVersion}
            <FileTree
              {pendingEntry}
              {pendingParent}
              {refreshFolder}
              onaction={contextAction}
              oncommit={commitEntry}
              oncancel={() => {
                pendingEntry = null
              }}
              {entries}
              client={treeClient}
              {titles}
              selected={selected?.path ?? null}
              onselect={select}
            />
          {/key}
        {/if}
      </SidebarContent>
    </Sidebar>
    <main class="document-pane" aria-label="Article">
      {#if selected}
        <div class="document-heading">
          <span class="document-path" title={selected.path}>{selectedTitle}</span>
          <span class="format-label">{selected.name.split('.').at(-1)?.toUpperCase()}</span>
        </div>
      {/if}
      {#if loading}
        <div class="empty-pane" role="status">Opening article…</div>
      {:else if openingError}
        <div class="empty-pane">
          <p class="error" role="alert">{openingError}</p>
          {#if selected}<Button
              variant="outline"
              size="sm"
              onclick={() => selected && select(selected)}>Retry opening</Button
            >{/if}
        </div>
      {:else if openedImage && selected}
        <div class="image-preview"><img src={openedImage} alt={selected.name} /></div>
      {:else if article && selected}
        <div class="article-scroll">
          {#if article.editable}
            <div class="article-editor">
              {#key editorKey}
                <Editor
                  bind:this={editor}
                  content={editorContent}
                  onUpload={uploadImage}
                  enforceTitle={false}
                  editable={!busy && !closing}
                  onchange={({ content }) => edit(content)}
                />
              {/key}
            </div>
          {:else}
            <div class="source-preview">
              <p class="readonly-notice">{article.reason}</p>
              <pre aria-label="Original article source">{article.source}</pre>
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty-pane">
          <FileText size={32} strokeWidth={1.5} />
          <h1>Your workspace, ready to write.</h1>
          <p>Select an article from the sidebar, or create a new one.</p>
        </div>
      {/if}
      <footer class="document-status" role="status" aria-live="polite">
        <span title={selected?.path}>{selectedTitle}</span>
        <span class:error={Boolean(codecError || save.error)}>
          {article?.editable
            ? codecError || save.error
              ? 'Unsaved changes'
              : save.status === 'saved'
                ? 'Saved'
                : save.status === 'saving'
                  ? 'Saving…'
                  : 'Changes pending…'
            : openedImage
              ? 'Image'
              : article
                ? 'Read-only'
                : 'Local files'}
        </span>
      </footer>
    </main>
  </Row>
</SidebarProvider>

<DraftRecoveryDialog
  open={recoveryOpen && Boolean(codecError || save.error)}
  message={codecError ?? save.error ?? ''}
  {copyStatus}
  busy={busy || closing}
  onclose={() => {
    recoveryOpen = false
  }}
  oncopy={copyDraft}
  ondiscard={reloadFile}
  onretry={codecError
    ? undefined
    : () => {
        void flush().then((saved) => {
          if (saved) recoveryOpen = false
        })
      }}
/>
