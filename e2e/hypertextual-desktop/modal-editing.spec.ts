import { test, expect, png } from './fixtures'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const path = 'Drafts/Modes.md'
const source =
  '# Modes\n\nA paragraph to edit.\n\n> [!NOTE] Remember\n> Body text.\n\n```javascript\nconst value = 1\nconst next = 2\n```\n\n![Photo](.images/photo.png "Photo caption")\n\n:::youtube {url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"} :::\n\n' +
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

        // Act
        await page.keyboard.press('q')
        await page.keyboard.press('w')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('z')
        await page.keyboard.press('j')

        // Assert
        await expect(prose.locator('[data-pm-modal-node-selection="normal"]')).toHaveCount(1)
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
        expect(await readFile(join(workspace.root, path), 'utf8')).toBe(source)
      })
    })

    test.describe('When the user selects, yanks, pastes, deletes, and undoes non-text blocks', () => {
      test(
        'it visually highlights notices in select mode and round-trips yank, paste, delete, and undo',
        { tag: '@smoke' },
        async ({ page, workspace }) => {
          // Arrange
          const prose = page.locator('.ProseMirror')
          const badge = page.getByTestId('which-key-mode-badge')
          await page.keyboard.press('j')
          await page.keyboard.press('j')
          await page.keyboard.press('v')
          await page.keyboard.press('m')
          await page.keyboard.press('a')
          await page.keyboard.press('n')
          await expect(badge).toHaveText('helix · select')
          await expect(
            prose.locator('[data-pm-modal-node-selection="select"]:has(.editor-notice-node)'),
          ).toHaveCount(1)
          await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)

          // Act
          await page.keyboard.press('y')
          await page.keyboard.press('p')
          await page.keyboard.press('v')
          await page.keyboard.press('m')
          await page.keyboard.press('a')
          await page.keyboard.press('n')
          await page.keyboard.press('d')
          await page.keyboard.press('u')

          // Assert
          await expect(badge).toHaveText('helix · normal')
          await expect(prose.locator('.editor-notice-node')).toHaveCount(2)
          await expect
            .poll(() => readFile(join(workspace.root, path), 'utf8'))
            .toMatch(/> \[!NOTE\] Remember[\s\S]*> \[!NOTE\] Remember/)
        },
      )
    })

    test.describe('When the user enters insert mode via modal operators (o, i)', () => {
      test('it opens a new line with o, edits in place with i, and returns to normal mode on Escape', async ({
        page,
        workspace,
      }) => {
        // Arrange
        const prose = page.locator('.ProseMirror')
        const badge = page.getByTestId('which-key-mode-badge')

        // Act
        await page.keyboard.press('o')
        await page.keyboard.type('Inserted line.')
        await page.keyboard.press('Escape')
        await page.keyboard.press('i')
        await page.keyboard.type('More ')
        await page.keyboard.press('Escape')

        // Assert
        await expect(badge).toHaveText('helix · normal')
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect
          .poll(() => readFile(join(workspace.root, path), 'utf8'))
          .toContain('Inserted line')
      })
    })

    test.describe('When the user uses WhichKey menus, Keybinding Explorer, presets, and Jump Mode', () => {
      test('it opens Space menu without hardcoded panes, switches presets, and overlays Jump badges', async ({
        page,
      }) => {
        // Arrange
        const badge = page.getByTestId('which-key-mode-badge')
        const popup = page.locator('[data-which-key-root]')
        await page.keyboard.press(' ')
        await expect(popup).toBeVisible()
        await expect(popup).toContainText('Toggle Explorer')
        await expect(popup).not.toContainText('Focus Pane 1')
        const itemKeys = await popup
          .locator('[data-testid="which-key-item"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-key')))
        expect(itemKeys).toEqual(['?', 'e', 'n', 'N', 'f', '/', 'g', 'j', 'w', 'v', 't', 'k'])
        await page.keyboard.press('k')
        await page.keyboard.press('v')
        await expect(badge).toHaveText('vim · normal')
        await page.keyboard.press(' ')
        await page.keyboard.press('k')
        await page.keyboard.press('h')
        await expect(badge).toHaveText('helix · normal')
        await page.keyboard.press(' ')
        await page.keyboard.press('?')
        await expect(page.locator('[data-which-key-explorer]')).toBeVisible()
        await page.keyboard.press('Escape')

        // Act
        await page.keyboard.press('g')
        await page.keyboard.press('w')

        // Assert
        await expect(badge).toHaveText('helix · jump')
        await expect(page.locator('[data-which-key-jump-overlay]')).toBeVisible()
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
          await page.keyboard.press(' ')
          await page.keyboard.press('e')
          await expect.poll(async () => (await docPane.boundingBox())?.x).toBe(0)
          await page.keyboard.press('Control+e')
          await expect.poll(async () => (await docPane.boundingBox())?.x).toBe(before!.x)
          const activeItem = page.locator(`[role="treeitem"][data-value="${path}"]`)
          await expect(activeItem).toBeFocused()
          await expect(activeItem).toHaveCSS('box-shadow', /0px 0px 0px 1px inset/)
          await expect(
            page
              .locator('#workspace-sidebar')
              .evaluate((el) => getComputedStyle(el, '::after').boxShadow),
          ).resolves.toMatch(/inset/)
          await expect(page.locator('.ProseMirror [data-pm-modal-cursor]')).toHaveCount(0)

          // Act
          await page.keyboard.press('k')
          await expect(
            page.locator('[data-part="branch-control"][data-value="Drafts"]'),
          ).toBeFocused()
          await page.keyboard.press('j')
          await page.keyboard.press('j')
          await page.keyboard.press('j')
          await page.keyboard.press('k')
          await page.keyboard.press('Enter')
          await page.keyboard.press('Control+w')
          await page.keyboard.press('h')
          await page.keyboard.press('r')

          // Assert
          await expect(page.locator('.ProseMirror h1')).toHaveText('One')
          const renameInput = page.getByRole('textbox', { name: 'Name', exact: true })
          await expect(renameInput).toBeFocused()
          await expect(page.getByTestId('which-key-mode-badge')).toHaveText('helix · insert')
        },
      )
    })

    test.describe('When the user enters a highlighted compound block with Enter and exits with Escape', () => {
      test('it highlights the whole notice, code block, and image while traversing text or reaching out-of-flow controls via Enter/Tab/i', async ({
        page,
      }) => {
        // Arrange: j twice from H1 -> Paragraph -> Notice title
        const prose = page.locator('.ProseMirror')
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await expect(
          prose.locator('[data-pm-modal-notice-title="normal"]:has(.editor-notice-node)'),
        ).toHaveCount(1)
        await expect(
          prose.locator('[data-notice-title-text] [data-pm-modal-cursor="normal"]'),
        ).toHaveText('R')
        await page.keyboard.press('l')
        await expect(
          prose.locator('[data-notice-title-text] [data-pm-modal-cursor="normal"]'),
        ).toHaveText('e')

        // j once more -> Notice body paragraph (preserving goal column 1 -> "o" in "Body text.")
        await page.keyboard.press('j')
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"]:has(.editor-notice-node)'),
        ).toHaveCount(1)
        await expect(
          prose.locator('.editor-notice-node p [data-pm-modal-cursor="normal"]'),
        ).toHaveText('o')

        // k back to Notice title -> i edits Notice title -> Tab to Notice type -> Tab to Notice body
        await page.keyboard.press('k')
        await expect(
          prose.locator('[data-pm-modal-notice-title="normal"]:has(.editor-notice-node)'),
        ).toHaveCount(1)
        await page.keyboard.press('i')
        const titleInput = page.getByLabel('Notice title')
        await expect(titleInput).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('combobox', { name: 'Notice type' })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(prose).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"]:has(.editor-notice-node)'),
        ).toHaveCount(1)

        // Move j into CodeBlock line 1 ("const value = 1") and j again into line 2 ("const next = 2")
        await page.keyboard.press('j')
        await expect(
          prose.locator(
            '[data-pm-modal-node-selection="normal"] pre code [data-pm-modal-cursor="normal"]',
          ),
        ).toHaveText('c')
        await page.keyboard.press('l')
        await expect(
          prose.locator(
            '[data-pm-modal-node-selection="normal"] pre code [data-pm-modal-cursor="normal"]',
          ),
        ).toHaveText('o')
        await page.keyboard.press('j')
        await expect(
          prose.locator(
            '[data-pm-modal-node-selection="normal"] pre code [data-pm-modal-cursor="normal"]',
          ),
        ).toHaveText('o')
        await page.keyboard.press('i')
        await expect(prose).toHaveAttribute('contenteditable', 'true')
        await expect(prose).toBeFocused()
        // ArrowUp from line 2 -> line 1 -> language selector (closed); ArrowUp again -> preceding block
        await page.keyboard.press('ArrowUp')
        await page.keyboard.press('ArrowUp')
        const langSelect = page.getByRole('combobox', { name: 'Code language' })
        await expect(langSelect).toBeFocused()
        await expect(langSelect).toHaveAttribute('aria-expanded', 'false')
        await page.keyboard.press('ArrowUp')
        await expect(prose).toBeFocused()
        await expect(langSelect).toHaveAttribute('aria-expanded', 'false')
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowUp')
        await expect(langSelect).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(prose).toBeFocused()
        await page.keyboard.press('Escape')
        await page.keyboard.press('j')

        // Move j onto Image caption in normal mode -> l moves caption cursor -> i focuses Image caption input
        await page.keyboard.press('j')
        await expect(prose.locator('[data-pm-modal-node-selection="normal"] img')).toHaveCount(1)
        await expect(
          prose.locator('[data-image-caption-text] [data-pm-modal-cursor="normal"]'),
        ).toHaveText('P')
        await page.keyboard.press('l')
        await expect(
          prose.locator('[data-image-caption-text] [data-pm-modal-cursor="normal"]'),
        ).toHaveText('h')
        await page.keyboard.press('i')
        await expect(page.getByLabel('Image caption')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('button', { name: 'Replace image' })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByRole('button', { name: 'Remove image' })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.getByLabel('Image caption')).toBeFocused()
        await page.keyboard.press('Escape')

        // Move j onto YouTube embed in normal mode -> Enter/i focuses overlaying YouTube URL input -> Tab focuses Remove preview
        await page.keyboard.press('j')
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"] [data-type="embed"]'),
        ).toHaveCount(1)
        await expect(page.getByLabel('YouTube URL')).toHaveCount(0)
        await page.keyboard.press('Enter')
        await expect(page.getByLabel('YouTube URL')).toBeFocused()
        await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)
        await page.keyboard.press('Tab')
        await expect(page.getByRole('button', { name: 'Remove preview' })).toBeFocused()
        await page.keyboard.press('Escape')

        // Assert
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"] [data-type="embed"]'),
        ).toHaveCount(1)
      })
    })

    test.describe('When the user toggles Pane Outline and Click to Insert settings via WhichKey (Space t)', () => {
      test('it toggles the active pane outline and click-to-insert behavior', async ({ page }) => {
        // Arrange
        const shell = page.locator('.workspace-shell')
        const prose = page.locator('.ProseMirror')
        await expect(shell).toHaveAttribute('data-pane-outline', 'true')

        // Act
        await page.keyboard.press(' ')
        await page.keyboard.press('t')
        await page.keyboard.press('o')
        await page.keyboard.press(' ')
        await page.keyboard.press('t')
        await page.keyboard.press('c')
        await prose.locator('p').first().click()

        // Assert
        await expect(shell).toHaveAttribute('data-pane-outline', 'false')
        await expect(prose).toHaveAttribute('contenteditable', 'false')
        await expect(page.getByTestId('which-key-mode-badge')).toHaveText('helix · normal')
      })
    })

    test.describe('When the user cycles the theme mode via the titlebar toggle or WhichKey (Space t d)', () => {
      test('it cycles system -> light -> dark -> system and persists the chosen mode across reloads', async ({
        page,
      }) => {
        // Arrange
        const html = page.locator('html')
        await expect(html).toHaveClass(/theme-hypertextual/)
        await expect(page.getByRole('button', { name: 'Theme: system' })).toBeVisible()

        // Act
        await page.getByRole('button', { name: 'Theme: system' }).click()
        await expect(page.getByRole('button', { name: 'Theme: light' })).toBeVisible()
        await expect(html).not.toHaveClass(/\bdark\b/)

        await page.getByRole('button', { name: 'Theme: light' }).click()
        await expect(page.getByRole('button', { name: 'Theme: dark' })).toBeVisible()
        await expect(html).toHaveClass(/\bdark\b/)

        await page.reload()

        // Assert
        await expect(page.getByRole('button', { name: 'Theme: dark' })).toBeVisible()
        await expect(html).toHaveClass(/\bdark\b/)
      })

      test('it cycles theme mode via Space t d and honors system dark mode when set to system', async ({
        page,
      }) => {
        // Arrange
        const html = page.locator('html')
        await page.emulateMedia({ colorScheme: 'dark' })
        await expect(page.getByRole('button', { name: 'Theme: system' })).toBeVisible()
        await expect(html).toHaveClass(/\bdark\b/)

        // Act
        await page.keyboard.press(' ')
        await page.keyboard.press('t')
        await page.keyboard.press('d')

        // Assert
        await expect(page.getByRole('button', { name: 'Theme: light' })).toBeVisible()
        await expect(html).not.toHaveClass(/\bdark\b/)
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
