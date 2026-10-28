import { test as base, expect, type Page } from '@playwright/test'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, rename, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

export { expect }
export interface Workspace {
  root: string
  failWrites: boolean
  failImageUploads: boolean
  failLists: boolean
  slowReads: boolean
  destroyed: boolean
  quit: boolean
  writes: string[]
  emit: (event: string) => Promise<void>
}

interface CommandArgs {
  name?: string
  parentPath?: string
  relativePath?: string
  articlePath?: string
  bytes?: number[]
  source?: string
  content?: string
  title?: string
  expectedRevision?: string
}

export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4V8AAAAASUVORK5CYII=',
  'base64',
)
const revision = (content: string) => createHash('sha256').update(content).digest('hex')
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
      const root = await mkdtemp(join(tmpdir(), 'hypertextual-ui-'))
      function location(...parts: string[]) {
        const target = resolve(root, ...parts)
        if (target !== root && !target.startsWith(root + sep))
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
        const workspace: Workspace = {
          root,
          failLists: false,
          failWrites: false,
          failImageUploads: false,
          slowReads: false,
          destroyed: false,
          quit: false,
          writes: [],
          emit: (event) => emit(page, event),
        }

        async function list(path: string) {
          const entries = await readdir(location(path), { withFileTypes: true })
          return entries
            .filter((entry) => entry.name !== '.images')
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

        await page.exposeFunction(
          'workspaceTestInvoke',
          async (command: string, args: CommandArgs) => {
            if (command === 'workspace_open') return { root, entries: await list('') }
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
            if (command === 'workspace_import_image') {
              if (workspace.failImageUploads)
                throw new Error('Image storage unavailable. Retry the upload.')
              const bytes = Buffer.from(args.bytes!)
              const parent = args.articlePath!.includes('/')
                ? args.articlePath!.slice(0, args.articlePath!.lastIndexOf('/'))
                : ''
              const source = `.images/${revision(bytes.toString('base64'))}.png`
              await mkdir(location(parent, '.images'), { recursive: true })
              await writeFile(location(parent, source), bytes)
              return { source, url: `data:image/png;base64,${bytes.toString('base64')}` }
            }
            if (command === 'workspace_read_image') {
              const parent = args.articlePath?.includes('/')
                ? args.articlePath.slice(0, args.articlePath.lastIndexOf('/'))
                : ''
              const bytes = await readFile(location(parent, args.source!))
              return {
                source: args.source!,
                url: `data:image/png;base64,${bytes.toString('base64')}`,
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
            await rm(root, { recursive: true, force: true })
          }
        }
      }
    },
    { auto: true },
  ],
})

export async function edit(page: Page, text: string) {
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
  await page.locator('.ProseMirror').click()
  // Let Helical finish scheduled autofocus before positioning the caret for typing.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

export async function createArticle(page: Page) {
  const selected = page.locator('[role="treeitem"][aria-selected="true"]')
  const previous = (await selected.count()) ? await selected.getAttribute('data-value') : null
  await page.getByRole('button', { name: 'New article', exact: true }).click()
  await expect.poll(() => selected.getAttribute('data-value')).not.toBe(previous)
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
}
