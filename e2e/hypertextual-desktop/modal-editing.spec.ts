import { test, expect, png } from './fixtures'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const path = 'Drafts/Modes.md'
const source =
  '# Modes\n\nA paragraph to edit.\n\n> [!NOTE] Remember\n> Body text.\n\n```javascript\nconst value = 1\n```\n\n![Photo](.images/photo.png "Photo caption")\n\n:::youtube {url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"} :::\n\n' +
  Array.from({ length: 60 }, (_, index) => `Paragraph ${index}.`).join('\n\n') +
  '\n'

test.beforeEach(async ({ page, workspace }) => {
  await mkdir(join(workspace.root, 'Drafts/.images'), { recursive: true })
  await writeFile(join(workspace.root, 'Drafts/.images/photo.png'), png)
  await writeFile(join(workspace.root, path), source)
  await writeFile(join(workspace.root, 'Other.md'), '# Other\n\nAnother article.\n')
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
  )
  await page.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ body: png, contentType: 'image/png' }),
  )
  await page.reload()
  await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
  await page.locator(`[role="treeitem"][data-value="${path}"]`).click()
})

test.describe(
  'Given the user is in view mode',
  { tag: ['@desktop', '@editor', '@modal-editing'] },
  () => {
    test.describe('When the user views a page', () => {
      test(
        'it shows reading widgets and the article breadcrumb without editing controls',
        { tag: '@smoke' },
        async ({ page, workspace }) => {
          // Arrange
          const article = page.getByRole('main', { name: 'Article' })
          const prose = page.locator('.ProseMirror')

          // Act
          await expect(prose).toBeVisible()

          // Assert
          await expect(prose).toHaveAttribute('contenteditable', 'false')
          await expect(article.getByRole('combobox')).toHaveCount(0)
          await expect(prose.locator('input')).toHaveCount(0)
          await expect(page.locator('.editor-notice-node')).toContainText('Remember')
          await expect(prose.locator('figcaption')).toHaveText('Photo caption')
          await expect(page.getByRole('button', { name: 'Remove image' })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Remove preview' })).toHaveCount(0)
          await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)
          await expect(page.locator('.document-heading')).toHaveCount(0)
          await expect(page.locator('.titlebar')).not.toContainText('hypertextual')
          const breadcrumb = page.getByRole('navigation', { name: 'Article path' })
          await expect(breadcrumb.getByRole('listitem')).toHaveText([
            'Local workspace',
            'Drafts',
            'Modes',
          ])
          await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Modes')
          expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
        },
      )
    })

    test.describe('When the user scrolls with the mouse', () => {
      test('it scrolls the editor without enabling edits or changing the file', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const scroll = page.getByRole('region', { name: 'Article content' })
        await scroll.hover()

        // Act
        await page.mouse.wheel(0, 500)

        // Assert
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
      })
    })

    test.describe('When the user uses up and down arrow keys', () => {
      test('it scrolls the editor without changing the article', async ({ page, workspace }) => {
        // Arrange
        const scroll = page.getByRole('region', { name: 'Article content' })
        await expect(scroll).toBeFocused()

        // Act
        for (let index = 0; index < 6; index++)
          await page.keyboard.press('ArrowDown', { delay: 80 })

        // Assert
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        const down = await scroll.evaluate((element) => element.scrollTop)

        // Act
        for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowUp', { delay: 80 })

        // Assert
        await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeLessThan(down)
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
      })
    })

    test.describe('When the user clicks on the editor', () => {
      test(
        'it enables editing and shows native widget controls',
        { tag: '@smoke' },
        async ({ page }) => {
          // Arrange
          const prose = page.locator('.ProseMirror')

          // Act
          await prose.locator('h1').click()

          // Assert
          await expect(prose).toHaveAttribute('contenteditable', 'true')
          await expect(prose).toBeFocused()
          await expect(page.getByLabel('Notice title')).toHaveValue('Remember')
          await expect(
            page.getByRole('main', { name: 'Article' }).getByRole('combobox'),
          ).toHaveCount(2)
        },
      )
    })

    test.describe('When the user plays a video', () => {
      test('it plays without enabling editing or saving the article', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const video = page.locator('.ProseMirror [data-youtube-id]')
        await expect(video.getByRole('heading')).toHaveCount(0)

        // Act
        await video.getByRole('button', { name: 'Play video', exact: true }).click()

        // Assert
        await expect(video.locator('iframe')).toHaveAttribute(
          'src',
          /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
        )
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
      })
    })
  },
)

test.describe(
  'Given the user is in edit mode',
  { tag: ['@desktop', '@editor', '@modal-editing'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('.ProseMirror h1').click()
      await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
    })

    test.describe('When the user edits text', () => {
      test('it saves text entered through the rendered editor', async ({ page, workspace }) => {
        // Arrange
        const paragraph = page.locator('.ProseMirror > p').first()
        await paragraph.click()
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')

        // Act
        await page.keyboard.type(' Updated.')

        // Assert
        await expect(paragraph).toHaveText('A paragraph to edit. Updated.')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('A paragraph to edit. Updated.')
      })
    })

    test.describe('When the user presses Escape', () => {
      test('it disables editing and focuses the editor scroll region', async ({ page }) => {
        // Arrange
        await expect(page.locator('.ProseMirror')).toBeFocused()

        // Act
        await page.keyboard.press('Escape')

        // Assert
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()
        await expect(page.getByLabel('Notice title')).toHaveCount(0)
        await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)
      })
    })

    test.describe('When the user presses Escape in a notice title', () => {
      test('it saves the title and returns to view state', async ({ page, workspace }) => {
        // Arrange
        const title = page.getByLabel('Notice title')
        await title.fill('Updated')

        // Act
        await title.press('Escape')

        // Assert
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        await expect(title).toHaveCount(0)
        await expect(page.locator('.editor-notice-node')).toContainText('Updated')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('[!NOTE] Updated')
      })
    })

    test.describe('When the user uses arrow keys in text', () => {
      test('it moves the native caret within the current paragraph', async ({ page }) => {
        // Arrange
        const paragraph = page.locator('.ProseMirror > p').first()
        await paragraph.click()
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')

        // Act
        await page.keyboard.press('ArrowLeft')
        await page.keyboard.type('!')

        // Assert
        await expect(paragraph).toHaveText('A paragraph to edit!.')
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')
      })
    })

    test.describe('When the user presses Escape in a widget selector', () => {
      test('it closes the portaled selector and disables editing', async ({ page }) => {
        // Arrange
        await page.getByRole('combobox', { name: 'Notice type' }).click()
        await expect(page.getByRole('option', { name: 'Warning', exact: true })).toBeVisible()

        // Act
        await page.keyboard.press('Escape')

        // Assert
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        await expect(page.getByRole('option', { name: 'Warning', exact: true })).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()
      })
    })

    test.describe('When the user opens another article', () => {
      test('it resets editability for the newly selected article', async ({ page }) => {
        // Arrange
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true')

        // Act
        await page.locator('[role="treeitem"][data-value="Other.md"]').click()

        // Assert
        await expect(page.locator('.ProseMirror h1')).toHaveText('Other')
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')
        await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()
      })
    })
  },
)
