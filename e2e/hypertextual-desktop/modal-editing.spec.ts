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
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()
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
          await expect(prose).toHaveAttribute('data-modal-mode', 'normal')
          await expect(prose.locator('[data-pm-modal-cursor="normal"]')).toHaveCount(1)
          await expect(page.getByTestId('which-key-mode-badge')).toHaveText('helix · normal')
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

    test.describe('When the user navigates with Helix motions and z scroll commands', () => {
      test('it moves across text and atom blocks, blocks unbound keys, and scrolls the viewport', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const prose = page.locator('.ProseMirror')
        const scroll = page.getByRole('region', { name: 'Article content' })
        await expect(scroll).toBeFocused()

        // Act: unbound printable key in normal mode should not mutate document
        await page.keyboard.press('q')
        await page.keyboard.press('w')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')

        // Assert: 4 j steps from h1 -> p -> notice -> codeBlock -> imageNode
        await expect(prose.locator('[data-pm-modal-node-selection="normal"]')).toHaveCount(1)
        await expect(prose).toHaveAttribute('contenteditable', 'false')

        // Act: scroll down with zj and jump to document end / start with ge and gg
        await page.keyboard.press('z')
        await page.keyboard.press('j')
        await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

        await page.keyboard.press('g')
        await page.keyboard.press('g')

        // Assert: gg returns cursor to top and resets scrollTop
        await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0)
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
      })
    })

    test.describe('When the user selects, yanks, pastes, deletes, and undoes non-text blocks', () => {
      test(
        'it visually highlights notices and images in select mode and round-trips yank, paste, delete, and undo',
        { tag: '@smoke' },
        async ({ page, workspace }) => {
          // Arrange
          const prose = page.locator('.ProseMirror')
          const badge = page.getByTestId('which-key-mode-badge')

          // Act: move into the notice block (j -> p, j -> notice) and select Around Notice (m a n)
          await page.keyboard.press('j')
          await page.keyboard.press('j')
          await page.keyboard.press('v')
          await expect(badge).toHaveText('helix · select')
          await page.keyboard.press('m')
          await page.keyboard.press('a')
          await page.keyboard.press('n')

          // Assert: notice has modal node selection decoration and BubbleMenu stays hidden
          await expect(
            prose.locator('[data-pm-modal-node-selection="select"]:has(.editor-notice-node)'),
          ).toHaveCount(1)
          await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)

          // Act: yank the notice (y) and paste a duplicate below (p)
          await page.keyboard.press('y')
          await expect(badge).toHaveText('helix · normal')
          await page.keyboard.press('p')

          // Assert: two notices exist with title "Remember"
          await expect(prose.locator('.editor-notice-node')).toHaveCount(2)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toMatch(/> \[!NOTE\] Remember[\s\S]*> \[!NOTE\] Remember/)

          // Act: select the pasted notice (m a n) and delete it cleanly (d)
          await page.keyboard.press('v')
          await page.keyboard.press('m')
          await page.keyboard.press('a')
          await page.keyboard.press('n')
          await page.keyboard.press('d')

          // Assert: back to 1 notice without leftover empty notice container
          await expect(prose.locator('.editor-notice-node')).toHaveCount(1)

          // Act: undo (u) and redo (U)
          await page.keyboard.press('u')
          await expect(prose.locator('.editor-notice-node')).toHaveCount(2)
          await page.keyboard.press('U')
          await expect(prose.locator('.editor-notice-node')).toHaveCount(1)
        },
      )
    })

    test.describe('When the user enters insert mode via modal operators (o, i)', () => {
      test('it opens a new line in insert mode and returns to normal mode on Escape', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const prose = page.locator('.ProseMirror')
        const badge = page.getByTestId('which-key-mode-badge')

        // Act: press o on the heading to open a paragraph below and type text
        await page.keyboard.press('o')

        // Assert
        await expect(badge).toHaveText('helix · insert')
        await expect(prose).toHaveAttribute('contenteditable', 'true')

        // Act
        await page.keyboard.type('Inserted from normal mode.')
        await page.keyboard.press('Escape')

        // Assert
        await expect(badge).toHaveText('helix · normal')
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('Inserted from normal mode.')
      })
    })

    test.describe('When the user uses WhichKey menus, Keybinding Explorer, presets, and Jump Mode', () => {
      test('it opens Space menu without hardcoded panes, switches presets, and overlays Jump badges', async ({
        page,
      }) => {
        // Arrange
        const badge = page.getByTestId('which-key-mode-badge')

        // Act: open Space leader menu
        await page.keyboard.press(' ')
        const popup = page.locator('[data-which-key-root]')

        // Assert: shows Toggle Explorer (e), New Article (n), New Folder (N), and NO Focus Pane 1..9
        await expect(popup).toBeVisible()
        await expect(popup).toContainText('Toggle Explorer')
        await expect(popup).not.toContainText('Focus Pane 1')

        // Act: switch to Vim preset via Space -> k -> v
        await page.keyboard.press('k')
        await page.keyboard.press('v')
        await expect(badge).toHaveText('vim · normal')

        // Act: switch back to Helix preset via Space -> k -> h
        await page.keyboard.press(' ')
        await page.keyboard.press('k')
        await page.keyboard.press('h')
        await expect(badge).toHaveText('helix · normal')

        // Act: open Keybinding Explorer via Space -> ? and close with Escape
        await page.keyboard.press(' ')
        await page.keyboard.press('?')
        const explorer = page.locator('[data-which-key-explorer]')
        await expect(explorer).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(explorer).toBeHidden()

        // Act: start Jump Mode via g -> w and cancel with Escape
        await page.keyboard.press('g')
        await page.keyboard.press('w')
        await expect(badge).toHaveText('helix · jump')
        await expect(page.locator('[data-which-key-jump-overlay]')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(badge).toHaveText('helix · normal')
      })
    })

    test.describe('When the user toggles the Workspace Explorer (Space e / Ctrl-e) and navigates panes', () => {
      test(
        'it toggles the sidebar with Space e and Ctrl-e and navigates tree items with j/k/Enter/r',
        { tag: '@smoke' },
        async ({ page }) => {
          // Arrange
          const docPane = page.locator('.document-pane')
          const before = await docPane.boundingBox()
          expect(before!.x).toBeGreaterThan(0)

          // Act: press Space -> e to close the open Workspace Explorer sidebar
          await page.keyboard.press(' ')
          await page.keyboard.press('e')

          // Assert: sidebar collapses and Article region stays focused
          await expect.poll(async () => (await docPane.boundingBox())?.x).toBe(0)
          await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()

          // Act: press Control+e to reopen the Workspace Explorer and focus the selected treeitem
          await page.keyboard.press('Control+e')

          // Assert: sidebar expands and the active treeitem is focused
          await expect.poll(async () => (await docPane.boundingBox())?.x).toBe(before!.x)
          const modesItem = page.locator(`[role="treeitem"][data-value="${path}"]`)
          await expect(modesItem).toBeFocused()

          // Act: press j to move focus to Drafts/one.md and Enter to open it
          await page.keyboard.press('j')
          const oneItem = page.locator('[role="treeitem"][data-value="Drafts/one.md"]')
          await expect(oneItem).toBeFocused()
          await page.keyboard.press('Enter')

          // Assert: Drafts/one.md opens in normal mode
          await expect(page.locator('.ProseMirror h1')).toHaveText('One')
          await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false')

          // Act: switch focus back to Workspace pane via Ctrl-w h, start inline rename with r, and cancel with Escape
          await page.keyboard.press('Control+w')
          await page.keyboard.press('h')
          await expect(oneItem).toBeFocused()
          await page.keyboard.press('r')
          const renameInput = page.getByRole('textbox', { name: 'Name', exact: true })
          await expect(renameInput).toBeFocused()
          await expect(page.getByTestId('which-key-mode-badge')).toHaveText('helix · insert')
          await renameInput.press('Escape')
          await expect(page.getByTestId('which-key-mode-badge')).toHaveText('helix · normal')
        },
      )
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
