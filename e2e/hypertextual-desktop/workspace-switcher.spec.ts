import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, captureScreenshot } from './fixtures'

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control'

test.describe('Given markerless workspaces and multi-tabs', () => {
  test('@smoke opens an existing folder with .git and .DS_Store hidden, writes zero dotfiles, and requires a unique name on duplicate basename', async ({
    page,
    workspace,
  }, testInfo) => {
    // Arrange
    const parentA = await mkdtemp(join(tmpdir(), 'hypertextual-repo-a-'))
    const parentB = await mkdtemp(join(tmpdir(), 'hypertextual-repo-b-'))
    const docsA = join(parentA, 'docs')
    const docsB = join(parentB, 'docs')
    try {
      await mkdir(join(docsA, '.git'), { recursive: true })
      await writeFile(join(docsA, '.DS_Store'), 'mac')
      await writeFile(join(docsA, 'guide.md'), '# Guide A\n\nFrom repo A.\n')
      await mkdir(docsB, { recursive: true })
      await writeFile(join(docsB, 'guide-b.md'), '# Guide B\n\nFrom repo B.\n')

      // Act: Open first "docs" folder (picker opens immediately, then create dialog)
      workspace.nextPickedFolder = docsA
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Open workspace…' }).click()

      // Assert default basename prefill and clean load
      await expect(page.getByLabel('Workspace name')).toHaveValue('docs')
      await page.getByRole('button', { name: 'Create workspace' }).click()
      await expect(page.getByRole('treeitem', { name: 'Guide A' })).toBeVisible()
      await expect(page.getByRole('treeitem', { name: '.git' })).toHaveCount(0)
      await expect(page.getByRole('treeitem', { name: '.DS_Store' })).toHaveCount(0)
      const hasMarker = await stat(join(docsA, '.hypertextual')).then(
        () => true,
        () => false,
      )
      expect(hasMarker).toBe(false)

      // Act: Open second folder with duplicate basename "docs"
      workspace.nextPickedFolder = docsB
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Open workspace…' }).click()

      // Assert name field starts empty and requires unique entry
      await expect(page.getByLabel('Workspace name')).toHaveValue('')
      await expect(page.getByRole('button', { name: 'Create workspace' })).toBeDisabled()
      await page.getByLabel('Workspace name').fill('docs-b')
      await page.getByRole('button', { name: 'Create workspace' }).click()
      await expect(page.getByRole('treeitem', { name: 'Guide B' })).toBeVisible()

      await captureScreenshot(page, testInfo, 'workspaces-switcher')
    } finally {
      await rm(parentA, { recursive: true, force: true })
      await rm(parentB, { recursive: true, force: true })
    }
  })

  test('@smoke opens multiple tabs with Cmd/Ctrl+Click, deduplicates open tabs, closes with close button, and restores per-workspace tabs across switches', async ({
    page,
    workspace,
  }, testInfo) => {
    // Arrange: create a second workspace
    const secondDir = await mkdtemp(join(tmpdir(), 'hypertextual-second-'))
    try {
      await writeFile(join(secondDir, 'alpha.md'), '# Alpha\n\nSecond workspace.\n')

      // Act: open same.md in default workspace, then Cmd/Ctrl+Click same.htmd into a second tab
      await page.getByRole('treeitem', { name: 'Markdown' }).click()
      await expect(page.getByRole('tab', { name: 'Markdown' })).toBeVisible()

      await page.getByRole('treeitem', { name: 'HTMD (same.htmd)' }).click({ modifiers: [modKey] })

      // Assert two tabs open and deduplicated on repeat click
      await expect(page.getByRole('tab', { name: 'Markdown' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'HTMD' })).toBeVisible()
      await page.getByRole('treeitem', { name: 'Markdown' }).click({ modifiers: [modKey] })
      await expect(page.getByRole('tab')).toHaveCount(2)

      await captureScreenshot(page, testInfo, 'workspaces-tabs')

      // Act: switch to second workspace, open Alpha, then switch back to Local workspace
      workspace.nextPickedFolder = secondDir
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Open workspace…' }).click()
      await page.getByLabel('Workspace name').fill('second')
      await page.getByRole('button', { name: 'Create workspace' }).click()
      await page.getByRole('treeitem', { name: 'Alpha' }).click()
      await expect(page.getByRole('tab', { name: 'Alpha' })).toBeVisible()

      // Switch back to Local workspace
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Local workspace' }).click()

      // Assert original workspace tabs restored
      await expect(page.getByRole('tab', { name: 'Markdown' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'HTMD' })).toBeVisible()

      // Close active tab via close button
      await page.getByRole('button', { name: 'Close Markdown' }).click()
      await expect(page.getByRole('tab')).toHaveCount(1)
      await expect(page.getByRole('tab', { name: 'HTMD' })).toBeVisible()
    } finally {
      await rm(secondDir, { recursive: true, force: true })
    }
  })

  test('shows missing workspace recovery banner when a folder disappears and allows relocating or removing it', async ({
    page,
    workspace,
  }) => {
    // Arrange
    const vanished = await mkdtemp(join(tmpdir(), 'hypertextual-vanished-'))
    const relocated = await mkdtemp(join(tmpdir(), 'hypertextual-relocated-'))
    try {
      await writeFile(join(vanished, 'note.md'), '# Original\n')
      await writeFile(join(relocated, 'moved.md'), '# Moved Note\n')

      workspace.nextPickedFolder = vanished
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Open workspace…' }).click()
      await page.getByLabel('Workspace name').fill('ephemeral')
      await page.getByRole('button', { name: 'Create workspace' }).click()
      await expect(page.getByRole('treeitem', { name: 'Original' })).toBeVisible()

      // Switch back to Local workspace and delete ephemeral folder on disk
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: 'Local workspace' }).click()
      await rm(vanished, { recursive: true, force: true })

      // Act: try switching to missing workspace
      await page.getByRole('combobox', { name: 'Workspace selector' }).click()
      await page.getByRole('option', { name: /ephemeral/ }).click()

      // Assert missing banner appears and folder is not silently recreated
      await expect(page.getByRole('alert', { name: 'Missing workspace' })).toBeVisible()
      const recreated = await stat(vanished).then(
        () => true,
        () => false,
      )
      expect(recreated).toBe(false)

      // Act: relocate to moved folder
      workspace.nextPickedFolder = relocated
      await page.getByRole('button', { name: 'Relocate folder…' }).click()
      await expect(page.getByRole('treeitem', { name: 'Moved Note' })).toBeVisible()

      // Act: remove workspace from list via command palette; disk files stay intact
      await page.keyboard.press(`${modKey}+k`)
      await page.getByTestId('command-palette-input').fill('Remove Workspace from List')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('treeitem', { name: 'Markdown' })).toBeVisible()
      const keptOnDisk = await stat(join(relocated, 'moved.md')).then(
        () => true,
        () => false,
      )
      expect(keptOnDisk).toBe(true)
    } finally {
      await rm(vanished, { recursive: true, force: true })
      await rm(relocated, { recursive: true, force: true })
    }
  })
})
