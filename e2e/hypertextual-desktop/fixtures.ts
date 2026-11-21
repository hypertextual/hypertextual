import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

export { expect }
export interface Workspace {
  root: string
  homeDir: string
  nextPickedFolder: string | null
  failWrites: boolean
  failImageUploads: boolean
  failLists: boolean
  slowReads: boolean
  destroyed: boolean
  quit: boolean
  writes: string[]
  openedExternal: string[]
  emit: (event: string) => Promise<void>
}

interface CommandArgs {
  name?: string
  newName?: string
  path?: string
  patch?: {
    openTabs?: string[]
    activeTab?: string | null
    expandedFolders?: string[]
    sidebarOpen?: boolean
  }
  parentPath?: string
  relativePath?: string
  articlePath?: string
  bytes?: number[]
  filename?: string
  source?: string
  content?: string
  title?: string
  expectedRevision?: string
}

interface TestWorkspaceRecord {
  name: string
  backing: { kind: 'local'; path: string }
  lastOpenedAt: number
  available: boolean
}

interface TestWorkspaceUiState {
  openTabs: string[]
  activeTab: string | null
  expandedFolders: string[]
  sidebarOpen: boolean
}

export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V8AAAAASUVORK5CYII=',
  'base64',
)
const revision = (content: string) => createHash('sha256').update(content).digest('hex')
/** Resolves after `ms` milliseconds. */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function emit(page: Page, event: string) {
  await page.evaluate(async (name) => {
    await (
      window as unknown as { workspaceTestEmit: (event: string) => Promise<void> }
    ).workspaceTestEmit(name)
  }, event)
}

// Fixtures --------------------------------------------------------------------
// The browser runs the production UI. Only the native IPC transport is substituted;
// workspace contents and persistence assertions use a real, test-owned directory.
export const test = base.extend<{ workspace: Workspace; initialWorkspace: 'empty' | 'existing' }>({
  initialWorkspace: ['existing', { option: true }],
  workspace: [
    async ({ page, initialWorkspace }, use, testInfo) => {
      const homeDir = await mkdtemp(join(tmpdir(), 'hypertextual-home-'))
      const defaultRoot = join(homeDir, '.hypertextual', 'workspace')
      await mkdir(defaultRoot, { recursive: true })
      let activeRoot = defaultRoot
      let activeWorkspaceName = 'Local workspace'
      const records: TestWorkspaceRecord[] = [
        {
          name: 'Local workspace',
          backing: { kind: 'local', path: defaultRoot },
          lastOpenedAt: Date.now(),
          available: true,
        },
      ]
      const uiStates = new Map<string, TestWorkspaceUiState>()
      function getUiState(wsName: string): TestWorkspaceUiState {
        return (
          uiStates.get(wsName.toLowerCase()) ?? {
            openTabs: [],
            activeTab: null,
            expandedFolders: [],
            sidebarOpen: true,
          }
        )
      }
      async function persistRegistry() {
        await mkdir(join(homeDir, '.hypertextual'), { recursive: true })
        await writeFile(
          join(homeDir, '.hypertextual', 'workspaces.json'),
          JSON.stringify(
            { schemaVersion: 1, activeWorkspace: activeWorkspaceName, workspaces: records },
            null,
            2,
          ),
        )
      }
      async function persistUiState(wsName: string, state: TestWorkspaceUiState) {
        uiStates.set(wsName.toLowerCase(), state)
        const dir = join(homeDir, '.hypertextual', 'workspaces', wsName)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2))
      }
      async function isDir(p: string): Promise<boolean> {
        return stat(p).then(
          (s) => s.isDirectory(),
          () => false,
        )
      }
      function location(...parts: string[]) {
        const target = resolve(activeRoot, ...parts)
        if (target !== activeRoot && !target.startsWith(activeRoot + sep))
          throw new Error('Test path leaves its workspace')
        return target
      }
      try {
        if (initialWorkspace === 'existing') {
          await mkdir(location('Drafts'))
          await mkdir(location('Empty'))
          await writeFile(location('Drafts/one.md'), '# One\n\nFirst article.\n')
          await writeFile(location('Drafts/two.htmd'), '# Two\n\nSecond article.\n')
          await writeFile(location('same.md'), '# Markdown\n')
          await writeFile(location('same.htmd'), '# HTMD\n')
          await writeFile(location('image.png'), png)
          await writeFile(
            location('titled-link.md'),
            '[Link](https://example.com "Preserve this title")',
          )
          await writeFile(location('rich.htmd'), ':::chart\n{"series":[1,2]}\n:::')
        }
        await persistRegistry()
        const workspace: Workspace = {
          root: defaultRoot,
          homeDir,
          nextPickedFolder: null,
          failLists: false,
          failWrites: false,
          failImageUploads: false,
          slowReads: false,
          destroyed: false,
          quit: false,
          writes: [],
          openedExternal: [],
          emit: (event) => emit(page, event),
        }

        async function list(path: string) {
          const entries = await readdir(location(path), { withFileTypes: true })
          return entries
            .filter(
              (entry) =>
                !entry.name.startsWith('.hypertextual-save-') &&
                !entry.name.startsWith('.hyped-fs-save-') &&
                entry.name !== '.git' &&
                entry.name !== '.DS_Store',
            )
            .map((entry) => ({
              name: entry.name,
              path: path ? `${path}/${entry.name}` : entry.name,
              kind: entry.isDirectory() ? 'directory' : 'file',
            }))
            .sort(
              (a, b) =>
                Number(a.kind !== 'directory') - Number(b.kind !== 'directory') ||
                a.name.localeCompare(b.name),
            )
        }

        function detectAssetType(bytes: Buffer): { mime: string; ext: string } {
          if (
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          ) {
            const text = bytes.toString('latin1')
            if (text.includes('mxfile') || text.includes('mxGraphModel')) {
              return { mime: 'image/png', ext: 'drawio.png' }
            }
            return { mime: 'image/png', ext: 'png' }
          }
          const utf8 = bytes
            .toString('utf8')
            .replace(/^\uFEFF/, '')
            .trimStart()
          if (utf8.startsWith('<svg') || (utf8.startsWith('<?xml') && utf8.includes('<svg'))) {
            if (
              utf8.includes('content=') &&
              (utf8.includes('mxfile') ||
                utf8.includes('mxGraphModel') ||
                utf8.includes('%3Cmxfile'))
            ) {
              return { mime: 'image/svg+xml', ext: 'drawio.svg' }
            }
            return { mime: 'image/svg+xml', ext: 'svg' }
          }
          if (
            utf8.startsWith('<mxfile') ||
            (utf8.startsWith('<?xml') && utf8.includes('<mxfile'))
          ) {
            return { mime: 'application/vnd.jgraph.mxfile', ext: 'drawio' }
          }
          return { mime: 'image/png', ext: 'png' }
        }

        async function openRecord(record: TestWorkspaceRecord) {
          if (!(await isDir(record.backing.path))) {
            record.available = false
            throw Object.assign(
              new Error('[missingWorkspace] Workspace folder could not be found on disk.'),
              { code: 'missingWorkspace' },
            )
          }
          record.available = true
          record.lastOpenedAt = Date.now()
          activeRoot = record.backing.path
          activeWorkspaceName = record.name
          workspace.root = activeRoot
          await persistRegistry()
          return {
            workspace: { ...record },
            root: activeRoot,
            entries: await list(''),
            uiState: getUiState(record.name),
          }
        }

        await page.exposeFunction(
          'workspaceTestInvoke',
          async (command: string, args: CommandArgs) => {
            if (command === 'workspace_list_all') {
              for (const rec of records) rec.available = await isDir(rec.backing.path)
              return {
                activeWorkspace: activeWorkspaceName,
                workspaces: records.map((r) => ({ ...r })),
              }
            }
            if (command === 'workspace_pick_folder') {
              return workspace.nextPickedFolder
            }
            if (command === 'workspace_open') {
              const rec =
                records.find((r) => r.name.toLowerCase() === activeWorkspaceName.toLowerCase()) ??
                records[0]
              if (!rec) throw new Error('No workspace registered.')
              return openRecord(rec)
            }
            if (command === 'workspace_open_folder' || command === 'workspace_create_workspace') {
              const targetPath = resolve(args.path!)
              if (command === 'workspace_create_workspace') {
                await mkdir(targetPath, { recursive: true })
              } else if (!(await isDir(targetPath))) {
                throw Object.assign(new Error('Selected workspace folder does not exist.'), {
                  code: 'missingWorkspace',
                })
              }
              const existingByPath = records.find((r) => resolve(r.backing.path) === targetPath)
              if (existingByPath) return openRecord(existingByPath)
              const cleanName = (args.name ?? '').trim()
              if (!cleanName || /[\\/:]/.test(cleanName)) {
                throw Object.assign(new Error('Enter a valid workspace name.'), {
                  code: 'invalidName',
                })
              }
              if (records.some((r) => r.name.toLowerCase() === cleanName.toLowerCase())) {
                throw Object.assign(new Error('A workspace with this name already exists.'), {
                  code: 'nameUnavailable',
                })
              }
              const created: TestWorkspaceRecord = {
                name: cleanName,
                backing: { kind: 'local', path: targetPath },
                lastOpenedAt: Date.now(),
                available: true,
              }
              records.push(created)
              return openRecord(created)
            }
            if (command === 'workspace_switch') {
              const rec = records.find(
                (r) => r.name.toLowerCase() === (args.name ?? '').trim().toLowerCase(),
              )
              if (!rec) {
                throw Object.assign(new Error('Workspace was not found.'), {
                  code: 'workspaceNotFound',
                })
              }
              return openRecord(rec)
            }
            if (command === 'workspace_rename_workspace') {
              const rec = records.find(
                (r) => r.name.toLowerCase() === (args.name ?? '').trim().toLowerCase(),
              )
              if (!rec) throw new Error('Workspace was not found.')
              const nextName = (args.newName ?? '').trim()
              if (
                !nextName ||
                records.some((r) => r !== rec && r.name.toLowerCase() === nextName.toLowerCase())
              ) {
                throw new Error('A workspace with this name already exists.')
              }
              const prevState = uiStates.get(rec.name.toLowerCase())
              if (prevState) {
                uiStates.delete(rec.name.toLowerCase())
                await persistUiState(nextName, prevState)
              }
              if (activeWorkspaceName.toLowerCase() === rec.name.toLowerCase()) {
                activeWorkspaceName = nextName
              }
              rec.name = nextName
              await persistRegistry()
              return { ...rec }
            }
            if (command === 'workspace_relocate') {
              const rec = records.find(
                (r) => r.name.toLowerCase() === (args.name ?? '').trim().toLowerCase(),
              )
              if (!rec) throw new Error('Workspace was not found.')
              rec.backing = { kind: 'local', path: resolve(args.path!) }
              return openRecord(rec)
            }
            if (command === 'workspace_remove') {
              const idx = records.findIndex(
                (r) => r.name.toLowerCase() === (args.name ?? '').trim().toLowerCase(),
              )
              if (idx >= 0) {
                const [removed] = records.splice(idx, 1)
                if (removed) {
                  uiStates.delete(removed.name.toLowerCase())
                  if (records.length === 0) {
                    await mkdir(defaultRoot, { recursive: true })
                    records.push({
                      name: 'Local workspace',
                      backing: { kind: 'local', path: defaultRoot },
                      lastOpenedAt: Date.now(),
                      available: true,
                    })
                    activeWorkspaceName = 'Local workspace'
                    activeRoot = defaultRoot
                  } else if (activeWorkspaceName.toLowerCase() === removed.name.toLowerCase()) {
                    const nextRec = records[0]!
                    activeWorkspaceName = nextRec.name
                    activeRoot = nextRec.backing.path
                  }
                  await persistRegistry()
                }
              }
              return {
                activeWorkspace: activeWorkspaceName,
                workspaces: records.map((r) => ({ ...r })),
              }
            }
            if (command === 'workspace_patch_ui_state') {
              const targetName = (args.name ?? activeWorkspaceName).trim()
              const current = getUiState(targetName)
              const patch = args.patch ?? {}
              const merged: TestWorkspaceUiState = {
                openTabs: patch.openTabs !== undefined ? patch.openTabs : current.openTabs,
                activeTab: patch.activeTab !== undefined ? patch.activeTab : current.activeTab,
                expandedFolders:
                  patch.expandedFolders !== undefined
                    ? patch.expandedFolders
                    : current.expandedFolders,
                sidebarOpen:
                  patch.sidebarOpen !== undefined ? patch.sidebarOpen : current.sidebarOpen,
              }
              await persistUiState(targetName, merged)
              return merged
            }
            if (command === 'workspace_list') {
              if (workspace.failLists) throw new Error('Folder unavailable')
              return list(args.relativePath!)
            }
            if (command === 'workspace_create_folder' || command === 'workspace_create_file') {
              if (workspace.failWrites)
                throw new Error('Cannot create an article or folder. Disk unavailable.')
              let name = args.name!.trim()
              if (!name || /[\\/:]/.test(name) || name === '.' || name === '..')
                throw new Error('Invalid name')
              const parent = args.parentPath ?? ''
              const kind = command === 'workspace_create_folder' ? 'directory' : 'file'
              if (kind === 'file' && !name.includes('.')) name += '.md'
              const path = parent ? `${parent}/${name}` : name
              try {
                if (kind === 'directory') await mkdir(location(path))
                else
                  await writeFile(location(path), `# ${name.replace(/\.(md|htmd)$/, '')}\n\n`, {
                    flag: 'wx',
                  })
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                  throw new Error('A file or folder with this name already exists.', {
                    cause: error,
                  })
                throw error
              }
              return { path, name, kind }
            }
            if (command === 'workspace_rename') {
              if (workspace.failWrites) throw new Error('Disk unavailable')
              const before = args.relativePath!
              const parent = before.includes('/') ? before.slice(0, before.lastIndexOf('/')) : ''
              const path = parent ? `${parent}/${args.name}` : args.name!
              if (before !== path) {
                const exists = await stat(location(path)).then(
                  () => true,
                  () => false,
                )
                if (exists) throw new Error('A file or folder with this name already exists.')
                await rename(location(before), location(path))
              }
              return {
                path,
                name: args.name!,
                kind: (await stat(location(path))).isDirectory() ? 'directory' : 'file',
              }
            }
            if (command === 'workspace_delete') {
              if (workspace.failWrites) throw new Error('Disk unavailable')
              await rm(location(args.relativePath!), { recursive: true })
              return null
            }
            if (command === 'workspace_open_default_app') {
              await stat(location(args.relativePath!))
              workspace.openedExternal.push(args.relativePath!)
              return null
            }
            if (command === 'workspace_create') {
              if (workspace.failWrites)
                throw new Error('Cannot create an article. Disk unavailable.')
              for (let number = 1; number <= 100; number++) {
                const title = number === 1 ? 'Untitled' : `Untitled ${number}`
                const name = `${title}.md`
                try {
                  await writeFile(location(name), `# ${title}\n\n`, { flag: 'wx' })
                  return { path: name, name, kind: 'file' }
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
                }
              }
              throw new Error('No available name')
            }
            if (command === 'workspace_import_file_asset' || command === 'workspace_import_image') {
              if (workspace.failImageUploads)
                throw new Error('Image storage unavailable. Retry the upload.')
              const bytes = Buffer.from(args.bytes!)
              const { mime, ext } = detectAssetType(bytes)
              const parent = args.articlePath!.includes('/')
                ? args.articlePath!.slice(0, args.articlePath!.lastIndexOf('/'))
                : ''
              const rawBase = (args.filename ?? '').split(/[/\\]/).pop()?.trim() ?? ''
              const stripped = rawBase
                .replace(/\.(drawio\.(svg|png)|drawio|png|jpe?g|gif|webp|svg)$/i, '')
                .replace(/[<>:"/\\|?*]+/g, '-')
                .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
              const stem = stripped || `asset-${revision(bytes.toString('base64')).slice(0, 8)}`
              await mkdir(location(parent, '.media'), { recursive: true })
              let source = `.media/${stem}.${ext}`
              for (let counter = 1; counter <= 1000; counter++) {
                const candidate =
                  counter === 1 ? `.media/${stem}.${ext}` : `.media/${stem}-${counter}.${ext}`
                const target = location(parent, candidate)
                const existing = await readFile(target).catch(() => null)
                if (!existing) {
                  await writeFile(target, bytes)
                  source = candidate
                  break
                }
                if (existing.equals(bytes)) {
                  source = candidate
                  break
                }
              }
              return { source, url: `data:${mime};base64,${bytes.toString('base64')}` }
            }
            if (command === 'workspace_read_file_asset' || command === 'workspace_read_image') {
              const parent = args.articlePath?.includes('/')
                ? args.articlePath.slice(0, args.articlePath.lastIndexOf('/'))
                : ''
              const bytes = await readFile(location(parent, args.source!))
              const { mime } = detectAssetType(bytes)
              return {
                source: args.source!,
                url: `data:${mime};base64,${bytes.toString('base64')}`,
              }
            }
            if (command === 'workspace_read') {
              if (workspace.slowReads && args.relativePath === 'same.md') await delay(400)
              if (!/\.(md|htmd)$/.test(args.relativePath!))
                throw new Error('Only .md and .htmd articles can be edited.')
              const content = await readFile(location(args.relativePath!), 'utf8')
              return { content, revision: revision(content) }
            }
            if (command === 'workspace_write' || command === 'workspace_save_article') {
              await delay(30)
              if (workspace.failWrites) throw new Error('Disk unavailable. Your draft is retained.')
              const previous = await readFile(location(args.relativePath!), 'utf8')
              if (revision(previous) !== args.expectedRevision)
                throw new Error('File changed outside Hypertextual. Your draft is retained.')
              await writeFile(location(args.relativePath!), args.content!)
              workspace.writes.push(args.relativePath!)
              if (command === 'workspace_save_article') {
                let path = args.relativePath!
                let name = path.split('/').at(-1)!
                if (args.title) {
                  const stem = args.title
                    .replace(/[\\/:*?"<>|]/g, '-')
                    .trim()
                    .replace(/^\.+|\.+$/g, '')
                    .trim()
                  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
                  const ext = name.split('.').at(-1)!
                  for (let n = 1; stem && n <= 100; n++) {
                    const candidate = `${stem}${n === 1 ? '' : ` ${n}`}.${ext}`
                    const target = parent ? `${parent}/${candidate}` : candidate
                    if (target === path) break
                    if (
                      await stat(location(target)).then(
                        () => true,
                        () => false,
                      )
                    )
                      continue
                    await rename(location(path), location(target))
                    path = target
                    name = candidate
                    break
                  }
                }
                return { path, name, revision: revision(args.content!) }
              }
              return revision(args.content!)
            }
            if (command === 'workspace_frontend_ready') return null
            if (command === 'plugin:window|destroy') {
              workspace.destroyed = true
              return null
            }
            if (command === 'workspace_finish_quit') {
              workspace.quit = true
              return null
            }
            throw new Error(`Unexpected command: ${command}`)
          },
        )
        await page.goto('/e2e/hypertextual-desktop/fixture.html')
        await expect(page.getByRole('button', { name: 'New article', exact: true })).toBeEnabled()
        await expect(page.getByText('No article selected')).toBeVisible()
        await use(workspace)
      } finally {
        try {
          if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
            await testInfo.attach('failure', {
              body: await page.screenshot({ timeout: 2000 }),
              contentType: 'image/png',
            })
          }
        } finally {
          try {
            await page.close()
          } finally {
            await rm(homeDir, { recursive: true, force: true, maxRetries: 3 })
          }
        }
      }
    },
    { auto: true },
  ],
})

/** Focuses the `.ProseMirror` editor in insert mode, moves to the end of the document, and types `text`. */
export async function edit(page: Page, text: string) {
  await page.locator('.ProseMirror').click()
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
  // Let Helical finish scheduled autofocus before positioning the caret for typing.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await expect(page.locator('.ProseMirror')).toBeFocused()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type(text)
}

/** Creates a new article via the sidebar toolbar and focuses `.ProseMirror` in insert mode. */
export async function createArticle(page: Page) {
  const selected = page.locator('[role="treeitem"][aria-selected="true"]')
  const previous = (await selected.count()) ? await selected.getAttribute('data-value') : null
  await page.getByRole('button', { name: 'New article', exact: true }).click()
  await expect.poll(() => selected.getAttribute('data-value')).not.toBe(previous)
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
  await page.locator('.ProseMirror').click()
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
}

/**
 * Captures a PNG screenshot into the test output directory and attaches it to the Playwright report
 * when `E2E_SCREENSHOTS=1` or `HYPERTEXTUAL_E2E_SCREENSHOTS=1` is set.
 */
export async function captureScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (process.env.E2E_SCREENSHOTS !== '1' && process.env.HYPERTEXTUAL_E2E_SCREENSHOTS !== '1') {
    return
  }
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
