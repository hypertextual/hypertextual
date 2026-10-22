import type { Page } from '@playwright/test'
import { test, expect, edit, createArticle } from './fixtures'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Tests -----------------------------------------------------------------------
test.describe('When opening an existing workspace', { tag: ['@desktop', '@file-tree'] }, () => {
  test('User starts unselected with collapsed folders and accessible keyboard navigation', async ({
    page,
    workspace,
  }) => {
    // Arrange: the fixture opens a seeded workspace.
    // Assert
    await expect(page.getByText('No article selected')).toBeVisible()
    await expect(page.locator('[role="treeitem"][data-value$="one.md"]')).toHaveCount(0)
    const drafts = page.getByRole('treeitem', { name: 'Drafts', exact: true })
    const draftsControl = drafts.getByRole('button', { name: 'Drafts', exact: true })
    await draftsControl.focus()
    await page.keyboard.press('ArrowRight')
    await expect(drafts).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[role="treeitem"][data-value$="one.md"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('.ProseMirror h1')).toHaveText('One')
    await page.screenshot({ path: test.info().outputPath('workspace.png') })
    await page.locator('[role="treeitem"][data-value$="same.md"]').click()
    await expect(page.locator('.ProseMirror h1')).toHaveText('Markdown')
    await page.locator('[role="treeitem"][data-value$="same.htmd"]').click()
    await expect(page.locator('.ProseMirror h1')).toHaveText('HTMD')
    expect(await draftsControl.evaluate((el) => el.getBoundingClientRect().height)).toBe(24)
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^save$/i })).toHaveCount(0)
    expect(workspace.writes).toEqual([])
  })

  test('User can retry creation without losing the selected article', async ({
    page,
    workspace,
  }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Act
    await page.locator('[role="treeitem"][data-value$="same.md"]').click()
    // Assert
    await expect(page.locator('.ProseMirror h1')).toHaveText('Markdown')
    workspace.failWrites = true
    await createArticle(page)
    await expect(page.getByRole('alert')).toContainText('Cannot create an article')
    await expect(page.locator('.ProseMirror h1')).toHaveText('Markdown')
    workspace.failWrites = false
    await createArticle(page)
    await expect(page.locator('.ProseMirror h1')).toHaveText('Untitled')
  })

  test('User creates and renames inline, cancels new items, and retains names after errors', async ({
    page,
    workspace,
  }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Act
    await page.getByRole('button', { name: 'New folder', exact: true }).click()
    const name = page.getByRole('textbox', { name: 'Name', exact: true })
    // Assert
    await expect(name).toBeFocused()
    await name.fill('Research')
    await name.press('Enter')
    const research = page.getByRole('treeitem', { name: 'Research', exact: true })
    await expect(research).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'New folder', exact: true }).click()
    await name.fill('Research')
    await name.press('Enter')
    await expect(page.getByRole('alert')).toContainText('already exists')
    await expect(name).toHaveValue('Research')
    await name.fill('More research')
    workspace.failWrites = true
    await name.press('Enter')
    await expect(page.getByRole('alert')).toContainText('Disk unavailable')
    workspace.failWrites = false
    await name.press('Enter')
    await expect(page.getByRole('treeitem', { name: 'More research', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New folder', exact: true }).click()
    await name.fill('Cancelled')
    await name.press('Escape')
    expect(await readdir(workspace.root)).not.toContain('Cancelled')
    await research.getByRole('button', { name: 'Research', exact: true }).focus()
    await page.keyboard.press('F2')
    await name.fill('Renamed research')
    await name.press('Enter')
    await expect(
      page.getByRole('treeitem', { name: 'Renamed research', exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('treeitem', { name: 'Renamed research', exact: true }),
    ).toBeVisible()
  })

  test('User can manage nested articles and folders through context menus', async ({
    page,
    workspace,
  }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Act
    const drafts = page.getByRole('treeitem', { name: 'Drafts', exact: true })
    await drafts.getByRole('button', { name: 'Drafts', exact: true }).click({ button: 'right' })
    // Assert
    await expect
      .poll(async () => (await page.getByRole('menu').boundingBox())?.x ?? 0)
      .toBeGreaterThan(0)
    await page.screenshot({ path: test.info().outputPath('context-menu.png') })
    await page.getByRole('menuitem', { name: 'New article', exact: true }).click()
    await expect(page.locator('.ProseMirror h1')).toHaveText('Untitled')
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0)
    const name = page.getByRole('textbox', { name: 'Name', exact: true })
    expect(await readFile(join(workspace.root, 'Drafts/Untitled.md'), 'utf8')).toBe(
      '# Untitled\n\n',
    )
    const file = page.locator('[role="treeitem"][data-value="Drafts/Untitled.md"]')
    await file.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: false }).click()
    await name.fill('Renamed.md')
    await name.press('Enter')
    await expect(page.locator('.document-path')).toHaveText('Drafts/Renamed.md')
    await edit(page, ' Still editable.')
    await expect
      .poll(() => readFile(join(workspace.root, 'Drafts/Renamed.md'), 'utf8'))
      .toContain('Still editable.')
    await drafts.getByRole('button', { name: 'Drafts', exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Move to Trash', exact: true }).click()
    await expect(drafts).toHaveCount(0)
    await expect(page.getByText('No article selected')).toBeVisible()
  })

  test('User can toggle the sidebar while retaining the current article', async ({ page }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Act
    await page.locator('[role="treeitem"][data-value="same.md"]').click()
    await edit(page, ' Focus writing.')
    const before = await page.locator('.document-pane').boundingBox()
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
    // Assert
    await expect.poll(async () => (await page.locator('.document-pane').boundingBox())?.x).toBe(0)
    await expect(page.locator('.ProseMirror')).toContainText('Focus writing.')
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
    await expect
      .poll(async () => (await page.locator('.document-pane').boundingBox())?.x)
      .toBe(before!.x)
    await expect(page.locator('.ProseMirror')).toContainText('Focus writing.')
  })

  test('User can retry loading folders and collapse empty folders', async ({ page, workspace }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Act
    const drafts = page.getByRole('treeitem', { name: 'Drafts', exact: true })
    workspace.failLists = true
    await drafts.click()
    // Assert
    await expect(page.getByRole('alert')).toContainText('Folder unavailable')
    workspace.failLists = false
    await drafts.getByRole('button', { name: 'Drafts', exact: true }).click()
    await expect(page.locator('[role="treeitem"][data-value="Drafts/one.md"]')).toBeVisible()
    const empty = page.getByRole('treeitem', { name: 'Empty', exact: true })
    const closedIcon = await empty.locator('svg path').getAttribute('d')
    await empty.click()
    await expect.poll(() => empty.locator('svg path').getAttribute('d')).not.toBe(closedIcon)
    await expect(empty).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Empty folder', { exact: true })).toHaveCount(0)
    await empty.getByRole('button', { name: 'Empty', exact: true }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(empty).toHaveAttribute('aria-expanded', 'false')
  })

  test('User sees the workspace chooser beside the brand and an empty sidebar footer', async ({
    page,
  }) => {
    // Arrange: each case starts with its own seeded workspace.
    // Assert
    await expect(
      page.locator('.titlebar').getByRole('combobox', { name: 'Workspace selector', exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-slot="sidebar-footer"]')).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Workspace selector', exact: true }).click()
    await expect(
      page.getByRole('option', { name: 'Add workspace… (coming soon)', exact: true }),
    ).toHaveAttribute('data-disabled', '')
  })
})

for (const initialWorkspace of ['empty', 'existing'] as const) {
  const context =
    initialWorkspace === 'empty'
      ? 'When using the app for the first time with an empty workspace'
      : 'When working in an existing local workspace'

  test.describe(context, { tag: ['@desktop', '@file-tree'] }, () => {
    test.use({ initialWorkspace })

    test(
      'User sees the local tree and an unselected article placeholder',
      { tag: '@smoke' },
      async ({ page, workspace }) => {
        // Arrange
        const tree = page.getByRole('tree')

        // Assert
        await expect(page.getByText('No article selected')).toBeVisible()
        await expect(page.locator('.ProseMirror')).toHaveCount(0)
        if (initialWorkspace === 'empty') {
          await expect(tree.getByRole('treeitem')).toHaveCount(0)
          await expect(page.getByText('Your workspace is empty.', { exact: false })).toBeVisible()
          expect(await readdir(workspace.root)).toEqual([])
        } else {
          await expect(entry(page, 'Drafts')).toHaveAttribute('aria-expanded', 'false')
          await expect(entry(page, 'same.md')).toBeVisible()
          await expect(entry(page, 'Drafts/one.md')).toHaveCount(0)
          // Act
          await entry(page, 'Drafts').getByRole('button', { name: 'Drafts', exact: true }).click()
          // Assert
          await expect(entry(page, 'Drafts/one.md')).toBeVisible()
          await expect(entry(page, 'Drafts/two.htmd')).toBeVisible()
          expect(await readFile(join(workspace.root, 'Drafts/one.md'), 'utf8')).toContain('# One')
        }
      },
    )

    test(
      'User can create, rename, reopen and delete an article on disk',
      { tag: '@smoke' },
      async ({ page, workspace }) => {
        // Arrange
        const original = join(workspace.root, 'Untitled.md')
        const renamed = join(workspace.root, 'Renamed.md')

        // Act
        await createArticle(page)
        // Assert
        await expect(page.locator('.ProseMirror h1')).toHaveText('Untitled')
        expect(await readFile(original, 'utf8')).toBe('# Untitled\n\n')
        await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0)

        // Act
        await renameEntry(page, 'Untitled.md', 'Renamed.md')
        // Assert
        await expect(page.locator('.document-path')).toHaveText('Renamed.md')
        expect(await exists(original)).toBe(false)
        expect(await readFile(renamed, 'utf8')).toContain('# Untitled')

        // Act
        await edit(page, ' A persisted article.')
        await expect.poll(() => readFile(renamed, 'utf8')).toContain('A persisted article.')
        await page.reload()
        await entry(page, 'Renamed.md').click()
        // Assert
        await expect(page.locator('.ProseMirror')).toContainText('A persisted article.')

        // Act
        await deleteEntry(page, 'Renamed.md')
        // Assert
        await expect(entry(page, 'Renamed.md')).toHaveCount(0)
        expect(await exists(renamed)).toBe(false)
        await expect(page.getByText('No article selected')).toBeVisible()
        await page.reload()
        await expect(entry(page, 'Renamed.md')).toHaveCount(0)
      },
    )

    test('User can create, rename and delete folders on disk', async ({ page, workspace }) => {
      // Arrange
      const original = join(workspace.root, 'Research')
      const renamed = join(workspace.root, 'Reference')

      // Act
      await createFolder(page, 'Research')
      // Assert
      expect((await stat(original)).isDirectory()).toBe(true)
      await expect(entry(page, 'Research')).toHaveAttribute('aria-expanded', 'false')

      // Act
      await renameEntry(page, 'Research', 'Reference')
      // Assert
      expect(await exists(original)).toBe(false)
      expect((await stat(renamed)).isDirectory()).toBe(true)
      await page.reload()
      await expect(entry(page, 'Reference')).toBeVisible()

      // Act
      await deleteEntry(page, 'Reference')
      // Assert
      await expect(entry(page, 'Reference')).toHaveCount(0)
      expect(await exists(renamed)).toBe(false)
      await page.reload()
      await expect(entry(page, 'Reference')).toHaveCount(0)
    })

    test('User can create, rename and delete articles inside folders', async ({
      page,
      workspace,
    }) => {
      // Arrange
      await createFolder(page, 'Research')
      // Act
      await contextAction(page, 'Research', 'New article')
      // Assert
      await expect(page.locator('.ProseMirror h1')).toHaveText('Untitled')
      expect(await readFile(join(workspace.root, 'Research/Untitled.md'), 'utf8')).toBe(
        '# Untitled\n\n',
      )

      // Act
      await renameEntry(page, 'Research/Untitled.md', 'Nested.md')
      await edit(page, ' Nested article.')
      // Assert
      const saved = join(workspace.root, 'Research/Nested.md')
      await expect.poll(() => readFile(saved, 'utf8')).toContain('Nested article.')
      expect(await exists(join(workspace.root, 'Research/Untitled.md'))).toBe(false)
      await expect(page.locator('.document-path')).toHaveText('Research/Nested.md')

      // Act
      await renameEntry(page, 'Research', 'Archive')
      // Assert
      await expect(page.locator('.document-path')).toHaveText('Archive/Nested.md')
      expect(await exists(join(workspace.root, 'Research'))).toBe(false)
      expect(await readFile(join(workspace.root, 'Archive/Nested.md'), 'utf8')).toContain(
        'Nested article.',
      )
      await page.reload()
      await entry(page, 'Archive').getByRole('button', { name: 'Archive', exact: true }).click()
      await entry(page, 'Archive/Nested.md').click()
      await expect(page.locator('.ProseMirror')).toContainText('Nested article.')

      // Act
      await deleteEntry(page, 'Archive/Nested.md')
      // Assert
      await expect(entry(page, 'Archive/Nested.md')).toHaveCount(0)
      expect(await exists(join(workspace.root, 'Archive/Nested.md'))).toBe(false)
      expect(await readdir(join(workspace.root, 'Archive'))).toEqual([])
    })

    test('User can create nested folders and delete a folder containing articles', async ({
      page,
      workspace,
    }) => {
      // Arrange
      await createFolder(page, 'Research')
      // Act
      await contextAction(page, 'Research', 'New folder')
      const input = page.getByRole('textbox', { name: 'Name', exact: true })
      await expect(input).toBeFocused()
      await input.fill('Sources')
      await input.press('Enter')
      await contextAction(page, 'Research/Sources', 'New article')
      // Assert
      const saved = join(workspace.root, 'Research/Sources/Untitled.md')
      await expect(page.locator('.document-path')).toHaveText('Research/Sources/Untitled.md')
      expect(await readFile(saved, 'utf8')).toContain('# Untitled')

      // Act
      await deleteEntry(page, 'Research')
      // Assert
      await expect(entry(page, 'Research')).toHaveCount(0)
      expect(await exists(saved)).toBe(false)
      expect(await exists(join(workspace.root, 'Research'))).toBe(false)
      await expect(page.getByText('No article selected')).toBeVisible()
      await page.reload()
      await expect(entry(page, 'Research')).toHaveCount(0)
    })
  })
}

// Fixtures --------------------------------------------------------------------
function entry(page: Page, path: string) {
  return page.locator(`[role="treeitem"][data-value=${JSON.stringify(path)}]`)
}

async function contextAction(page: Page, path: string, action: string) {
  const parts = path.split('/')
  for (let depth = 1; depth < parts.length; depth++) {
    const parent = entry(page, parts.slice(0, depth).join('/'))
    if ((await parent.getAttribute('aria-expanded')) === 'false') {
      await parent.getByRole('button', { name: parts[depth - 1]!, exact: true }).click()
    }
  }
  const node = entry(page, path)
  // Scope folder clicks to the branch control, so expanded children are not targets.
  const control = node.getByRole('button', { name: path.split('/').at(-1)!, exact: true })
  await ((await control.count()) ? control : node).click({ button: 'right' })
  await page.getByRole('menuitem', { name: action, exact: action !== 'Rename' }).click()
}

async function renameEntry(page: Page, path: string, name: string) {
  await contextAction(page, path, 'Rename')
  const input = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(input).toBeFocused()
  await input.fill(name)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

async function createFolder(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(input).toBeFocused()
  await input.fill(name)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

async function deleteEntry(page: Page, path: string) {
  await contextAction(page, path, 'Move to Trash')
  await expect(entry(page, path)).toHaveCount(0)
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false
      throw error
    },
  )
}
