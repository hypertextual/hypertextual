import { test, expect, png, captureScreenshot } from './fixtures'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const path = 'Drafts/Modes.md'
const mermaidPath = 'Drafts/Mermaid.md'
const mermaidSource =
  '# Diagram\n\nIntro paragraph.\n\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n  B --> C[Done]\n```\n\nOutro paragraph.\n'
const source =
  '# Modes\n\nA paragraph to edit.\n\n> [!NOTE] Remember\n> Body text.\n\n```javascript\nconst value = 1\nconst next = 2\n```\n\n![Photo](.images/photo.png "Photo caption")\n\n:::youtube {url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"} :::\n\n' +
  Array.from({ length: 60 }, (_, index) => `Paragraph ${index}.`).join('\n\n') +
  '\n'

async function openMermaidArticle(
  page: import('@playwright/test').Page,
  workspace: { root: string },
) {
  await writeFile(join(workspace.root, mermaidPath), mermaidSource)
  await page.reload()
  await page.getByRole('treeitem', { name: 'Drafts', exact: true }).click()
  await page.locator(`[role="treeitem"][data-value="${mermaidPath}"]`).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Article content' })).toBeFocused()
}

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
          await expect(
            page.locator('.document-status').getByTestId('which-key-mode-badge'),
          ).toHaveText('helix · normal')
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
          const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')
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
        const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')

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
        const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')
        const popup = page.locator('[data-which-key-root]')
        await page.keyboard.press(' ')
        await expect(popup).toBeVisible()
        await expect(popup).toContainText('Toggle Explorer')
        await expect(popup).not.toContainText('Focus Pane 1')
        const itemKeys = await popup
          .locator('[data-testid="which-key-item"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-key')))
        expect(itemKeys).toEqual([':', '?', 'e', 'n', 'N', 'f', '/', 'g', 'j', 'w', 'v', 't', 'k'])
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
          await expect(
            page.locator('.document-status').getByTestId('which-key-mode-badge'),
          ).toHaveText('helix · insert')
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

        // k back to Notice title -> i edits Notice title -> Tab/Shift+Tab/ArrowUp/ArrowDown across Notice
        await page.keyboard.press('k')
        await expect(
          prose.locator('[data-pm-modal-notice-title="normal"]:has(.editor-notice-node)'),
        ).toHaveCount(1)
        await page.keyboard.press('i')
        const titleInput = page.getByLabel('Notice title')
        const noticeTypeSelect = page.getByRole('combobox', { name: 'Notice type' })
        const replaceImageBtn = page.getByRole('button', { name: 'Replace image' })
        const removeImageBtn = page.getByRole('button', { name: 'Remove image' })
        await expect(titleInput).toBeFocused()
        // In insert mode, image Replace and Remove buttons are visible even when not hovered or focused
        await expect(replaceImageBtn).toBeVisible()
        await expect(removeImageBtn).toBeVisible()
        await expect(replaceImageBtn).toHaveCSS('opacity', '1')
        await expect(removeImageBtn).toHaveCSS('opacity', '1')
        // Exit Notice upward to preceding paragraph, then re-enter Notice downward into Notice title
        await page.keyboard.press('ArrowUp')
        await expect(prose).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(titleInput).toBeFocused()
        // Tab / Shift+Tab between Notice title, Notice type, and Notice body
        await page.keyboard.press('Tab')
        await expect(noticeTypeSelect).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(titleInput).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(noticeTypeSelect).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(prose).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(noticeTypeSelect).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(prose).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(titleInput).toBeFocused()
        await page.keyboard.press('ArrowDown')
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
        // ArrowUp from line 2 -> line 1 -> language selector (closed); Tab/Shift+Tab to Copy button; ArrowUp -> preceding block
        await page.keyboard.press('ArrowUp')
        await page.keyboard.press('ArrowUp')
        const langSelect = page.getByRole('combobox', { name: 'Code language' })
        await expect(langSelect).toBeFocused()
        await expect(langSelect).toHaveAttribute('aria-expanded', 'false')
        await page.keyboard.press('Tab')
        const copyCodeBtn = page.getByRole('button', { name: 'Copy code' })
        await expect(copyCodeBtn).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(langSelect).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(prose).toBeFocused()
        await expect(langSelect).toHaveAttribute('aria-expanded', 'false')
        // Navigating down from outside in insert mode directly selects Code language
        await page.keyboard.press('ArrowDown')
        await expect(langSelect).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(prose).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(langSelect).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(copyCodeBtn).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(prose).toBeFocused()
        // Traverse down through CodeBlock lines and exit into Image caption, then ArrowUp back through CodeBlock to langSelect and body
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowDown')
        const imageCaptionInput = page.getByLabel('Image caption')
        await expect(imageCaptionInput).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(prose).toBeFocused()
        await page.keyboard.press('ArrowUp')
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
        await expect(imageCaptionInput).toBeFocused()
        const unfocusedReplaceShadow = await replaceImageBtn.evaluate(
          (el) => getComputedStyle(el).boxShadow,
        )
        const unfocusedRemoveShadow = await removeImageBtn.evaluate(
          (el) => getComputedStyle(el).boxShadow,
        )
        await page.keyboard.press('Tab')
        await expect(replaceImageBtn).toBeFocused()
        await expect
          .poll(() => replaceImageBtn.evaluate((el) => getComputedStyle(el).boxShadow))
          .not.toBe(unfocusedReplaceShadow)
        await page.keyboard.press('Tab')
        await expect(removeImageBtn).toBeFocused()
        await expect
          .poll(() => removeImageBtn.evaluate((el) => getComputedStyle(el).boxShadow))
          .not.toBe(unfocusedRemoveShadow)
        await page.keyboard.press('Shift+Tab')
        await expect(replaceImageBtn).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(imageCaptionInput).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(replaceImageBtn).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(removeImageBtn).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(imageCaptionInput).toBeFocused()
        // ArrowDown from Image caption enters YouTube LinkPreview URL input; ArrowDown again exits to paragraph below; ArrowUp traverses back
        await page.keyboard.press('ArrowDown')
        const youtubeUrlInput = page.getByLabel('YouTube URL')
        const removePreviewBtn = page.getByRole('button', { name: 'Remove preview' })
        await expect(youtubeUrlInput).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(removePreviewBtn).toBeFocused()
        await page.keyboard.press('Shift+Tab')
        await expect(youtubeUrlInput).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(prose).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(youtubeUrlInput).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(imageCaptionInput).toBeFocused()
        await page.keyboard.press('Escape')

        // Move j onto YouTube embed in normal mode -> Enter/i focuses overlaying YouTube URL input -> Tab focuses Remove preview
        await page.keyboard.press('j')
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"] [data-type="embed"]'),
        ).toHaveCount(1)
        await expect(youtubeUrlInput).toHaveCount(0)
        await page.keyboard.press('Enter')
        await expect(youtubeUrlInput).toBeFocused()
        await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toHaveCount(0)
        await page.keyboard.press('Tab')
        await expect(removePreviewBtn).toBeFocused()
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
        await expect(
          page.locator('.document-status').getByTestId('which-key-mode-badge'),
        ).toHaveText('helix · normal')
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

    test.describe('When the user moves onto a Mermaid diagram', () => {
      test(
        'it selects the whole diagram block and hides the raw code',
        { tag: '@smoke' },
        async ({ page, workspace }) => {
          // Arrange
          await openMermaidArticle(page, workspace)
          const prose = page.locator('.ProseMirror')
          const mermaidNode = prose.locator('[data-mermaid-node]')
          await expect(mermaidNode).toHaveAttribute('data-mermaid-mode', 'normal')
          await expect(mermaidNode.locator('[data-mermaid-canvas] svg')).toBeVisible()
          await expect(mermaidNode.locator('[data-mermaid-code]')).toHaveClass(/sr-only/)

          // Act
          await page.keyboard.press('j')
          await page.keyboard.press('j')

          // Assert
          const proseBox = await prose.boundingBox()
          const mermaidBox = await mermaidNode.boundingBox()
          expect(Math.abs(mermaidBox!.width - proseBox!.width)).toBeLessThanOrEqual(4)
          await expect(
            prose.locator('[data-pm-modal-node-selection="normal"]:has([data-mermaid-node])'),
          ).toHaveCount(1)
          await expect(mermaidNode.locator('[data-mermaid-zoom-in]')).toHaveCount(0)
          await expect(mermaidNode.locator('[data-mermaid-zoom-out]')).toHaveCount(0)
          await expect(mermaidNode.locator('[data-mermaid-zoom-reset]')).toHaveCount(0)
          await expect(
            mermaidNode.getByRole('button', { name: 'Edit Mermaid diagram' }),
          ).toHaveText('')
          await expect(
            mermaidNode.getByRole('button', { name: 'Fullscreen Mermaid diagram' }),
          ).toHaveText('')
        },
      )
    })

    test.describe('When the user pans and zooms a selected Mermaid diagram', () => {
      test('it updates its scale and pan offsets', async ({ page, workspace }) => {
        // Arrange
        await openMermaidArticle(page, workspace)
        const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
        await page.keyboard.press('j')
        await page.keyboard.press('j')

        // Act
        await page.keyboard.press('+')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1.25')
        await page.keyboard.press('Control+=')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1.5')
        await page.keyboard.press('-')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1.25')
        await page.keyboard.press('Control+l')

        // Assert
        await expect(mermaidNode.locator('[data-mermaid-canvas]')).toHaveAttribute(
          'style',
          /translate3d\(48px,\s*0px,\s*0(?:px)?\)\s*scale\(1\.25\)/,
        )
        await page.keyboard.press('Control+0')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1')

        // Act: drag-pan the diagram canvas with the mouse
        const viewer = mermaidNode.locator('[data-mermaid-viewport]')
        const viewerBox = await viewer.boundingBox()
        await page.mouse.move(
          viewerBox!.x + viewerBox!.width / 2,
          viewerBox!.y + viewerBox!.height / 2,
        )
        await page.mouse.down()
        await page.mouse.move(
          viewerBox!.x + viewerBox!.width / 2 + 30,
          viewerBox!.y + viewerBox!.height / 2 + 20,
        )
        await page.mouse.up()

        // Assert
        await expect(mermaidNode).toHaveAttribute('data-mermaid-pan-x', '30')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-pan-y', '20')
        await page.keyboard.press('0')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-pan-x', '0')
      })
    })

    test.describe('When the user toggles fullscreen on a Mermaid diagram', () => {
      test('it fills the editor pane and returns to the inline diagram on exit', async ({
        page,
        workspace,
      }) => {
        // Arrange
        await openMermaidArticle(page, workspace)
        const prose = page.locator('.ProseMirror')
        const editorRegion = page.getByRole('region', { name: 'Article content' })
        await page.keyboard.press('j')
        await page.keyboard.press('j')

        // Act: open Fullscreen Viewer via WhichKey (Space -> m -> f)
        await page.keyboard.press(' ')
        const popup = page.locator('[data-which-key-root]')
        await expect(popup).toBeVisible()
        await expect(popup).toContainText('Mermaid')
        await page.keyboard.press('m')
        await expect(popup).toContainText('Toggle Mermaid Fullscreen')
        await page.keyboard.press('f')

        // Assert
        const fullscreen = page.locator(
          '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="normal"]',
        )
        await expect(fullscreen).toBeVisible()
        const regionBox = await editorRegion.boundingBox()
        const fullscreenBox = await fullscreen.boundingBox()
        expect(Math.abs(fullscreenBox!.width - regionBox!.width)).toBeLessThanOrEqual(4)
        expect(Math.abs(fullscreenBox!.height - regionBox!.height)).toBeLessThanOrEqual(4)
        await expect(fullscreen.getByRole('button', { name: 'Edit Mermaid diagram' })).toBeVisible()
        await expect(
          fullscreen.getByRole('button', { name: 'Minimize Mermaid diagram' }),
        ).toBeVisible()

        // Act: pan and zoom inside Fullscreen Viewer with single-key motions, then Escape
        await page.keyboard.press('+')
        await page.keyboard.press('l')
        await expect(fullscreen).toHaveAttribute('data-mermaid-scale', '1.25')
        await expect(fullscreen.locator('[data-mermaid-canvas]')).toHaveAttribute(
          'style',
          /translate3d\(48px,\s*0px,\s*0(?:px)?\)\s*scale\(1\.25\)/,
        )
        await page.keyboard.press('Escape')

        // Assert
        await expect(fullscreen).toHaveCount(0)
        await expect(
          prose.locator('[data-pm-modal-node-selection="normal"]:has([data-mermaid-node])'),
        ).toHaveCount(1)

        // Act: toggle Fullscreen Viewer with Ctrl+w z and Space w z
        await page.keyboard.press('Control+w')
        await page.keyboard.press('z')
        await expect(fullscreen).toBeVisible()
        await page.keyboard.press('Control+w')
        await page.keyboard.press('z')
        await expect(fullscreen).toHaveCount(0)
        await page.keyboard.press('Space')
        await page.keyboard.press('w')
        await page.keyboard.press('z')
        await expect(fullscreen).toBeVisible()
        await fullscreen.getByRole('button', { name: 'Minimize Mermaid diagram' }).click()
        await expect(fullscreen).toHaveCount(0)
      })
    })

    test.describe('When the user updates command style and appearance settings via commands', () => {
      test(
        'it applies theme class, dark mode class, pane outline attribute, and command surface style to the DOM',
        { tag: '@smoke' },
        async ({ page }, testInfo) => {
          // Arrange
          const html = page.locator('html')
          const shell = page.locator('.workspace-shell')
          const palette = page.getByTestId('command-palette')
          const paletteInput = page.getByTestId('command-palette-input')
          const menu = page.getByTestId('command-menu')
          const menuInput = page.getByTestId('command-menu-input')

          await expect(page.getByRole('button', { name: /Open Command/i })).toHaveCount(0)
          expect(
            await page.evaluate(
              () => document.documentElement.scrollHeight <= document.documentElement.clientHeight,
            ),
          ).toBe(true)

          // Act
          await page.keyboard.press(':')
          await expect(palette).toBeVisible()
          await captureScreenshot(page, testInfo, 'command-palette')
          await paletteInput.fill('Command Menu')
          await page.keyboard.press('Enter')
          await expect(palette).toHaveCount(0)

          await page.keyboard.press(':')
          await expect(menu).toBeVisible()
          await captureScreenshot(page, testInfo, 'command-menu')
          await menuInput.fill('theme catppuccin')
          await page.keyboard.press('Enter')
          await expect(menu).toHaveCount(0)

          await page.keyboard.press(':')
          await menuInput.fill('mode dark')
          await page.keyboard.press('Enter')
          await expect(menu).toHaveCount(0)

          await page.keyboard.press(':')
          await menuInput.fill('pane-outline off')
          await page.keyboard.press('Enter')
          await expect(menu).toHaveCount(0)

          // Assert
          await expect(html).toHaveClass(/\btheme-catppuccin\b/)
          await expect(html).toHaveClass(/\bdark\b/)
          await expect(shell).toHaveAttribute('data-pane-outline', 'false')
          await captureScreenshot(page, testInfo, 'theme-catppuccin-dark')
        },
      )

      test(
        'it persists command style, theme, color mode, and pane outline settings across reloads',
        { tag: '@smoke' },
        async ({ page }) => {
          // Arrange
          const html = page.locator('html')
          const shell = page.locator('.workspace-shell')
          const palette = page.getByTestId('command-palette')
          const paletteInput = page.getByTestId('command-palette-input')
          const menu = page.getByTestId('command-menu')
          const menuInput = page.getByTestId('command-menu-input')

          await page.keyboard.press(':')
          await paletteInput.fill('Command Menu')
          await page.keyboard.press('Enter')

          await page.keyboard.press(':')
          await menuInput.fill('theme catppuccin')
          await page.keyboard.press('Enter')

          await page.keyboard.press(':')
          await menuInput.fill('mode dark')
          await page.keyboard.press('Enter')

          await page.keyboard.press(':')
          await menuInput.fill('pane-outline off')
          await page.keyboard.press('Enter')

          // Act
          await page.reload()

          // Assert
          await expect(html).toHaveClass(/\btheme-catppuccin\b/)
          await expect(html).toHaveClass(/\bdark\b/)
          await expect(shell).toHaveAttribute('data-pane-outline', 'false')
          await page.keyboard.press(':')
          await expect(menu).toBeVisible()
          await expect(palette).toHaveCount(0)
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
    test.describe('Given a Mermaid diagram in edit mode', () => {
      test.beforeEach(async ({ page, workspace }) => {
        await openMermaidArticle(page, workspace)
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page
          .locator('.ProseMirror [data-mermaid-node]')
          .getByRole('button', { name: 'Edit Mermaid diagram' })
          .click()
      })

      test('it shows syntax-highlighted code and the top-right in-place preview window', async ({
        page,
      }) => {
        // Arrange
        const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
        const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')

        // Assert
        await expect(badge).toHaveText('helix · insert')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-mode', 'insert')
        await expect(mermaidNode.locator('[data-mermaid-code] .hljs-keyword').first()).toHaveText(
          'flowchart',
        )
        const highlightStyles = await mermaidNode.locator('[data-mermaid-code]').evaluate((el) => {
          const codeEl = el.querySelector('code')!
          const kwEl = el.querySelector('.hljs-keyword')!
          return {
            codeBg: getComputedStyle(el).backgroundColor,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            codeColor: getComputedStyle(codeEl).color,
            kwColor: getComputedStyle(kwEl).color,
          }
        })
        expect(highlightStyles.codeBg).toBe(highlightStyles.bodyBg)
        expect(highlightStyles.kwColor).not.toBe(highlightStyles.codeColor)
        const pip = mermaidNode.locator('[data-pip-window]')
        await expect(pip).toBeVisible()
        await expect(pip).toHaveAttribute('data-pip-placement', 'top-right')
        await expect(pip.locator('[data-pip-header]')).toHaveCount(0)
        const pipSvg = pip.locator('[data-mermaid-canvas] svg')
        await expect(pipSvg).toBeVisible()
        const pipBodyBox = await pip.locator('[data-pip-body]').boundingBox()
        const pipSvgBox = await pipSvg.boundingBox()
        expect(pipSvgBox!.width).toBeLessThanOrEqual(pipBodyBox!.width)
        expect(pipSvgBox!.height).toBeLessThanOrEqual(pipBodyBox!.height)
      })

      test.describe('When the user presses ArrowUp and Tab from the first line', () => {
        test('it focuses the toolbar buttons and moves above the block on a second ArrowUp', async ({
          page,
        }) => {
          // Arrange
          const prose = page.locator('.ProseMirror')
          const mermaidNode = prose.locator('[data-mermaid-node]')
          const copyBtn = mermaidNode.getByRole('button', { name: 'Copy Mermaid source' })
          const fullscreenBtn = mermaidNode.getByRole('button', {
            name: 'Fullscreen Mermaid diagram',
          })

          // Act
          await page.keyboard.press('ArrowUp')
          await expect(copyBtn).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(fullscreenBtn).toBeFocused()
          await page.keyboard.press('ArrowUp')

          // Assert
          await expect(prose).toBeFocused()
        })
      })

      test.describe('When the user pans and zooms the in-place preview', () => {
        test('it updates its scale and pan offsets', async ({ page }) => {
          // Arrange
          const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
          const pip = mermaidNode.locator('[data-pip-window]')

          // Act
          await pip.locator('[data-mermaid-viewport]').dispatchEvent('wheel', {
            deltaY: -100,
            ctrlKey: true,
          })
          await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1.1')
          await page.keyboard.press('Control+0')
          await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1')
          await page.keyboard.press('Control+=')
          await page.keyboard.press('Control+j')

          // Assert
          await expect(mermaidNode).toHaveAttribute('data-mermaid-scale', '1.25')
          await expect(pip.locator('[data-mermaid-canvas]')).toHaveAttribute(
            'style',
            /translate3d\(0px,\s*48px,\s*0(?:px)?\)\s*scale\(1\.25\)/,
          )
        })
      })

      test.describe('Given the Mermaid diagram is maximized into split-screen view', () => {
        test.beforeEach(async ({ page }) => {
          await page.keyboard.press('Control+w')
          await page.keyboard.press('z')
          await expect(
            page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="insert"] [data-mermaid-canvas] svg',
            ),
          ).toBeVisible()
        })

        test('it places the focused code pane on the left and the preview pane on the right', async ({
          page,
        }) => {
          // Arrange
          const splitFullscreen = page.locator(
            '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="insert"]',
          )
          const splitCodePane = splitFullscreen.locator('[data-mermaid-code]')
          const splitPreview = splitFullscreen.locator('[data-mermaid-viewport]')

          // Assert
          await expect(splitFullscreen).toBeVisible()
          await expect(splitCodePane).toHaveAttribute('data-pane-focused', 'true')
          const surfaceBox = await splitFullscreen.boundingBox()
          const codeBox = await splitCodePane.boundingBox()
          const previewBox = await splitPreview.boundingBox()
          expect(Math.abs(codeBox!.x - surfaceBox!.x)).toBeLessThanOrEqual(2)
          expect(
            Math.abs(previewBox!.x + previewBox!.width - (surfaceBox!.x + surfaceBox!.width)),
          ).toBeLessThanOrEqual(2)
        })

        test.describe('When the user edits valid Mermaid source and pans or zooms', () => {
          test('it saves the updated Markdown and updates the viewport', async ({
            page,
            workspace,
          }) => {
            // Arrange
            const splitFullscreen = page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="insert"]',
            )

            // Act
            await page.keyboard.press('Control+=')
            await page.keyboard.press('Control+l')
            await page.keyboard.type('  X[Step] --> A[Start]\n')

            // Assert
            await expect(splitFullscreen).toHaveAttribute('data-mermaid-scale', '1.25')
            await expect
              .poll(() => readFile(join(workspace.root, mermaidPath), 'utf8'))
              .toContain('X[Step] --> A[Start]')
          })
        })

        test.describe('When the user switches focus between the code and preview panes', () => {
          test('it focuses the preview pane for single-key zoom and returns to the code pane on Tab', async ({
            page,
          }) => {
            // Arrange
            const splitFullscreen = page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="insert"]',
            )
            const splitCodePane = splitFullscreen.locator('[data-mermaid-code]')
            const splitPreview = splitFullscreen.locator('[data-mermaid-viewport]')

            // Act
            await page.keyboard.press('Control+w')
            await page.keyboard.press('l')
            await expect(splitPreview).toBeFocused()
            await page.keyboard.press('+')
            await expect(splitFullscreen).toHaveAttribute('data-mermaid-scale', '1.25')
            await page.keyboard.press('0')
            await expect(splitFullscreen).toHaveAttribute('data-mermaid-scale', '1')
            await page.keyboard.press('Tab')

            // Assert
            await expect(splitCodePane).toHaveAttribute('data-pane-focused', 'true')
          })
        })

        test.describe('When the user enters invalid Mermaid syntax', () => {
          test('it keeps the last valid diagram and shows the bottom error bar', async ({
            page,
          }) => {
            // Arrange
            const splitFullscreen = page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="insert"]',
            )
            const splitPreview = splitFullscreen.locator('[data-mermaid-viewport]')

            // Act
            await page.keyboard.type('  ??? invalid syntax\n')

            // Assert
            await expect(splitFullscreen.locator('[data-mermaid-error]')).toBeVisible()
            await expect(splitPreview.locator('[data-mermaid-canvas] svg')).toBeVisible()
          })
        })

        test.describe('When the user presses Escape', () => {
          test('it switches to fullscreen preview in normal mode', async ({ page }) => {
            // Arrange
            const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')
            const viewerFullscreen = page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="normal"]',
            )

            // Act
            await page.keyboard.press('Escape')

            // Assert
            await expect(badge).toHaveText('helix · normal')
            await expect(viewerFullscreen).toBeVisible()
          })

          test('it minimizes fullscreen back to the inline diagram on a second Escape', async ({
            page,
          }) => {
            // Arrange
            const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
            const viewerFullscreen = page.locator(
              '[data-mermaid-node][data-mermaid-fullscreen="true"][data-mermaid-mode="normal"]',
            )
            await page.keyboard.press('Escape')
            await expect(viewerFullscreen).toBeVisible()

            // Act
            await page.keyboard.press('Escape')

            // Assert
            await expect(viewerFullscreen).toHaveCount(0)
            await expect(mermaidNode).toHaveAttribute('data-mermaid-mode', 'normal')
          })
        })
      })
    })
  },
)

test.describe(
  'Given the user is in select mode',
  { tag: ['@desktop', '@editor', '@modal-editing'] },
  () => {
    test.describe('Given a Mermaid diagram with the first line selected via x', () => {
      test.beforeEach(async ({ page, workspace }) => {
        await openMermaidArticle(page, workspace)
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.keyboard.press('x')
      })

      test('it shows syntax-highlighted code, the top-right in-place preview, and selects the first line', async ({
        page,
      }) => {
        // Arrange
        const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
        const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')
        const pip = mermaidNode.locator('[data-pip-window]')
        const selectedSpan = mermaidNode.locator(
          '[data-mermaid-code] [data-pm-modal-selection="select"]',
        )

        // Assert
        await expect(badge).toHaveText('helix · select')
        await expect(mermaidNode).toHaveAttribute('data-mermaid-mode', 'select')
        await expect(mermaidNode.locator('[data-mermaid-code]')).not.toHaveClass(/sr-only/)
        await expect(mermaidNode.locator('[data-mermaid-code] .hljs-keyword').first()).toHaveText(
          'flowchart',
        )
        const highlightStyles = await mermaidNode.locator('[data-mermaid-code]').evaluate((el) => {
          const codeEl = el.querySelector('code')!
          const kwEl = el.querySelector('.hljs-keyword')!
          return {
            codeBg: getComputedStyle(el).backgroundColor,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            codeColor: getComputedStyle(codeEl).color,
            kwColor: getComputedStyle(kwEl).color,
          }
        })
        expect(highlightStyles.codeBg).toBe(highlightStyles.bodyBg)
        expect(highlightStyles.kwColor).not.toBe(highlightStyles.codeColor)
        await expect(pip).toBeVisible()
        await expect(pip).toHaveAttribute('data-pip-scope', 'container')
        await expect(pip).toHaveAttribute('data-pip-placement', 'top-right')
        await expect(pip.locator('[data-pip-header]')).toHaveCount(0)
        await expect(pip.locator('[data-mermaid-canvas] svg')).toBeVisible()
        await expect
          .poll(async () => (await selectedSpan.allTextContents()).join(''))
          .toBe('flowchart TD')
      })

      test.describe('When the user presses x again', () => {
        test('it extends the selection to the next line', async ({ page }) => {
          // Arrange
          const selectedSpan = page.locator(
            '.ProseMirror [data-mermaid-node] [data-mermaid-code] [data-pm-modal-selection="select"]',
          )

          // Act
          await page.keyboard.press('x')

          // Assert
          await expect
            .poll(async () => (await selectedSpan.allTextContents()).join(''))
            .toBe('flowchart TD\n  A[Start] --> B[End]')
        })
      })

      test.describe('When the user presses Escape', () => {
        test('it returns to view mode and hides the in-place preview', async ({ page }) => {
          // Arrange
          const mermaidNode = page.locator('.ProseMirror [data-mermaid-node]')
          const badge = page.locator('.document-status').getByTestId('which-key-mode-badge')

          // Act
          await page.keyboard.press('Escape')

          // Assert
          await expect(badge).toHaveText('helix · normal')
          await expect(mermaidNode).toHaveAttribute('data-mermaid-mode', 'normal')
          await expect(mermaidNode.locator('[data-pip-window]')).toHaveCount(0)
        })
      })
    })
  },
)
