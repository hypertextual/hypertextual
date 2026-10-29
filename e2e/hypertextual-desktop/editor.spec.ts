import type { Page, Locator } from '@playwright/test'
import { test, expect, edit, createArticle, delay, png } from './fixtures'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Tests -----------------------------------------------------------------------
test.describe(
  'When editing and recovering saved articles',
  { tag: ['@desktop', '@editor'] },
  () => {
    test(
      'User opens articles in view mode, clicks to edit, and presses Escape to view',
      { tag: '@smoke' },
      async ({ page, workspace }) => {
        // Arrange
        const source =
          '# Modes\n\nA paragraph to edit.\n\n> [!NOTE] Remember\n> Body text.\n\n```javascript\nconst value = 1\n```\n'
        await writeFile(join(workspace.root, 'Drafts/modes.md'), source)
        await page.reload()
        await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()

        // Act
        await page.locator('[role="treeitem"][data-value="Drafts/modes.md"]').click()

        // Assert
        const article = page.getByRole('main', { name: 'Article' })
        const prose = page.locator('.ProseMirror')
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect(article.getByRole('combobox')).toHaveCount(0)
        await expect(page.getByLabel('Notice title')).toHaveCount(0)
        await expect(page.locator('.editor-notice-node')).toContainText('Remember')
        await expect(page.locator('.document-heading')).toHaveCount(0)
        await expect(page.locator('.titlebar')).not.toContainText('hypertextual')
        const breadcrumb = page.getByRole('navigation', { name: 'Article path' })
        await expect(breadcrumb.getByRole('listitem')).toHaveText([
          'Local workspace',
          'Drafts',
          'Modes',
        ])
        await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Modes')
        expect(await readFile(join(workspace.root, 'Drafts/modes.md'), 'utf8')).toBe(source)

        // Act
        await prose.locator('h1').click()

        // Assert
        await expect(prose).toHaveAttribute('contenteditable', 'true')
        await expect(page.getByLabel('Notice title')).toHaveValue('Remember')
        await expect(article.getByRole('combobox')).toHaveCount(2)

        // Act
        await page.getByLabel('Notice title').fill('Updated')
        await page.getByLabel('Notice title').press('Escape')

        // Assert
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect(article.getByRole('combobox')).toHaveCount(0)
        await expect(page.getByLabel('Notice title')).toHaveCount(0)
        await expect(page.locator('.editor-notice-node')).toContainText('Updated')
        await expect
          .poll(() => readFile(join(workspace.root, 'Drafts/modes.md'), 'utf8'))
          .toContain('[!NOTE] Updated')
      },
    )

    test('User scrolls with arrow keys in view mode without editing the article', async ({
      page,
      workspace,
    }) => {
      // Arrange
      const source =
        '# Long article\n\n' +
        Array.from({ length: 60 }, (_, index) => `Paragraph ${index}.`).join('\n\n') +
        '\n'
      await writeFile(join(workspace.root, 'Long article.md'), source)
      await page.reload()

      // Act
      await page.locator('[role="treeitem"][data-value="Long article.md"]').click()
      const scroll = page.getByRole('region', { name: 'Article content' })
      await expect(scroll).toBeFocused()
      for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowDown', { delay: 80 })

      // Assert
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      const down = await scroll.evaluate((element) => element.scrollTop)

      // Act
      for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowUp', { delay: 80 })

      // Assert
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeLessThan(down)
      await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
      expect(await readFile(join(workspace.root, 'Long article.md'), 'utf8')).toBe(source)
    })

    test('User can play a video and read image captions without entering edit mode', async ({
      page,
      workspace,
    }) => {
      // Arrange
      const source =
        '# Media views\n\n![Photo](.images/photo.png "Photo caption")\n\n:::youtube {url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Demo video"} :::\n'
      await mkdir(join(workspace.root, '.images'))
      await writeFile(join(workspace.root, '.images/photo.png'), png)
      await writeFile(join(workspace.root, 'Media views.md'), source)
      await page.route('https://www.youtube-nocookie.com/**', (route) =>
        route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
      )
      await page.reload()

      // Act
      await page.locator('[role="treeitem"][data-value="Media views.md"]').click()

      // Assert
      const prose = page.locator('.ProseMirror')
      await expect(prose.locator('figcaption')).toHaveText('Photo caption')
      await expect(prose.locator('input')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Remove image' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Remove preview' })).toHaveCount(0)

      // Act
      const video = prose.locator('[data-youtube-id]')
      await expect(video.getByRole('heading')).toHaveCount(0)
      await video.getByRole('button', { name: 'Play video', exact: true }).click()

      // Assert
      await expect(prose.locator('iframe')).toHaveAttribute(
        'src',
        /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
      )
      await expect(prose).toHaveAttribute('contenteditable', 'false')
      expect(await readFile(join(workspace.root, 'Media views.md'), 'utf8')).toBe(source)
    })

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

    test('User can inspect unparsed source and images without rewriting files', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      await page.locator('[role="treeitem"][data-value$="rich.htmd"]').click()
      // Assert
      await expect(page.locator('.ProseMirror [data-unparsed="block"]')).toContainText(
        '"series":[1,2]',
      )
      await expect(page.getByLabel('Original article source')).toHaveCount(0)
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
      await expect(page.locator('.document-status [aria-current="page"]')).toHaveText(
        'Renamed title',
      )
      await expect(page.locator('.document-status [aria-current="page"]')).toHaveAttribute(
        'title',
        'Drafts/Renamed title.md',
      )
      await expect(page.locator('.document-status [aria-current="page"]').first()).toHaveText(
        'Renamed title',
      )
      await expect
        .poll(() => readFile(join(workspace.root, 'Drafts/Renamed title.md'), 'utf8'))
        .toContain('# Renamed title&#32;')
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
        .toMatch(/^##(?: |\n|$)/m)
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

    for (const extension of ['md', 'htmd']) {
      test(`User sees the saved article title in the breadcrumb and its legacy ${extension} filename is synchronized on disk`, async ({
        page,
        workspace,
      }) => {
        // Arrange: an older article already has a title, but retains its generated filename.
        const oldPath = `Untitled 4.${extension}`
        const source = '\uFEFF# A saved article\r\n\r\nEarlier writing.\r\n'
        const collision = extension === 'md'
        const savedPath = `A saved article${collision ? ' 2' : ''}.${extension}`
        await writeFile(join(workspace.root, oldPath), source)
        if (collision)
          await writeFile(join(workspace.root, 'A saved article.md'), '# Another article\n')
        await page.reload()
        const oldEntry = page.locator(`[role="treeitem"][data-value="${oldPath}"]`)
        await expect(oldEntry.locator('.tree-label')).toHaveText('A saved article')
        expect(await readFile(join(workspace.root, oldPath), 'utf8')).toBe(source)

        // Act
        await oldEntry.click()

        // Assert: the bars agree with the tree, while hover exposes the actual path.
        await expect(page.locator('.document-status [aria-current="page"]')).toHaveText(
          'A saved article',
        )
        await expect(page.locator('.document-status [aria-current="page"]').first()).toHaveText(
          'A saved article',
        )
        await expect(page.locator('.document-status [aria-current="page"]')).toHaveAttribute(
          'title',
          savedPath,
        )
        await expect(
          page.locator('.document-status [aria-current="page"]').first(),
        ).toHaveAttribute('title', savedPath)
        expect(await readFile(join(workspace.root, savedPath), 'utf8')).toBe(source)
        expect(await readdir(workspace.root)).not.toContain(oldPath)
        if (collision)
          expect(await readFile(join(workspace.root, 'A saved article.md'), 'utf8')).toBe(
            '# Another article\n',
          )

        // Act: continue editing after the rename and reopen the resulting file.
        await edit(page, ' Still editable.')
        await expect
          .poll(() => readFile(join(workspace.root, savedPath), 'utf8'))
          .toContain('Still editable.')
        await page.reload()
        await page.locator(`[role="treeitem"][data-value="${savedPath}"]`).click()

        // Assert
        await expect(page.locator('.ProseMirror')).toContainText('Still editable.')
        await expect(page.locator('.document-status [aria-current="page"]')).toHaveText(
          'A saved article',
        )
        await expect(page.locator('.document-status [aria-current="page"]').first()).toHaveText(
          'A saved article',
        )
        await expect(page.locator('.document-status [aria-current="page"]')).toHaveAttribute(
          'title',
          savedPath,
        )
      })
    }

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
      await page.getByRole('combobox', { name: 'Notice type' }).click()
      await page.getByRole('option', { name: 'Warning', exact: true }).click()
      await expect(page.getByRole('combobox', { name: 'Notice type' })).toBeFocused()
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
      await expect(page.getByLabel('Notice title')).toHaveCount(0)
      await expect(page.locator('.editor-notice-node')).toContainText('Remember this')
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
      await page.getByRole('option', { name: 'Image', exact: true }).click()
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

    test('User can recover a failed formatted save through the alert dialog', async ({
      page,
      workspace,
    }) => {
      // Arrange: each case starts with its own seeded workspace.
      // Act
      page.on('dialog', () => {
        throw new Error('Browser dialogs must not be used for recovery')
      })
      await page.locator('[role="treeitem"][data-value="same.md"]').click()
      await enterBody(page, 'Recoverable body')
      await expect
        .poll(() => readFile(join(workspace.root, 'same.md'), 'utf8'))
        .toContain('Recoverable body')
      workspace.failWrites = true
      await page.keyboard.press('ControlOrMeta+u')
      await page.keyboard.type(' draft')
      // Assert
      await expect(page.getByRole('alertdialog')).toContainText('Disk unavailable')
      await page.screenshot({ path: test.info().outputPath('recovery.png') })
      await page.getByRole('button', { name: 'Discard draft and reload', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(page.locator('.ProseMirror h1')).toHaveText('Markdown')
      await expect(page.locator('.ProseMirror u')).toHaveCount(0)
      workspace.failWrites = false
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
        await expect(page.getByRole('option', { name: 'Notice', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: 'Image', exact: true })).toBeVisible()
        // Act
        await page.keyboard.type('code')
        // Assert
        await expect(page.getByRole('option', { name: 'Code Block', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: 'Notice', exact: true })).toHaveCount(0)
        // Act
        await page.keyboard.press('Escape')
        // Assert
        await expect(page.getByRole('option', { name: 'Code Block', exact: true })).toHaveCount(0)
        await expect(page.locator('.ProseMirror')).toContainText('/code')
      },
    )

    test.describe('When moving between empty body blocks', () => {
      test('it shows command guidance only for the focused paragraph', async ({ page }) => {
        // Arrange
        await edit(page, '')
        await page.keyboard.press('Enter')
        await page.keyboard.press('Enter')
        const empty = page.locator('.ProseMirror p.is-empty[data-placeholder]')

        // Act
        await empty.first().click()

        // Assert
        await expect
          .poll(() =>
            empty.evaluateAll(
              (elements) =>
                elements.filter((element) =>
                  getComputedStyle(element, '::before').content.includes("Type '/'"),
                ).length,
            ),
          )
          .toBe(1)
        await expect
          .poll(() =>
            empty.first().evaluate((element) => getComputedStyle(element, '::before').content),
          )
          .toContain("Type '/'")

        // Act
        await empty.last().click()

        // Assert
        await expect
          .poll(() =>
            empty.first().evaluate((element) => getComputedStyle(element, '::before').content),
          )
          .toBe('none')
        await expect
          .poll(() =>
            empty.last().evaluate((element) => getComputedStyle(element, '::before').content),
          )
          .toContain("Type '/'")
      })
    })

    test.describe('When typing a Markdown heading shortcut', () => {
      test('it converts a double-hash input into a second-level heading and saves it', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await enterBody(page, '')

        // Act
        await page.keyboard.type('## ', { delay: 30 })
        await expect(page.locator('.ProseMirror h2')).toBeVisible()
        await editorSettled(page)
        await page.keyboard.type('Section title')

        // Assert
        await expect(page.locator('.ProseMirror h2')).toHaveText('Section title')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('## Section title')

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect(page.locator('.ProseMirror h2')).toHaveText('Section title')
      })
    })

    test.describe('When saving every editor element', () => {
      test('it navigates up through a notice body and title to the preceding paragraph', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = 'Notice navigation.md'
        await writeFile(
          join(workspace.root, path),
          '# Notice navigation\n\nBefore the notice.\n\n> [!NOTE] Reminder\n> Body text.\n\nAfter the notice.\n',
        )
        await page.reload()
        await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
        await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })
        const title = page.getByLabel('Notice title')
        const body = page.locator('.editor-notice-node [data-node-view-content]')

        // Act
        await body.locator('p').click()
        await page.keyboard.press('Home')
        await page.keyboard.press('ArrowUp')

        // Assert
        await expect(title).toBeFocused()

        // Act
        await page.keyboard.press('ArrowUp')
        await page.keyboard.type(' Updated.')

        // Assert
        await expect(page.locator('.ProseMirror > p').first()).toHaveText(
          'Before the notice. Updated.',
        )
        await expect(title).toHaveValue('Reminder')
        await expect(body).toHaveText('Body text.')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('Before the notice. Updated.')
      })

      test('it moves from a notice title into the body below it', async ({ page, workspace }) => {
        // Arrange
        const path = 'Notice focus.md'
        await writeFile(
          join(workspace.root, path),
          '# Notice focus\n\nBefore the notice.\n\n> [!NOTE] Reminder\n> Original body.\n\nAfter the notice.\n',
        )
        await page.reload()
        await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
        await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })
        const notice = page.locator('.editor-notice-node')
        const title = page.getByLabel('Notice title')
        const body = notice.locator('[data-node-view-content]')

        // Assert
        await expect(body).toHaveText('Original body.')
        const titleBox = await title.boundingBox()
        const bodyBox = await body.boundingBox()
        expect(bodyBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height)

        // Act
        await title.fill('Updated reminder')
        await title.press('Enter')
        await page.keyboard.type('Added ')

        // Assert
        await expect(body).toHaveText('Added Original body.')
        await expect(page.locator('.ProseMirror > p').first()).toHaveText('Before the notice.')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('> [!NOTE] Updated reminder\n> Added Original body.')

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect(title).toHaveValue('Updated reminder')
        await expect(body).toHaveText('Added Original body.')
      })

      test('it shows an empty notice body and accepts typing immediately after its title', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = 'Empty notice.md'
        await writeFile(join(workspace.root, path), '# Empty notice\n\n> [!NOTE] Reminder\n>\n')
        await page.reload()
        await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
        await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })
        const title = page.getByLabel('Notice title')
        const body = page.locator('.editor-notice-node [data-node-view-content]')

        // Assert
        await expect(body).toBeVisible()
        await expect(body).toHaveAttribute('data-empty', 'true')
        expect(
          await body.evaluate((element) => getComputedStyle(element, '::before').content),
        ).toBe('"Add the notice body here."')

        // Act
        await title.fill('Remember this')
        await title.press('Enter')
        await page.keyboard.type('Body text')

        // Assert
        await expect(title).toHaveValue('Remember this')
        await expect(body).toHaveText('Body text')
        await expect(body).toHaveAttribute('data-empty', 'false')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('> [!NOTE] Remember this\n> Body text')
      })

      test('it opens legacy notice and empty paragraph directives as editable blocks', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = 'Legacy notice.md'
        const source = '# Legacy notice\n\n:::notice\nAnd this should save!\n:::\n\n::paragraph\n'
        await writeFile(join(workspace.root, path), source)

        // Act
        await page.reload()
        await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
        await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })

        // Assert
        const notice = page.locator('.editor-notice-node')
        await expect(notice).toBeVisible()
        await expect(notice).toContainText('And this should save!')
        await expect(page.getByLabel('Notice title')).toHaveValue('Note')
        await expect(page.locator('.ProseMirror [data-unparsed]')).toHaveCount(0)
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)

        // Act
        await page.getByLabel('Notice title').fill('Remember this')
        await page.getByRole('combobox', { name: 'Notice type' }).click()
        await page.getByRole('option', { name: 'Warning', exact: true }).click()
        await expect(page.getByRole('combobox', { name: 'Notice type' })).toBeFocused()
        await page.getByLabel('Notice title').press('Enter')
        await editorSettled(page)
        await page.keyboard.type('Updated. ')

        // Assert
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('> [!WARNING] Remember this')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('Updated. And this should save!')

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect(page.getByLabel('Notice title')).toHaveValue('Remember this')
        await expect(page.getByRole('combobox', { name: 'Notice type' })).toHaveText('Warning')
        await expect(notice).toContainText('Updated. And this should save!')
        await expect(page.locator('.ProseMirror [data-unparsed]')).toHaveCount(0)
      })

      test('it keeps unparsed blocks and inline syntax editable beside supported content', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const html = '<figure>Raw HTML</figure>'
        const source =
          '# Partial article\n\nKnown **bold**.\n\n' + html + '\n\nAfter :future[raw] text.\n'
        await writeFile(join(workspace.root, 'Partial article.md'), source)

        // Act
        await page.reload()
        await page.locator('[role="treeitem"][data-value="Partial article.md"]').click()

        // Assert
        const block = page.locator('.ProseMirror [data-unparsed="block"]')
        const inline = page.locator('.ProseMirror [data-unparsed="inline"]')
        await expect(block).toHaveText(html)
        await expect(block).toHaveAttribute('data-source-kind', 'html')
        await expect(block).toHaveAttribute('data-reason', 'Unsupported Markdown html.')
        await expect(block).toHaveCSS('white-space', 'pre-wrap')
        await expect(inline).toHaveText(':future[raw]')
        await expect(page.locator('.ProseMirror strong')).toHaveText('bold')
        await expect(page.locator('.ProseMirror figure')).toHaveCount(0)
        await expect(page.getByLabel('Original article source')).toHaveCount(0)

        // Act: ordinary text and the raw source remain editable.
        await page.locator('.ProseMirror > p').filter({ hasText: 'After ' }).click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type(' edited')
        await block.click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type(' raw edit')

        // Assert
        await expect
          .poll(() => readFile(join(workspace.root, 'Partial article.md'), 'utf8'))
          .toContain(html + ' raw edit')
        await expect
          .poll(() => readFile(join(workspace.root, 'Partial article.md'), 'utf8'))
          .toContain('After :future[raw] text. edited')
        await expect(page.getByRole('alertdialog')).toHaveCount(0)

        // Act
        await reopenForEditing(page, 'Partial article.md')

        // Assert
        await expect(block).toHaveText(html + ' raw edit')
        await expect(inline).toHaveText(':future[raw]')
        await expect(page.locator('.ProseMirror strong')).toHaveText('bold')
        await expect(page.locator('.ProseMirror > p').filter({ hasText: 'After ' })).toContainText(
          'text. edited',
        )
      })

      test('it preserves unparsed frontmatter before the title while editing and reopening', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const header = '---\ntitle: Metadata\n---'
        const source = header + '\n\n# Frontmatter\n\nEditable body.\n'
        await writeFile(join(workspace.root, 'Frontmatter.md'), source)
        // Act
        await page.reload()
        await page.locator('[role="treeitem"][data-value="Frontmatter.md"]').click()
        // Assert
        const raw = page.locator('.ProseMirror [data-unparsed="block"]')
        await expect(raw).toHaveText(header)
        await expect(page.locator('.ProseMirror h1')).toHaveText('Frontmatter')
        // Act
        await page.locator('.ProseMirror > p').filter({ hasText: 'Editable body.' }).click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type(' edited')
        // Assert
        await expect
          .poll(() => readFile(join(workspace.root, 'Frontmatter.md'), 'utf8'))
          .toBe(header + '\n\n# Frontmatter\n\nEditable body. edited\n')
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        // Act
        await reopenForEditing(page, 'Frontmatter.md')
        // Assert
        await expect(raw).toHaveText(header)
        await expect(page.locator('.ProseMirror h1')).toHaveText('Frontmatter')
        await expect(
          page.locator('.ProseMirror > p').filter({ hasText: 'Editable body.' }),
        ).toContainText('edited')
      })

      test('it preserves every schema node, mark, and attribute across editing and reopening', async ({
        page,
        workspace,
      }) => {
        // Arrange: these checked-in source and JSON fixtures cover the full mounted schema.
        const source = await readFile(
          new URL('../../libs/htmd-ts/fixtures/editor-roundtrip.md', import.meta.url),
          'utf8',
        )
        await mkdir(join(workspace.root, '.images'), { recursive: true })
        await writeFile(join(workspace.root, '.images/roundtrip.png'), png)
        await writeFile(join(workspace.root, 'roundtrip.md'), source)
        await page.route('https://images.example.com/**', (route) =>
          route.fulfill({ body: png, contentType: 'image/png' }),
        )
        await page.reload()
        await page.locator('[role="treeitem"][data-value="roundtrip.md"]').click()

        // Assert
        await expect(page.locator('.ProseMirror h1')).toHaveText('Roundtrip fixture')
        for (const level of [2, 3, 4, 5, 6])
          await expect(page.locator(`.ProseMirror > h${level}`)).toHaveText(`Heading ${level}`)
        const headings = await page
          .locator('.ProseMirror > :is(h1,h2,h3,h4,h5,h6)')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const style = getComputedStyle(element)
              return {
                size: parseFloat(style.fontSize),
                top: parseFloat(style.marginTop),
                bottom: parseFloat(style.marginBottom),
              }
            }),
          )
        expect(headings).toHaveLength(6)
        expect(headings[0]!.top).toBe(0)
        for (let index = 1; index < headings.length; index++) {
          expect(headings[index - 1]!.size).toBeGreaterThan(headings[index]!.size)
          expect(headings[index]!.bottom).toBeLessThanOrEqual(headings[index]!.top)
        }
        const quote = page.locator('.ProseMirror blockquote p')
        expect(
          await quote.evaluate((element) => getComputedStyle(element, '::before').content),
        ).toMatch(/^(none|normal|"")$/)
        expect(
          await quote.evaluate((element) => getComputedStyle(element, '::after').content),
        ).toMatch(/^(none|normal|"")$/)
        const inline = page.locator('.ProseMirror > p').filter({ hasText: 'Normal. ' })
        for (const tag of ['strong', 'em', 's', 'u', 'code', 'a', 'mark', 'span[style*="color"]'])
          await expect(inline.locator(tag).first()).toBeVisible()
        await expect(inline.locator('mark').first()).toHaveCSS(
          'background-color',
          'rgb(59, 130, 246)',
        )
        await expect(inline.locator('span[style*="color"]').first()).toHaveCSS(
          'color',
          'rgb(59, 130, 246)',
        )
        await expect(page.locator('.ProseMirror blockquote')).toContainText('Quoted text')
        await expect(page.locator('.ProseMirror ol')).toHaveAttribute('start', '3')
        await expect(page.locator('.ProseMirror').getByRole('checkbox')).toBeChecked()
        await expect(page.locator('.ProseMirror hr')).toHaveCount(1)
        await expect(page.locator('.ProseMirror .node-codeBlock code')).toContainText(
          'const example',
        )
        await expect(page.locator('.editor-notice-node')).toHaveCount(4)
        await expect(page.locator('.ProseMirror img[alt="Roundtrip image"]')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Linked article', exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'URL mention', exact: true })).toBeVisible()
        await expect(page.locator('.link-preview[data-type="bookmark"]')).toContainText(
          'Bookmark title',
        )
        await expect(page.locator('.link-preview[data-type="embed"]')).toHaveCount(1)
        await expect(page.locator('.ProseMirror [data-unparsed="block"]')).toBeVisible()
        await expect(page.locator('.ProseMirror [data-unparsed="inline"]')).toBeVisible()

        // Act
        await page.locator('.ProseMirror h1').click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type(' updated')
        const path = 'Roundtrip fixture updated.md'

        // Assert: app-visible output is saved; SDK inventory/equality lives in package integration tests.
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8').catch(() => ''))
          .toContain('# Roundtrip fixture updated')
        await expect(page.getByRole('alertdialog')).toHaveCount(0)

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect(page.locator('.ProseMirror h1')).toHaveText('Roundtrip fixture updated')
        await expect(page.locator('.link-preview[data-type="embed"]')).toHaveCount(1)
        await expect(page.locator('.ProseMirror [data-unparsed="block"]')).toBeVisible()
        await expect(page.locator('.ProseMirror [data-unparsed="inline"]')).toBeVisible()
        await expect(page.locator('.editor-notice-node')).toHaveCount(4)
        await expect(page.getByRole('link', { name: 'URL mention', exact: true })).toBeVisible()
        await expect(page.locator('.ProseMirror img[alt="Roundtrip image"]')).toBeVisible()
        await expect(page.locator('.ProseMirror ol')).toHaveAttribute('start', '3')
        await expect(inline.locator('mark').first()).toHaveCSS(
          'background-color',
          'rgb(59, 130, 246)',
        )
        await expect(page.getByRole('alertdialog')).toHaveCount(0)

        // Assert: every supported block and inline family remains rendered after reopening.
        for (const level of [2, 3, 4, 5, 6])
          await expect(page.locator(`.ProseMirror > h${level}`)).toHaveText(`Heading ${level}`)
        for (const tag of ['strong', 'em', 's', 'u', 'code', 'a', 'mark', 'span[style*="color"]'])
          await expect(inline.locator(tag).first()).toBeVisible()
        await expect(page.locator('.ProseMirror blockquote')).toContainText('Quoted text')
        await expect(page.locator('.ProseMirror').getByRole('checkbox')).toBeChecked()
        await expect(page.locator('.ProseMirror hr')).toHaveCount(1)
        await expect(page.locator('.ProseMirror .node-codeBlock code')).toContainText(
          'const example',
        )
        await expect(page.getByRole('link', { name: 'Linked article', exact: true })).toBeVisible()
        await expect(page.locator('.link-preview[data-type="bookmark"]')).toContainText(
          'Bookmark title',
        )
        const sourceAfterEdit = await readFile(join(workspace.root, path), 'utf8')
        expect(sourceAfterEdit).not.toMatch(
          /:{1,}\s*(?:paragraph|heading|text|task-item|task-list|list-item|ordered-list|bullet-list|image|notice)\b/,
        )

        // Act: the persisted YouTube URL retains its timestamp and the published control seeks it.
        await page.route('https://www.youtube-nocookie.com/**', (route) =>
          route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
        )
        const timestamp = page.getByRole('button', { name: '01:30 Start here', exact: true })
        await expect(timestamp).toBeVisible()
        await timestamp.click()

        // Assert
        await expect(page.locator('.link-preview[data-type="embed"] iframe')).toHaveAttribute(
          'src',
          /[?&]start=90(?:&|$)/,
        )
      })

      for (const block of ['paragraph', 'heading']) {
        test(`it omits ${block} alignment while retaining color controls`, async ({ page }) => {
          // Arrange
          if (block === 'paragraph') {
            await enterBody(page, 'Formatting without alignment')
          } else {
            await page.locator('.ProseMirror h1').click()
            await editorSettled(page)
          }

          // Act
          if (block === 'paragraph') {
            await selectLastText(page, 'Formatting without alignment')
          } else {
            await page.keyboard.press('Home')
            await page.keyboard.press('Shift+End')
          }

          // Assert
          await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible()
          for (const name of ['Align left', 'Align center', 'Align right', 'Justify'])
            await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Highlight', exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Text Color', exact: true })).toBeVisible()
        })
      }

      for (const media of [
        {
          command: 'Bookmark',
          dialog: 'Insert bookmark',
          submit: 'Insert',
          url: 'https://example.com/bookmark',
          type: 'bookmark',
        },
        {
          command: 'YouTube',
          dialog: 'Embed YouTube video',
          submit: 'Embed',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          type: 'embed',
        },
      ]) {
        test(`it inserts ${media.command}, saves it, and reopens the same card`, async ({
          page,
          workspace,
        }) => {
          // Arrange
          const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
          await insertBlock(page, media.command)
          const dialog = page.getByRole('dialog', { name: media.dialog, exact: true })

          // Act
          await dialog.locator('input').fill(media.url)
          await dialog.getByRole('button', { name: media.submit, exact: true }).click()

          // Assert
          await expect(page.locator(`.link-preview[data-type="${media.type}"]`)).toHaveCount(1)
          await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain(media.url)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)

          // Act
          await reopenForEditing(page, path)

          // Assert
          await expect(page.locator(`.link-preview[data-type="${media.type}"]`)).toHaveCount(1)
          if (media.type === 'bookmark')
            await expect(
              page.locator('.link-preview[data-type="bookmark"] a').first(),
            ).toHaveAttribute('href', media.url)
          else {
            const source = await readFile(join(workspace.root, path), 'utf8')
            const embed = source.split('\n').find((line) => line.startsWith(':::youtube'))
            expect(embed).toBeDefined()
            expect(embed).not.toContain('title=')
            const video = page.locator('.link-preview[data-type="embed"] [data-youtube-id]')
            await expect(video).toHaveAttribute('data-youtube-id', 'dQw4w9WgXcQ')
            await expect(video.getByRole('heading')).toHaveCount(0)
            const poster = video.locator('button > img')
            await expect(poster).toHaveCSS('margin-top', '0px')
            await expect(poster).toHaveCSS('margin-bottom', '0px')
            const gap = await poster.evaluate((image) => {
              const frame = image.parentElement!
              return (
                image.getBoundingClientRect().top -
                frame.getBoundingClientRect().top -
                parseFloat(getComputedStyle(frame).borderTopWidth)
              )
            })
            expect(gap).toBeCloseTo(0)
          }
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
        })
      }
    })

    test.describe('When saving inline formatting around whitespace', () => {
      for (const mark of [
        {
          name: 'Italic',
          stored: '<em>Italic </em>',
          selected: '<em> Italic  </em>',
          shortcut: 'ControlOrMeta+i',
          tag: 'em',
        },
        {
          name: 'Bold',
          stored: '<strong>Bold </strong>',
          selected: '<strong> Bold  </strong>',
          shortcut: 'ControlOrMeta+b',
          tag: 'strong',
        },
        {
          name: 'Strikethrough',
          stored: '<s>Strikethrough </s>',
          selected: '<s> Strikethrough  </s>',
          shortcut: 'ControlOrMeta+Shift+s',
          tag: 's',
        },
        {
          name: 'Code',
          stored: '<code>Code </code>',
          selected: '<code> Code  </code>',
          shortcut: 'ControlOrMeta+e',
          tag: 'code',
        },
        {
          name: 'Underline',
          stored: '<u>Underline </u>',
          selected: '<u> Underline  </u>',
          shortcut: 'ControlOrMeta+u',
          tag: 'u',
        },
      ]) {
        test(`it saves ${mark.name} typing with a trailing space and resumes after reopening`, async ({
          page,
          workspace,
        }) => {
          // Arrange
          const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
          await enterBody(page, 'Normal text. ')

          // Act
          await page.keyboard.press(mark.shortcut)
          await page.keyboard.type(`${mark.name} `)

          // Assert
          await expect(page.locator(`.ProseMirror ${mark.tag}`)).toHaveText(`${mark.name} `)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toContain(mark.stored)

          // Act
          await reopenForEditing(page, path)

          // Assert
          await expect
            .poll(() => page.locator(`.ProseMirror ${mark.tag}`).textContent())
            .toBe(`${mark.name} `)
          await expect(page.locator('.ProseMirror > p').last()).toHaveText(
            `Normal text. ${mark.name} `,
          )

          // Act
          await page.locator('.ProseMirror > p').last().click()
          await editorSettled(page)
          await page.keyboard.press('End')
          await page.keyboard.press(mark.shortcut)
          await page.keyboard.type('continued')

          // Assert
          await expect
            .poll(() => page.locator(`.ProseMirror ${mark.tag}`).textContent())
            .toBe(`${mark.name} `)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toContain(`${mark.stored}continued`)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
        })

        test(`it preserves spaces around selected ${mark.name} text when saved and reopened`, async ({
          page,
          workspace,
        }) => {
          // Arrange
          const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
          await enterBody(page, `Before  ${mark.name}  `)
          await selectLastText(page, ` ${mark.name}  `)

          // Act
          await page.keyboard.press(mark.shortcut)

          // Assert
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toContain(mark.selected)

          // Act
          await reopenForEditing(page, path)

          // Assert
          await expect
            .poll(() => page.locator(`.ProseMirror ${mark.tag}`).textContent())
            .toBe(` ${mark.name}  `)
          await expect(page.locator('.ProseMirror > p').last()).toHaveText(`Before  ${mark.name}  `)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
        })
      }
    })

    test.describe('When selecting and formatting article text', () => {
      test('it keeps the formatting toolbar beside its selection after scrolling and resizing', async ({
        page,
      }) => {
        // Arrange
        await enterBody(
          page,
          `${Array.from({ length: 20 }, (_, index) => `Paragraph ${index}`).join('\n')}\nToolbar anchor`,
        )
        await selectLastText(page, 'Toolbar anchor')
        const toolbar = page.getByRole('toolbar', { name: 'Text formatting' })

        for (const width of [1120, 900]) {
          // Act
          await page.setViewportSize({ width, height: 640 })
          await page.locator('.ProseMirror > p').last().scrollIntoViewIfNeeded()

          // Assert
          await expect(toolbar).toBeVisible()
          await expect
            .poll(async () => {
              const anchor = await page.evaluate(() => {
                const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
              })
              const box = (await toolbar.boundingBox())!
              const left = Math.min(
                Math.max((anchor.left + anchor.right - box.width) / 2, 8),
                Math.max(width - box.width - 8, 8),
              )
              return Math.max(
                Math.abs(box.x - left),
                Math.min(
                  Math.abs(anchor.top - box.y - box.height - 8),
                  Math.abs(box.y - anchor.bottom - 8),
                ),
              )
            })
            .toBeLessThan(2)
          const box = (await toolbar.boundingBox())!
          expect(box.x).toBeGreaterThanOrEqual(8)
          expect(box.x + box.width).toBeLessThanOrEqual(width - 8)
          expect(box.y).toBeGreaterThanOrEqual(8)
          expect(box.y + box.height).toBeLessThanOrEqual(632)
        }

        // Act
        await page.keyboard.press('Escape')

        // Assert
        await expect(toolbar).toBeHidden()
      })

      test('it saves bold text and preserves the formatting after reopening', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await enterBody(page, 'Selected text')
        await selectLastText(page, 'Selected text')
        const toolbar = page.getByRole('toolbar', { name: 'Text formatting' })

        // Act
        await toolbar.getByRole('button', { name: 'Bold', exact: true }).click()

        // Assert
        await expect(page.locator('.ProseMirror strong')).toHaveText('Selected text')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('**Selected text**')

        // Act
        await page.keyboard.press('Escape')
        await reopenForEditing(page, path)

        // Assert
        await expect(page.locator('.ProseMirror strong')).toHaveText('Selected text')
      })

      test('it undoes and redoes bold formatting through the keyboard', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await enterBody(page, 'History text')
        await selectLastText(page, 'History text')
        await page.getByRole('button', { name: 'Bold', exact: true }).click()
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('**History text**')

        // Act
        await page.keyboard.press('ControlOrMeta+z')

        // Assert
        await expect(page.locator('.ProseMirror strong')).toHaveCount(0)
        await expect(page.locator('.ProseMirror')).toContainText('History text')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .not.toContain('**History text**')

        // Act
        await page.keyboard.press('ControlOrMeta+Shift+z')

        // Assert
        await expect(page.locator('.ProseMirror strong')).toHaveText('History text')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('**History text**')
      })

      for (const format of [
        {
          name: 'Highlight',
          color: 'Blue',
          selector: 'mark',
          property: 'background-color',
          value: 'var(--chart-3)',
          stored: '<mark style="background-color:var(--chart-3)">Colored text </mark>',
        },
        {
          name: 'Text Color',
          color: 'Red',
          selector: 'span[style*="color"]',
          property: 'color',
          value: 'var(--danger)',
          stored: '<span style="color:var(--danger)">Colored text </span>',
        },
      ]) {
        test(`it saves ${format.name} and preserves its actual color after reopening`, async ({
          page,
          workspace,
        }) => {
          // Arrange
          const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
          await enterBody(page, 'Colored text ')
          await selectLastText(page, 'Colored text ')

          // Act
          await page.getByRole('button', { name: format.name, exact: true }).click()
          const palette = page.getByRole('button', { name: format.color, exact: true })
          const color = await palette
            .locator('div')
            .first()
            .evaluate((element) => getComputedStyle(element).backgroundColor)
          expect(
            await palette
              .locator('div')
              .first()
              .evaluate((element) => (element as HTMLElement).style.backgroundColor),
          ).toBe(format.value)
          await palette.click()

          // Assert
          const formatted = page.locator(`.ProseMirror ${format.selector}`)
          await expect(formatted).toHaveCSS(format.property, color)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toContain(format.stored)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)

          // Act
          await reopenForEditing(page, path)

          // Assert
          await expect(formatted).toHaveCSS(format.property, color)
          await expect.poll(() => formatted.textContent()).toBe('Colored text ')
          await expect(page.getByRole('alertdialog')).toHaveCount(0)

          // Act
          await page.locator('.ProseMirror > p').last().click()
          await editorSettled(page)
          await page.keyboard.press('End')
          await selectLastText(page, 'Colored text ')

          // Assert
          const control = page.getByRole('button', { name: format.name, exact: true })
          await expect(control).toHaveAttribute('data-state', 'on')
          await expect(control.locator('span[style]')).toHaveCSS('background-color', color)
        })
      }
    })

    test.describe('When navigating a long slash menu', () => {
      test('it scrolls the selected command into view and inserts it with Enter', async ({
        page,
      }) => {
        // Arrange
        await enterBody(page, '/')
        const menu = page.locator('[data-slash-menu-scroll]')

        // Act
        for (let index = 0; index < 30; index++) await page.keyboard.press('ArrowDown')

        // Assert
        const selected = page.locator('[data-slash-selected]')
        await expect(selected).toContainText('Bookmark')
        await expect(selected).toBeInViewport()
        await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

        // Act
        await page.keyboard.press('Enter')

        // Assert
        await expect(page.getByRole('dialog', { name: 'Insert bookmark' })).toBeVisible()
        await expect(menu).toHaveCount(0)
      })

      test('it keeps filtered commands reachable near the viewport edge and dismisses them', async ({
        page,
      }) => {
        // Arrange
        await page.setViewportSize({ width: 1000, height: 480 })
        await enterBody(
          page,
          Array.from({ length: 18 }, (_, index) => `Paragraph ${index}`).join('\n'),
        )
        await page.keyboard.press('Enter')

        // Act
        await page.keyboard.type('/')
        await page.keyboard.type('you')

        // Assert
        const menu = page.locator('[data-slash-menu-surface]')
        await expect(page.getByRole('option', { name: /YouTube/ })).toBeVisible()
        const box = await menu.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(480)

        // Act
        await page.keyboard.press('Escape')
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        await edit(page, ' continued')

        // Assert
        await expect(menu).toHaveCount(0)
        await expect(page.locator('.ProseMirror')).toContainText('/you continued')
      })
    })

    test.describe('When an insertion overlay locks the article scroll', () => {
      test('it locks only the article container and restores scrolling after cancellation', async ({
        page,
      }) => {
        // Arrange
        await enterBody(
          page,
          Array.from({ length: 24 }, (_, index) => `Long article paragraph ${index}`).join('\n'),
        )
        await page.keyboard.press('Enter')
        await page.keyboard.type('/bookmark')
        await page.getByRole('option', { name: 'Bookmark', exact: true }).click()
        const scroll = page.locator('.article-scroll')
        const dialog = page.getByRole('dialog', { name: 'Insert bookmark' })
        const before = await scroll.evaluate((element) => element.scrollTop)
        const bodyOverflow = await page
          .locator('body')
          .evaluate((element) => element.style.overflow)

        // Act
        await scroll.hover({ position: { x: 8, y: 8 } })
        await page.mouse.wheel(0, -240)

        // Assert
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(before)
        await expect(dialog).toBeInViewport()
        expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe(
          bodyOverflow,
        )

        // Act
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await scroll.hover({ position: { x: 8, y: 8 } })
        await page.mouse.wheel(0, -240)

        // Assert
        await expect(dialog).toHaveCount(0)
        await expect
          .poll(() => scroll.evaluate((element) => element.scrollTop))
          .toBeLessThan(before)
      })
    })

    test.describe('When editing with a registered insertion overlay open', () => {
      for (const edge of ['top', 'bottom'] as const) {
        test(`it keeps a resized and reopened image form beside the cursor near the ${edge}`, async ({
          page,
        }) => {
          // Arrange
          await page.setViewportSize({ width: 1000, height: 640 })
          await enterBody(
            page,
            edge === 'top'
              ? 'Cursor anchor '
              : `${Array.from({ length: 20 }, (_, index) => `Paragraph ${index}`).join('\n')}\nCursor anchor `,
          )
          const dialog = page.getByRole('dialog', { name: 'Insert image' })

          for (let attempt = 0; attempt < 2; attempt++) {
            // Act
            await page.keyboard.type('/image')
            await page.getByRole('option', { name: 'Image', exact: true }).click()

            for (const tab of ['Upload', 'URL']) {
              await dialog.getByRole('tab', { name: tab, exact: true }).click()

              // Assert: compare visible DOM geometry without invoking editor commands.
              await expect
                .poll(async () => {
                  const anchor = await page
                    .locator('.ProseMirror > p')
                    .last()
                    .evaluate((paragraph) => {
                      const range = document.createRange()
                      range.selectNodeContents(paragraph.firstChild!)
                      range.collapse(false)
                      const rect = range.getBoundingClientRect()
                      return { left: rect.left, top: rect.top, bottom: rect.bottom }
                    })
                  const box = await dialog.boundingBox()
                  if (!box) return Infinity
                  return Math.max(
                    Math.abs(box.x - anchor.left),
                    Math.min(
                      Math.abs(box.y - anchor.bottom - 4),
                      Math.abs(anchor.top - box.y - box.height - 4),
                    ),
                  )
                })
                .toBeLessThan(2)
              const box = (await dialog.boundingBox())!
              expect(box.y).toBeGreaterThanOrEqual(16)
              expect(box.y + box.height).toBeLessThanOrEqual(624)
            }

            // Act
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await page.locator('.ProseMirror > p').last().click()
            await editorSettled(page)
            await page.keyboard.press('End')

            // Assert
            await expect(dialog).toHaveCount(0)
          }
        })
      }

      test('it keeps the upload draft and inserts at the mapped anchor after earlier text changes', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const title = initialWorkspace === 'empty' ? 'Untitled' : 'Markdown'
        await enterBody(page, 'Anchor marker')
        await insertBlock(page, 'Image')
        const dialog = page.getByRole('dialog', { name: 'Insert image' })
        await dialog.locator('input[type="file"]').setInputFiles({
          name: 'mapped.png',
          mimeType: 'image/png',
          buffer: png,
        })
        await expect(dialog.getByText('mapped.png', { exact: true })).toBeVisible()

        // Act
        await page.locator('.ProseMirror h1').click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type(' mapped')

        // Assert
        await expect(page.locator('.ProseMirror h1')).toHaveText(`${title} mapped`)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('mapped.png', { exact: true })).toBeVisible()
        await expect(page.locator('.document-status')).toContainText('Saved')

        // Act
        await dialog.getByRole('button', { name: 'Upload', exact: true }).click()

        // Assert
        const path = `${title} mapped.md`
        await expect(page.locator('.ProseMirror img')).toBeVisible()
        await expect(dialog).toHaveCount(0)
        await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain('.images/')
        const source = await readFile(join(workspace.root, path), 'utf8')
        expect(source).toContain('Anchor marker')
        const imageOffset = source.search(/!\[/)
        expect(imageOffset).toBeGreaterThan(-1)
        expect(source.indexOf('Anchor marker')).toBeLessThan(imageOffset)
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
      })

      test('it dismisses the overlay when its document anchor is removed', async ({ page }) => {
        // Arrange
        await insertBlock(page, 'Image')
        const dialog = page.getByRole('dialog', { name: 'Insert image' })
        await expect(dialog).toBeVisible()

        // Act
        await page.locator('.ProseMirror').focus()
        await editorSettled(page)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('Backspace')

        // Assert
        await expect(dialog).toHaveCount(0)
        await expect(page.getByRole('alertdialog')).toHaveCount(0)

        // Act
        await page.keyboard.type('After removal')

        // Assert
        await expect(page.locator('.ProseMirror')).toContainText('After removal')
      })
    })

    test.describe('When validating insertion forms', () => {
      for (const form of [
        { command: 'Bookmark', dialog: 'Insert bookmark', input: 'input[type="url"]' },
        { command: 'Image', dialog: 'Insert image', input: 'input[type="url"]' },
        { command: 'YouTube', dialog: 'Embed YouTube video', input: 'input' },
      ]) {
        test(`it keeps ${form.command} validation beside its input and cancels without inserting a block`, async ({
          page,
        }) => {
          // Arrange
          await enterBody(page, `/${form.command.toLowerCase()}`)
          // This short command occupies one text line. Measure that rendered line;
          // WebKit reports a zero rectangle for its collapsed browser selection.
          const caret = await page
            .locator('.ProseMirror p')
            .last()
            .evaluate((paragraph) => {
              const range = document.createRange()
              range.selectNodeContents(paragraph)
              const rect = range.getBoundingClientRect()
              return { top: rect.top, bottom: rect.bottom }
            })
          await page.getByRole('option', { name: form.command, exact: true }).click()
          await editorSettled(page)
          const dialog = page.getByRole('dialog', { name: form.dialog, exact: true })
          if (form.command === 'Image')
            await dialog.getByRole('tab', { name: 'URL', exact: true }).click()
          const input = dialog.locator(form.input)

          // Act
          await input.fill('not-a-url')
          await input.press('Enter')

          // Assert
          const error = dialog.getByRole('alert')
          await expect(error).toBeVisible()
          const [inputBox, errorBox, dialogBox] = await Promise.all([
            input.boundingBox(),
            error.boundingBox(),
            dialog.boundingBox(),
          ])
          expect(inputBox).not.toBeNull()
          expect(errorBox).not.toBeNull()
          expect(dialogBox).not.toBeNull()
          expect(errorBox!.y - (inputBox!.y + inputBox!.height)).toBeGreaterThanOrEqual(0)
          expect(errorBox!.y - (inputBox!.y + inputBox!.height)).toBeLessThanOrEqual(8)
          expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
          expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(640)
          expect(caret).not.toBeNull()
          const aboveGap = caret!.top - (dialogBox!.y + dialogBox!.height)
          const belowGap = dialogBox!.y - caret!.bottom
          expect(Math.min(Math.abs(aboveGap), Math.abs(belowGap))).toBeLessThanOrEqual(8)
          await expect(
            page.locator(
              '.ProseMirror img, .ProseMirror iframe, .ProseMirror [data-type="linkPreview"]',
            ),
          ).toHaveCount(0)

          // Act
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

          // Assert
          await expect(dialog).toHaveCount(0)
          await expect(page.getByRole('alertdialog')).toHaveCount(0)
          await expect(
            page.locator(
              '.ProseMirror img, .ProseMirror iframe, .ProseMirror [data-type="linkPreview"]',
            ),
          ).toHaveCount(0)
        })
      }

      test('it removes an open insertion overlay when another article is selected', async ({
        page,
      }) => {
        // Arrange
        await createArticle(page)
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
        await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })
        await insertBlock(page, 'Image')
        await expect(page.getByRole('dialog', { name: 'Insert image' })).toBeVisible()

        // Act
        await page
          .locator(
            `[role="treeitem"][data-value="${initialWorkspace === 'empty' ? 'Untitled 2.md' : 'Untitled.md'}"]`,
          )
          .click()

        // Assert
        await expect(page.getByRole('dialog', { name: 'Insert image' })).toHaveCount(0)
        await expect(page.locator('.ProseMirror')).toBeVisible()
      })
    })

    test.describe('When editing separate numbered lists', () => {
      test('it saves and reopens a separate empty list without merging its neighbors', async ({
        page,
        workspace,
      }) => {
        // Arrange
        await writeFile(
          join(workspace.root, 'lists.md'),
          '# Lists\n\n1. First\n\n1) <p></p>\n\n3. Third\n',
        )
        await page.reload()
        await page.locator('[role="treeitem"][data-value="lists.md"]').click()
        const lists = page.locator('.ProseMirror > ol')
        await expect(lists).toHaveCount(3)

        // Act
        await lists.nth(2).locator('p').click()
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
        await page.keyboard.type(' updated')

        // Assert
        await expect(page.getByRole('status')).toContainText('Saved')
        await expect
          .poll(() => readFile(join(workspace.root, 'lists.md'), 'utf8'))
          .toContain('1) <p></p>')
        await reopenForEditing(page, 'lists.md')
        await expect(lists).toHaveCount(3)
        await expect(lists.nth(0)).toHaveText('First')
        await expect(lists.nth(2)).toHaveText('Third updated')
        await expect(lists.nth(1).locator('p')).toBeEmpty()
        await expect(lists.nth(2)).toHaveAttribute('start', '3')
      })
    })

    test.describe('When changing a code block language', () => {
      test('it renders syntax without a nested box or command placeholder and preserves the language', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await insertBlock(page, 'Code Block')
        const block = page.locator('.ProseMirror [data-code-block]')
        const code = block.locator('pre.editor-code-content')

        // Act
        await block.getByRole('combobox').click()
        await page.getByRole('option', { name: 'Python', exact: true }).click()
        await code.locator('code').click()
        await editorSettled(page)
        await page.keyboard.type('def answer(): return "yes"')

        // Assert
        await expect(block.getByRole('combobox')).toContainText('Python')
        await expect(block.locator('[data-placeholder]')).toHaveCount(0)
        const selector = await block.getByRole('combobox').boundingBox()
        const copy = await block
          .getByRole('button', { name: 'Copy code', exact: true })
          .boundingBox()
        expect(selector).not.toBeNull()
        expect(copy).not.toBeNull()
        expect(selector!.x + selector!.width).toBeLessThan(copy!.x)
        expect(await code.evaluate((element) => element.textContent)).toBe(
          'def answer(): return "yes"',
        )
        await expect(code).toHaveCSS('margin-bottom', '0px')
        await expect(code).toHaveCSS('margin-top', '0px')
        await expect(code).toHaveCSS('border-top-width', '0px')
        await expect(code.locator('.hljs-keyword').first()).toBeVisible()
        await expect(code.locator('.hljs-string').first()).toBeVisible()
        await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain('```python')

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect(block.getByRole('combobox')).toContainText('Python')
        await expect(code).toContainText('def answer(): return "yes"')
      })
    })

    test.describe('When editing a selected link', () => {
      test('it preserves boundary spaces and the link destination when saved and reopened', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await enterBody(page, 'Before  linked  ')
        await selectLastText(page, ' linked  ')

        // Act
        await page.getByRole('button', { name: 'Link', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Edit link' })
        await dialog.getByPlaceholder('Enter URL').fill('https://example.com/article')
        await dialog.getByPlaceholder('Enter URL').press('Enter')

        // Assert
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain(
            '<a href="https://example.com/article" target="_blank" rel="noopener noreferrer" class="text-primary underline"> linked  </a>',
          )

        // Act
        await reopenForEditing(page, path)

        // Assert
        await expect.poll(() => page.locator('.ProseMirror a').textContent()).toBe(' linked  ')
        await expect(page.locator('.ProseMirror a')).toHaveAttribute(
          'href',
          'https://example.com/article',
        )
        await expect(page.locator('.ProseMirror > p').last()).toHaveText('Before  linked  ')

        // Act
        await page.locator('.ProseMirror > p').last().click()
        await editorSettled(page)
        await page.keyboard.press('End')
        await page.keyboard.type('after')

        // Assert
        await expect.poll(() => page.locator('.ProseMirror a').textContent()).toBe(' linked  after')
        await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain('after')
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
      })

      test('it saves the link target and removes it through the link editor', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await enterBody(page, 'Linked text')
        await selectLastText(page, 'Linked text')

        // Act
        await page.getByRole('button', { name: 'Link', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Edit link' })
        await dialog.getByPlaceholder('Enter URL').fill('https://example.com/article')
        await dialog.getByPlaceholder('Enter URL').press('Enter')

        // Assert
        await expect(page.locator('.ProseMirror a')).toHaveAttribute(
          'href',
          'https://example.com/article',
        )
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('[Linked text](https://example.com/article)')

        // Act
        await reopenForEditing(page, path)
        await edit(page, '')
        await selectLastText(page, 'Linked text')
        await page.getByRole('button', { name: 'Link', exact: true }).click()
        await expect(
          page.getByRole('dialog', { name: 'Edit link' }).getByPlaceholder('Enter URL'),
        ).toHaveValue('https://example.com/article')
        await page
          .getByRole('dialog', { name: 'Edit link' })
          .getByRole('button', { name: 'Remove link' })
          .click()

        // Assert
        await expect(page.locator('.ProseMirror a')).toHaveCount(0)
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .not.toContain('https://example.com/article')
        await expect(page.locator('.ProseMirror')).toContainText('Linked text')
      })
    })

    test.describe('When opening the link editor in a long article', () => {
      test('it anchors the link input below the formatting toolbar and restores article scrolling when closed', async ({
        page,
      }) => {
        // Arrange
        await enterBody(
          page,
          Array.from({ length: 24 }, (_, index) => `Paragraph ${index}`).join('\n'),
        )
        await page.keyboard.press('Enter')
        await page.keyboard.type('Link selection')
        await selectLastText(page, 'Link selection')
        const scroll = page.locator('.article-scroll')

        // Act
        await page.getByRole('button', { name: 'Link', exact: true }).click()

        // Assert
        const toolbar = page.getByRole('toolbar', { name: 'Text formatting' })
        const dialog = page.getByRole('dialog', { name: 'Edit link' })
        await expect(dialog).toBeVisible()
        const [toolbarBox, dialogBox] = await Promise.all([
          toolbar.boundingBox(),
          dialog.boundingBox(),
        ])
        expect(toolbarBox).not.toBeNull()
        expect(dialogBox).not.toBeNull()
        expect(dialogBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height - 1)
        expect(dialogBox!.y).toBeLessThanOrEqual(toolbarBox!.y + toolbarBox!.height + 24)
        const before = await scroll.evaluate((element) => element.scrollTop)

        // Act
        await scroll.hover({ position: { x: 8, y: 8 } })
        await page.mouse.wheel(0, -200)

        // Assert
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(before)

        // Act
        await dialog.getByPlaceholder('Enter URL').press('Enter')
        await scroll.hover({ position: { x: 8, y: 8 } })
        await page.mouse.wheel(0, -200)

        // Assert
        await expect(dialog).toHaveCount(0)
        await expect
          .poll(() => scroll.evaluate((element) => element.scrollTop))
          .toBeLessThan(before)
      })
    })

    test.describe('When pasting a bare URL', () => {
      for (const replaceSelection of [false, true]) {
        test(
          replaceSelection
            ? 'it replaces selected text with the pasted URL and preserves the link after reopening'
            : 'it inserts a normal link without a choice menu and preserves it after reopening',
          async ({ page, workspace }) => {
            // Arrange: the browser clipboard is populated through a rendered URL input.
            const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
            const url = 'https://example.com/pasted-link'
            await insertBlock(page, 'Image')
            const dialog = page.getByRole('dialog', { name: 'Insert image' })
            await dialog.getByRole('tab', { name: 'URL', exact: true }).click()
            const input = dialog.locator('input[type="url"]')
            await input.fill(url)
            await input.press('ControlOrMeta+a')
            await input.press('ControlOrMeta+c')
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await page.locator('.ProseMirror p').last().click()
            await editorSettled(page)
            if (replaceSelection) {
              await page.keyboard.type('Replace this')
              await selectLastText(page, 'Replace this')
            }

            // Act
            await page.keyboard.press('ControlOrMeta+v')

            // Assert
            await expect(page.locator('.ProseMirror a')).toHaveAttribute('href', url)
            await expect(page.locator('.ProseMirror a')).toHaveText(url)
            await expect(page.locator('.ProseMirror')).not.toContainText('Replace this')
            await expect(page.getByRole('menu')).toHaveCount(0)
            await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain(url)

            // Act
            await reopenForEditing(page, path)

            // Assert
            await expect(page.locator('.ProseMirror a')).toHaveAttribute('href', url)
            await expect(page.locator('.ProseMirror a')).toHaveText(url)
          },
        )
      }
    })

    test.describe('When an image upload fails', () => {
      test('it preserves the article and allows the selected image to be retried', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const path = initialWorkspace === 'empty' ? 'Untitled.md' : 'same.md'
        await insertBlock(page, 'Image')
        await expect(page.locator('.document-status')).toContainText('Saved')
        const original = await readFile(join(workspace.root, path), 'utf8')
        workspace.failImageUploads = true
        await page
          .locator('input[type="file"]')
          .setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: png })
        const dialog = page.getByRole('dialog', { name: 'Insert image' })

        // Act
        await dialog.getByRole('button', { name: 'Upload', exact: true }).last().click()

        // Assert
        await expect(dialog.getByRole('alert')).toContainText('Upload failed. Please try again.')
        await expect(page.locator('.ProseMirror img')).toHaveCount(0)
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(original)

        // Act
        workspace.failImageUploads = false
        await dialog.getByRole('button', { name: 'Upload', exact: true }).last().click()

        // Assert
        await expect(page.locator('.ProseMirror img')).toBeVisible()
        await expect.poll(() => readFile(join(workspace.root, path), 'utf8')).toContain('.images/')
        await expect(dialog).toHaveCount(0)
        expect(await readdir(join(workspace.root, '.images'))).toHaveLength(1)
      })
    })

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
        await expect(page.locator('.ProseMirror h1')).toHaveText(
          initialWorkspace === 'empty' ? 'Untitled' : 'Markdown',
        )
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
        await reopenForEditing(page, path)
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
        await reopenForEditing(page, path)
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
      await page.getByRole('combobox', { name: 'Notice type' }).click()
      await page.getByRole('option', { name: 'Warning', exact: true }).click()
      await expect(page.getByRole('combobox', { name: 'Notice type' })).toBeFocused()
      await page.getByLabel('Notice title').press('Enter')
      await editorSettled(page)
      await page.keyboard.type('Notice body edited')
      // Assert
      await expect.poll(() => readFile(saved, 'utf8')).toContain('> [!WARNING] Important detail')
      await expect.poll(() => readFile(saved, 'utf8')).toContain('Notice body edited')
      // Act
      await reopenForEditing(page, path)
      // Assert
      await expect(page.getByLabel('Notice title')).toHaveValue('Important detail')
      await expect(page.getByRole('combobox', { name: 'Notice type' })).toHaveText('Warning')
      await expect(block).toContainText('Notice body edited')
      // Act
      await removeBlock(page, block)
      // Assert
      await expect(block).toHaveCount(0)
      await expect.poll(() => readFile(saved, 'utf8')).not.toContain('[!WARNING]')
      await reopenForEditing(page, path)
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
      await reopenForEditing(page, path)
      await removeBlock(page, block)
      // Assert
      await expect(block).toHaveCount(0)
      await expect.poll(() => readFile(saved, 'utf8')).not.toContain('---')
      await reopenForEditing(page, path)
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
      const caption = page.locator('.ProseMirror .caption-input')
      await caption.fill('An edited caption')
      await caption.press('Enter')
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.classList.contains('ProseMirror')))
        .toBe(true)
      await editorSettled(page)
      await page.keyboard.type('After caption')
      // Assert
      await expect(page.locator('.ProseMirror p')).toContainText(['After caption'])
      await expect.poll(() => readFile(saved, 'utf8')).toContain('"An edited caption"')
      expect(await readFile(saved, 'utf8')).not.toContain('data:')
      // Act
      await reopenForEditing(page, path)
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
      await reopenForEditing(page, path)
      await expect(page.locator('.ProseMirror img')).toHaveCount(0)
    })
  })
}

// Fixtures --------------------------------------------------------------------
async function enterBody(page: Page, text: string) {
  await edit(page, '')
  await page.keyboard.press('Enter')
  const paragraph = page.locator('.ProseMirror > p').last()
  await paragraph.click()
  await editorSettled(page)
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

async function selectLastText(page: Page, text: string) {
  await editorSettled(page)
  for (let index = 0; index < text.length; index++) await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text)
  await editorSettled(page)
}

async function insertBlock(page: Page, name: string) {
  await enterBody(page, '')
  await page.keyboard.type(`/${name.split(' ')[0]!.toLowerCase()}`)
  await page.getByRole('option', { name, exact: true }).click()
  await editorSettled(page)
}

async function reopenForEditing(page: Page, path: string) {
  await expect(page.locator('.document-status')).toContainText('Saved')
  await page.reload()
  await page.locator(`[role="treeitem"][data-value=${JSON.stringify(path)}]`).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.locator('.ProseMirror').click({ position: { x: 2, y: 2 } })
  await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
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
  // Establish editor focus through a rendered block before selecting it. Focusing the
  // root alone can race ProseMirror's focus selection and reset the range to the title.
  await block.click()
  await page.locator('.ProseMirror').focus()
  await editorSettled(page)
  // ProseMirror may normalize the selection just after focus. Reapply this browser
  // selection until it stays selected; never retry deletion or call editor commands.
  await expect(async () => {
    await block.evaluate((element) => {
      const range = document.createRange()
      range.selectNode(element.closest('.ProseMirror > *') ?? element)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await editorSettled(page)
    expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false)
  }).toPass({ timeout: 3000, intervals: [100, 250] })
  await page.keyboard.press('Backspace')
  // Editable wrappers can first empty their content; Backspace again lifts the empty block.
  for (let attempt = 0; attempt < 3 && (await block.count()); attempt++) {
    await page.keyboard.press('Backspace')
  }
}
