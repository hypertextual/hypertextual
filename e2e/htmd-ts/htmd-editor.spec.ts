import { expect, test } from '@playwright/test'

test.describe('Standalone HtmdEditor plugin integration', () => {
  test('mounts headlessly without Svelte shell, edits content, and round-trips through HtmdDocument @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/e2e/htmd-ts/fixture.html')
    const heading = page.locator('#editor-host h1')
    const paragraph = page.locator('#editor-host p').first()

    // Act
    await expect(heading).toHaveText('Standalone Heading')
    await expect(paragraph).toHaveText('Initial body paragraph.')
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Updated inline.')
    await page.getByRole('button', { name: 'Serialize' }).click()

    // Assert
    await expect(page.getByLabel('Serialized markdown')).toContainText('# Standalone Heading')
    await expect(page.getByLabel('Serialized markdown')).toContainText(
      'Initial body paragraph. Updated inline.',
    )
  })

  test('dispatches editor:htmd Escape and i/Enter modal transitions through KeyScopeDispatcher @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/e2e/htmd-ts/fixture.html')
    const paragraph = page.locator('#editor-host p').first()
    const modeIndicator = page.getByLabel('Editor mode')

    // Act
    await paragraph.click()
    await expect(modeIndicator).toHaveText('edit')
    await page.keyboard.press('Escape')

    // Assert
    await expect(modeIndicator).toHaveText('normal')

    // Act
    await page.keyboard.press('i')

    // Assert
    await expect(modeIndicator).toHaveText('edit')
  })

  test('mounts custom HtmdNodeViewFactory views, updates attributes, and preserves contentDOM', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/e2e/htmd-ts/fixture.html')
    const paragraph = page.locator('#editor-host p').first()
    await paragraph.click()

    // Act
    await page.getByRole('button', { name: 'Insert Notice' }).click()
    const noticeWrapper = page.locator('[data-custom-notice]')
    const cycleBtn = page.getByRole('button', { name: 'Cycle notice style' })

    // Assert
    await expect(noticeWrapper).toHaveAttribute('data-custom-notice', 'info')
    await cycleBtn.click()
    await expect(noticeWrapper).toHaveAttribute('data-custom-notice', 'warning')

    // Act
    await noticeWrapper.locator('[data-node-view-content]').click()
    await page.keyboard.type('Custom notice body')
    await page.getByRole('button', { name: 'Serialize' }).click()

    // Assert
    await expect(page.getByLabel('Serialized markdown')).toContainText('> [!WARNING] Note')
    await expect(page.getByLabel('Serialized markdown')).toContainText('> Custom notice body')
  })

  test('resolves and writes media through EditorMediaService and reports unparsed blocks via EditorNotificationService', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/e2e/htmd-ts/fixture.html')

    // Act
    await page.getByRole('button', { name: 'Load Sample' }).click()

    // Assert
    await expect(page.locator('#editor-host h1')).toHaveText('Loaded Sample')
    await expect(page.getByLabel('Editor notifications').locator('li')).toContainText(
      'Unparsed containerDirective',
    )

    // Act
    await page.locator('#editor-host p').first().click()
    await page.getByRole('button', { name: 'Insert Media' }).click()
    await page.getByRole('button', { name: 'Serialize' }).click()

    // Assert
    await expect(page.getByLabel('Serialized markdown')).toContainText('.images/diagram.svg')
    await expect(page.getByLabel('Serialized markdown')).toContainText('.images/uploaded.svg')
    await expect(page.getByLabel('Serialized markdown')).toContainText(':::chart')
  })

  test('delegates keybindings to inner embedded editor scope before parent editor:htmd scope and hands focus back on Escape @smoke', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/e2e/htmd-ts/fixture.html')
    await page.getByRole('button', { name: 'Mount Embedded Editor' }).click()
    const embeddedInput = page.getByLabel('Embedded DBMD query')
    const embedIndicator = page.getByLabel('Embedded state')
    const modeIndicator = page.getByLabel('Editor mode')

    // Act
    await expect(embedIndicator).toHaveText('mounted')
    await embeddedInput.click()
    await embeddedInput.fill('SELECT * FROM articles')
    await page.keyboard.press('Enter')

    // Assert
    await expect(embedIndicator).toHaveText('executed:SELECT * FROM articles')
    await expect(modeIndicator).toHaveText('edit')

    // Act
    await page.keyboard.press('Escape')

    // Assert
    await expect(embedIndicator).toHaveText('exited-to-parent')
    await expect(modeIndicator).toHaveText('edit')
  })
})
