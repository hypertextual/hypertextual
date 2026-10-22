import type { Page, Locator } from '@playwright/test'
import { test, expect, edit, createArticle, delay, png } from './fixtures'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Tests -----------------------------------------------------------------------
test.describe(
  'When editing and recovering saved articles',
  { tag: ['@desktop', '@editor'] },
  () => {
    test('User can autosave both article formats when switching and closing', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await page.locator('[role="treeitem"][data-value$="one.md"]').click()
      await edit(page, ' Updated.')
      // Assert
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/one.md'), 'utf8'))
        .toContain('Updated.')
      await expect(page.getByRole('status')).toContainText(['Saved'])
      await edit(page, ' Switched.')
      await page.locator('[role="treeitem"][data-value$="two.htmd"]').click()
      await expect(page.locator('.ProseMirror h1')).toHaveText('Two')
      expect(await readFile(join(workspace.root, 'Drafts/one.md'), 'utf8')).toContain('Switched.')
      await edit(page, ' Closed.')
      await workspace.emit('tauri://close-requested')
      await expect.poll(() => workspace.destroyed).toBe(true)
      expect(await readFile(join(workspace.root, 'Drafts/two.htmd'), 'utf8')).toContain('Closed.')
      await page.reload()
      await expect(page.getByText('No article selected')).toBeVisible()
    })

    test('User can quit after pending autosave completes', async ({ page, workspace }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.locator('[role="treeitem"][data-value$="same.md"]').click()
      await edit(page, ' Before quit.')
      await workspace.emit('workspace-quit-requested')
      // Assert
      await expect.poll(() => workspace.quit).toBe(true)
      expect(await readFile(join(workspace.root, 'same.md'), 'utf8')).toContain('Before quit.')
    })

    test('User can retain drafts and retry after save failures', async ({ page, workspace }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.locator('[role="treeitem"][data-value$="same.md"]').click()
      workspace.failWrites = true
      await edit(page, ' Retained draft.')
      // Assert
      await expect(page.getByRole('alertdialog')).toContainText('Disk unavailable')
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
      await page.locator('[role="treeitem"][data-value$="same.htmd"]').click()
      await expect(page.locator('.ProseMirror')).toContainText('Retained draft.')
      await expect(page.locator('[role="treeitem"][data-value="same.md"]')).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(page.locator('[role="treeitem"][data-value="same.htmd"]')).toHaveAttribute(
        'aria-selected',
        'false',
      )
      await workspace.emit('tauri://close-requested')
      await expect(page.getByRole('button', { name: 'Retry autosave' })).toBeEnabled()
      expect(workspace.destroyed).toBe(false)
      expect(await readFile(join(workspace.root, 'same.md'), 'utf8')).toBe('# Markdown\n')
      workspace.failWrites = false
      await page.getByRole('button', { name: 'Retry autosave' }).click()
      await expect
        .poll(() => readFile(join(workspace.root, 'same.md'), 'utf8'))
        .toContain('Retained draft.')
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    test('User can reload external changes without overwriting them', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.locator('[role="treeitem"][data-value$="same.md"]').click()
      // Assert
      await expect(page.locator('.ProseMirror')).toBeVisible()
      await writeFile(join(workspace.root, 'same.md'), '# External writer\n')
      await edit(page, ' Local draft.')
      await expect(page.getByRole('alertdialog')).toContainText('changed outside')
      expect(await readFile(join(workspace.root, 'same.md'), 'utf8')).toBe('# External writer\n')
      await page.getByRole('button', { name: 'Discard draft and reload' }).click()
      await expect(page.locator('.ProseMirror h1')).toHaveText('External writer')
    })

    test('User sees the latest selected article when a read is delayed', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      workspace.slowReads = true
      await page.locator('[role="treeitem"][data-value$="same.md"]').click()
      await page.locator('[role="treeitem"][data-value$="same.htmd"]').click()
      // Assert
      await expect(page.locator('.ProseMirror h1')).toHaveText('HTMD')
      await delay(450)
      await expect(page.locator('.ProseMirror h1')).toHaveText('HTMD')
    })

    test('User can inspect rich source and images without rewriting files', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.locator('[role="treeitem"][data-value$="rich.htmd"]').click()
      // Assert
      await expect(page.getByLabel('Original article source')).toContainText('"series":[1,2]')
      await expect(page.locator('.ProseMirror')).toHaveCount(0)
      await page.locator('[role="treeitem"][data-value$="titled-link.md"]').click()
      await expect(page.locator('.ProseMirror a')).toHaveAttribute('title', 'Preserve this title')
      await page.locator('[role="treeitem"][data-value$="image.png"]').click()
      await expect(page.locator('.image-preview img')).toBeVisible()
      expect(workspace.writes).toEqual([])
    })

    test('User can autosave title spaces and empty headings with updated file and sidebar names', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await page.locator('[role="treeitem"][data-value$="one.md"]').click()
      const heading = page.locator('.ProseMirror h1')
      await heading.click()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      await page.keyboard.press('End')
      await page.keyboard.press('Shift+ArrowLeft')
      await page.keyboard.press('Shift+ArrowLeft')
      await page.keyboard.press('Shift+ArrowLeft')
      // Assert
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('One')
      await page.keyboard.type('Renamed title ')
      await expect(page.locator('.document-path')).toHaveText('Drafts/Renamed title.md')
      await expect(page.locator('.document-status')).toContainText('Renamed title.md')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/Renamed title.md'), 'utf8'))
        .toContain('Renamed title&#32;')
      const paragraph = page.locator('.ProseMirror p').first()
      await paragraph.click()
      await page.keyboard.press('End')
      await page.keyboard.type(' ')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/Renamed title.md'), 'utf8'))
        .toContain('First article.&#32;')
      // Create an empty H2 through the actual editor keyboard shortcut.
      await page.keyboard.press('Enter')
      await page.keyboard.press('ControlOrMeta+Alt+2')
      await expect(page.locator('.ProseMirror h2')).toHaveText('')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/Renamed title.md'), 'utf8'))
        .toContain('## ')
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.locator('[role="treeitem"][data-value$="two.htmd"]').click()
      await page.locator('[role="treeitem"][data-value="Drafts/Renamed title.md"]').click()
      await expect(page.locator('.ProseMirror h1')).toHaveText('Renamed title ')
      await expect(page.locator('.ProseMirror h2')).toHaveText('')
      await expect(page.locator('.ProseMirror p').first()).toHaveText('First article. ')
      await page.reload()
      await expect(page.getByText('No article selected')).toBeVisible()
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await expect(page.locator('[data-value="Drafts/Renamed title.md"] .tree-label')).toHaveText(
        'Renamed title',
      )
      await expect(page.getByText('No article selected')).toBeVisible()
    })

    test('User can reopen an autosaved notice with its edited title, type and body', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await page.locator('[role="treeitem"][data-value$="one.md"]').click()
      await edit(page, ' /notice')
      await page.keyboard.press('Enter')
      // Assert
      await expect(page.getByLabel('Notice title')).toHaveValue('Note')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/one.md'), 'utf8'))
        .toContain('> [!NOTE] Note')
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.getByLabel('Notice title').fill('Remember this')
      await page.getByLabel('Notice type').selectOption('warning')
      await page.getByLabel('Notice title').press('Enter')
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.classList.contains('ProseMirror')))
        .toBe(true)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      await page.keyboard.type('Notice body ')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/one.md'), 'utf8'))
        .toContain('> [!WARNING] Remember this')
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/one.md'), 'utf8'))
        .toContain('Notice body&#32;')
      await page.locator('[role="treeitem"][data-value$="two.htmd"]').click()
      await page.locator('[role="treeitem"][data-value="Drafts/one.md"]').click()
      await expect(page.getByLabel('Notice title')).toHaveValue('Remember this')
      await expect(page.getByLabel('Notice type')).toHaveValue('warning')
      await expect(page.locator('.editor-notice-node')).toContainText('Notice body')
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    test('User can reopen article-local images saved as Markdown', async ({ page, workspace }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await page.locator('[role="treeitem"][data-value="Drafts/one.md"]').click()
      const paragraph = page.locator('.ProseMirror p').first()
      await paragraph.click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/image')
      await page.getByRole('button', { name: 'Image', exact: true }).click()
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
      await page.getByRole('button', { name: 'Upload', exact: true }).last().click()
      // Assert
      await expect(page.locator('.ProseMirror img')).toBeVisible()
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/one.md'), 'utf8'))
        .toContain('.images/')
      expect(await readFile(join(workspace.root, 'Drafts/one.md'), 'utf8')).not.toContain('data:')
      expect(await readdir(join(workspace.root, 'Drafts/.images'))).toHaveLength(1)
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await page.reload()
      await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
      await page.locator('[role="treeitem"][data-value="Drafts/one.md"]').click()
      await expect(page.locator('.ProseMirror img')).toBeVisible()
      await expect
        .poll(() =>
          page.locator('.ProseMirror img').evaluate((el) => (el as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0)
      await expect(page.getByRole('treeitem', { name: '.images', exact: true })).toHaveCount(0)
    })

    test('User can recover unsupported formatting through the alert dialog', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      page.on('dialog', () => {
        throw new Error('Browser dialogs must not be used for recovery')
      })
      await page.locator('[role="treeitem"][data-value="same.md"]').click()
      await page.locator('.ProseMirror h1').click()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      await page.keyboard.press('End')
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft')
      // Assert
      await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('Markdown')
      await page.getByRole('button', { name: 'Underline', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toContainText('draft is retained')
      await page.screenshot({ path: test.info().outputPath('recovery.png') })
      await page.getByRole('button', { name: 'Discard draft and reload', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(page.locator('.ProseMirror h1')).toHaveText('Markdown')
      await expect(page.locator('.ProseMirror u')).toHaveCount(0)
      await edit(page, ' Recovered.')
      await expect
        .poll(() => readFile(join(workspace.root, 'same.md'), 'utf8'))
        .toContain('Recovered.')
    })
  },
)

for (const initialWorkspace of ['empty', 'existing'] as const) {
  const context =
    initialWorkspace === 'empty' ? 'When creating an article' : 'When updating an existing article'

  test.describe(context, { tag: ['@desktop', '@editor'] }, () => {
    test.use({ initialWorkspace })

    test.beforeEach(async ({ page }) => {
      if (initialWorkspace === 'empty') await createArticle(page)
      else await page.locator('[role="treeitem"][data-value="same.md"]').click()
      await expect(page.locator('.ProseMirror')).toBeVisible()
    })

    test(
      'User can open, filter and dismiss the slash menu with the keyboard',
      { tag: '@smoke' },
      async ({ page }) => {
        // Arrange
        await edit(page, '')
        await page.keyboard.press('Enter')
        // Act
        await page.keyboard.type('/')
        // Assert
        await expect(page.getByRole('button', { name: 'Notice', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Image', exact: true })).toBeVisible()
        // Act
        await page.keyboard.type('code')
        // Assert
        await expect(page.getByRole('button', { name: 'Code Block', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Notice', exact: true })).toHaveCount(0)
        // Act
        await page.keyboard.press('Escape')
        // Assert
        await expect(page.getByRole('button', { name: 'Code Block', exact: true })).toHaveCount(0)
        await expect(page.locator('.ProseMirror')).toContainText('/code')
      },
    )

    for (const widget of [
      { name: 'Heading 1', selector: 'h2', markdown: '## Widget text' },
      { name: 'Quote', selector: 'blockquote', markdown: '> Widget text' },
      {
        name: 'Bullet List',
        selector: 'ul:not([data-type="taskList"])',
        markdown: '- Widget text',
      },
      { name: 'Numbered List', selector: 'ol', markdown: '1. Widget text' },
      { name: 'Todo List', selector: 'ul[data-type="taskList"]', markdown: '- [ ] Widget text' },
      { name: 'Code Block', selector: '.node-codeBlock', markdown: '```plaintext' },
    ]) {
      test(`User can create, edit, reopen and remove a ${widget.name}`, async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        const saved = join(workspace.root, path)
        const block = page.locator(`.ProseMirror ${widget.selector}`)
        // Act
        await insertBlock(page, widget.name)
        await (widget.name === 'Code Block' ? block.locator('code') : block).click()
        await editorSettled(page)
        await page.keyboard.type('Widget text')
        // Assert
        await expect(block).toContainText('Widget text')
        await expect.poll(() => readFile(saved, 'utf8')).toContain(widget.markdown)
        await expect(page.getByRole('alertdialog')).toHaveCount(0)

        // Act
        await page.keyboard.type(' edited')
        if (widget.name === 'Todo List') await block.getByRole('checkbox').check()
        if (widget.name === 'Code Block') {
          await block.getByRole('combobox').click()
          await page.getByRole('option', { name: 'TypeScript', exact: true }).click()
        }
        // Assert
        await expect.poll(() => readFile(saved, 'utf8')).toContain('Widget text edited')
        if (widget.name === 'Todo List')
          await expect.poll(() => readFile(saved, 'utf8')).toContain('- [x]')
        if (widget.name === 'Code Block')
          await expect.poll(() => readFile(saved, 'utf8')).toContain('```typescript')

        // Act
        await reopen(page, path)
        // Assert
        await expect(block).toContainText('Widget text edited')
        if (widget.name === 'Todo List') await expect(block.getByRole('checkbox')).toBeChecked()
        if (widget.name === 'Code Block')
          await expect(block.getByRole('combobox')).toContainText('TypeScript')

        // Act
        await removeBlock(page, block)
        // Assert
        await expect(block).toHaveCount(0)
        await expect.poll(() => readFile(saved, 'utf8')).not.toContain('Widget text')
        await reopen(page, path)
        await expect(block).toHaveCount(0)
        await expect(page.locator('.ProseMirror h1')).toHaveText(
          initialWorkspace === 'empty' ? 'Untitled' : 'Markdown',
        )
      })
    }

    test('User can create, edit, reopen and remove a notice', async ({ page, workspace }) => {
      // Arrange
      const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
      const saved = join(workspace.root, path)
      const block = page.locator('.editor-notice-node')
      // Act
      await insertBlock(page, 'Notice')
      // Assert
      await expect(page.getByLabel('Notice title')).toHaveValue('Note')
      await expect.poll(() => readFile(saved, 'utf8')).toContain('> [!NOTE] Note')
      // Act
      await page.getByLabel('Notice title').fill('Important detail')
      await page.getByLabel('Notice type').selectOption('warning')
      await page.getByLabel('Notice title').press('Enter')
      await editorSettled(page)
      await page.keyboard.type('Notice body edited')
      // Assert
      await expect.poll(() => readFile(saved, 'utf8')).toContain('> [!WARNING] Important detail')
      await expect.poll(() => readFile(saved, 'utf8')).toContain('Notice body edited')
      // Act
      await reopen(page, path)
      // Assert
      await expect(page.getByLabel('Notice title')).toHaveValue('Important detail')
      await expect(page.getByLabel('Notice type')).toHaveValue('warning')
      await expect(block).toContainText('Notice body edited')
      // Act
      await removeBlock(page, block)
      // Assert
      await expect(block).toHaveCount(0)
      await expect.poll(() => readFile(saved, 'utf8')).not.toContain('[!WARNING]')
      await reopen(page, path)
      await expect(block).toHaveCount(0)
    })

    test('User can insert and remove a divider', async ({ page, workspace }) => {
      // Arrange
      const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
      const saved = join(workspace.root, path)
      const block = page.locator('.ProseMirror hr')
      // Act
      await insertBlock(page, 'Divider')
      // Assert
      await expect(block).toHaveCount(1)
      await expect.poll(() => readFile(saved, 'utf8')).toContain('---')
      // Act
      await reopen(page, path)
      await removeBlock(page, block)
      // Assert
      await expect(block).toHaveCount(0)
      await expect.poll(() => readFile(saved, 'utf8')).not.toContain('---')
      await reopen(page, path)
      await expect(block).toHaveCount(0)
    })

    test('User can upload, caption, reopen and remove an image', async ({ page, workspace }) => {
      // Arrange
      const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
      const saved = join(workspace.root, path)
      // Act
      await insertBlock(page, 'Image')
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png })
      await page.getByRole('button', { name: 'Upload', exact: true }).last().click()
      // Assert
      await expect(page.locator('.ProseMirror img')).toBeVisible()
      await expect.poll(() => readFile(saved, 'utf8')).toContain('.images/')
      expect(await readdir(join(workspace.root, '.images'))).toHaveLength(1)
      // Act
      const caption = page.getByPlaceholder('Add a caption…')
      await caption.fill('An edited caption')
      await page.locator('.ProseMirror h1').click()
      // Assert
      await expect.poll(() => readFile(saved, 'utf8')).toContain('"An edited caption"')
      expect(await readFile(saved, 'utf8')).not.toContain('data:')
      // Act
      await reopen(page, path)
      // Assert
      await expect(page.getByPlaceholder('Add a caption…')).toHaveValue('An edited caption')
      await expect
        .poll(() =>
          page
            .locator('.ProseMirror img')
            .evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0)
      await expect(page.getByRole('treeitem', { name: '.images', exact: true })).toHaveCount(0)
      // Act
      await page.locator('.ProseMirror img').hover()
      await page.getByRole('button', { name: 'Remove image', exact: true }).click()
      // Assert
      await expect(page.locator('.ProseMirror img')).toHaveCount(0)
      await expect.poll(() => readFile(saved, 'utf8')).not.toContain('![')
      await reopen(page, path)
      await expect(page.locator('.ProseMirror img')).toHaveCount(0)
    })
  })
}

// Fixtures --------------------------------------------------------------------
async function insertBlock(page: Page, name: string) {
  await edit(page, '')
  await page.keyboard.press('Enter')
  await page.keyboard.type(`/${name.split(' ')[0]!.toLowerCase()}`)
  await page.getByRole('button', { name, exact: true }).click()
  await editorSettled(page)
}

async function reopen(page: Page, path: string) {
  await expect(page.locator('.document-status')).toContainText('Saved')
  await page.reload()
  await page.locator(`[role="treeitem"][data-value=${JSON.stringify(path)}]`).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

async function editorSettled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

async function removeBlock(page: Page, block: Locator) {
  if (await block.evaluate((element) => element.tagName === 'HR')) {
    await edit(page, '')
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    if (await block.count()) await page.keyboard.press('Backspace')
    return
  }
  await block.scrollIntoViewIfNeeded()
  await page.locator('.ProseMirror').focus()
  await editorSettled(page)
  // Select the rendered block, then delete through the keyboard. Do not call editor commands.
  await block.evaluate((element) => {
    const range = document.createRange()
    range.selectNode(element.closest('.ProseMirror > *') ?? element)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await editorSettled(page)
  await page.keyboard.press('Backspace')
  // Editable wrappers can first empty their content; Backspace again lifts the empty block.
  for (let attempt = 0; attempt < 3 && (await block.count()); attempt++) {
    await page.keyboard.press('Backspace')
  }
}
