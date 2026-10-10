import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve('../..');
const binary = join(root, 'target/debug/htmd-vault');
let vault: string;

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error('Editor page error:', error.message));
  vault = mkdtempSync(join(tmpdir(), 'htmd-test-'));
  cpSync(join(root, 'vault'), vault, { recursive: true, filter: path => !path.includes('/Benchmarks') });
  writeFileSync(join(vault, 'Keyboard.htmd'), '### Short\n\nAlpha paragraph.\n\nBeta paragraph.\n');
  // Only the IPC transport is substituted. Parsing and file I/O use our Rust binary.
  await page.exposeFunction('rustInvoke', (command: string, args: Record<string, string> = {}) => {
    if (command === 'benchmark_enabled') return false;
    const argv = command === 'tree' ? ['tree', vault] : command === 'open_note' ? ['open', vault, args.path] : command === 'parse_blocks' ? ['parse'] : ['save', vault, args.path];
    const input = command === 'parse_blocks' ? args.source : command === 'save_note' ? JSON.stringify(args) : undefined;
    return JSON.parse(execFileSync(binary, argv, { input, encoding: 'utf8' }));
  });
  await page.addInitScript(() => {
    Object.assign(window, { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, string>) => (window as unknown as { rustInvoke: (c: string, a: Record<string, string>) => Promise<unknown> }).rustInvoke(command, args) } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A quieter place to think' })).toBeVisible();
});
test.afterEach(() => { if (vault) rmSync(vault, { recursive: true, force: true }); });

const content = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: 'Note content' });
// A user cannot deliver a stream of separate key presses inside one browser
// frame. Let native selectionchange reach ProseMirror before the next key.
async function editorKey(page: import('@playwright/test').Page, key: string) {
  await content(page).press(key);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function keyboardNote(page: import('@playwright/test').Page) {
  await page.getByRole('treeitem', { name: /Keyboard htmd/ }).click();
  await expect(page.getByRole('heading', { name: 'Short', exact: true })).toBeVisible();
  await content(page).focus();
  await editorKey(page, 'Meta+ArrowUp');
}

test('one continuous rich document and a keyboard operated file tree', async ({ page }) => {
  const typography = await content(page).evaluate(el => ({ heading: getComputedStyle(el.querySelector('h1')!).fontSize, body: getComputedStyle(el.querySelector('p')!).fontSize }));
  expect(parseFloat(typography.heading)).toBeGreaterThan(parseFloat(typography.body));
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(1);
  const existing = page.getByRole('treeitem', { name: /Existing md/ });
  await existing.focus(); await existing.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your Markdown comes with you' })).toBeVisible();
  const reference = page.getByRole('treeitem', { name: 'Reference', exact: true });
  await reference.focus(); await reference.press('ArrowLeft');
  await expect(existing).toHaveCount(0);
  await reference.press('ArrowRight'); await reference.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: /Empty htmd/ })).toBeFocused();
});

test('caret crosses nodes and heading markers do not move text', async ({ page }) => {
  await keyboardNote(page);
  const heading = page.getByRole('heading', { name: 'Short', exact: true });
  const before = await heading.boundingBox();
  await expect(heading).toHaveAttribute('data-markdown-marker', '###');
  await editorKey(page, 'Meta+ArrowRight');
  await editorKey(page, 'ArrowRight'); // Heading end to next paragraph start.
  await expect(heading).not.toHaveAttribute('data-markdown-marker');
  expect(await heading.boundingBox()).toEqual(before);
  await content(page).pressSequentially('Keyboard ');
  await expect(content(page).locator('p').first()).toHaveText('Keyboard Alpha paragraph.');
  await editorKey(page, 'Meta+ArrowUp');
  await expect(heading).toHaveAttribute('data-markdown-marker', '###');
  expect(await heading.boundingBox()).toEqual(before);
});

test('Enter splits, Backspace merges, undo works, and selection spans nodes', async ({ page }) => {
  await keyboardNote(page);
  await editorKey(page, 'Meta+ArrowRight');
  await editorKey(page, 'ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.textContent)).toBe('Alpha paragraph.');
  await editorKey(page, 'Meta+ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(0);
  await editorKey(page, 'ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(1);
  await editorKey(page, 'ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(2);
  // Let the browser's selectionchange reach ProseMirror before Enter.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await editorKey(page, 'Enter');
  await expect(content(page).locator('p').first()).toHaveText('Al');
  await expect(content(page).locator('p').nth(1)).toHaveText('pha paragraph.');
  await editorKey(page, 'Backspace');
  await expect(content(page).locator('p').first()).toHaveText('Alpha paragraph.');
  await content(page).pressSequentially('X');
  await editorKey(page, 'Meta+z');
  await expect(content(page).locator('p').first()).toHaveText('Alpha paragraph.');
  await editorKey(page, 'Meta+ArrowUp');
  await editorKey(page, 'Meta+Shift+ArrowDown');
  const selection = await page.evaluate(() => window.getSelection()?.toString());
  expect(selection).toContain('Short'); expect(selection).toContain('Beta paragraph.');
  await content(page).pressSequentially('Replaced the entire document.');
  await expect(content(page)).toHaveText('Replaced the entire document.');
});

test('save keeps untouched source, edits keep working after saving, and switches retain drafts', async ({ page }) => {
  const original = readFileSync(join(vault, 'Welcome.htmd'), 'utf8');
  await content(page).focus(); await editorKey(page, 'Meta+ArrowUp');
  await editorKey(page, 'Meta+ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe('A quieter place to think'.length);
  await content(page).pressSequentially(' faster', { delay: 12 });
  await editorKey(page, 'Meta+s');
  await expect.poll(() => readFileSync(join(vault, 'Welcome.htmd'), 'utf8')).toBe(original.replace('# A quieter place to think', '# A quieter place to think faster'));
  await content(page).pressSequentially(' still');
  await expect(page.locator('.dirty-dot')).toBeVisible();
  await page.getByRole('treeitem', { name: /Existing md/ }).click();
  expect(readFileSync(join(vault, 'Welcome.htmd'), 'utf8')).toContain('think faster still');
  await page.getByRole('treeitem', { name: /Welcome htmd/ }).click();
  await expect(page.getByRole('heading', { name: 'A quieter place to think faster still' })).toBeVisible();
});

test('external changes prevent overwrites and retain the editing document', async ({ page }) => {
  await content(page).focus(); await editorKey(page, 'Meta+ArrowUp');
  await content(page).pressSequentially('My draft ');
  writeFileSync(join(vault, 'Welcome.htmd'), '# External change\n');
  await page.getByRole('treeitem', { name: /Existing md/ }).click();
  await expect(page.getByRole('alert')).toContainText('File changed on disk');
  expect(readFileSync(join(vault, 'Welcome.htmd'), 'utf8')).toBe('# External change\n');
  await expect(page.getByRole('heading', { name: 'My draft A quieter place to think' })).toBeVisible();
});

test('an empty note accepts Markdown shortcuts and saves without an editing mode', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Empty htmd/ }).click();
  await expect(page.locator('.note-toolbar')).toContainText('Reference/Empty.htmd');
  await content(page).focus(); await content(page).pressSequentially('### Born here');
  await expect(page.getByRole('heading', { name: 'Born here', level: 3 })).toBeVisible();
  await editorKey(page, 'Enter'); await content(page).pressSequentially('New note.');
  await editorKey(page, 'Meta+s');
  await expect.poll(() => readFileSync(join(vault, 'Reference/Empty.htmd'), 'utf8')).toContain('### Born here\n\nNew note.');
});

test('slash menu filters, supports keyboard choice and dismissal, and inserts rich components', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Empty htmd/ }).click();
  await expect(page.locator('.note-toolbar')).toContainText('Reference/Empty.htmd');
  await content(page).focus(); await content(page).pressSequentially('/heading');
  const menu = page.getByRole('listbox', { name: 'Insert component' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(6);
  await editorKey(page, 'ArrowDown'); await editorKey(page, 'ArrowDown');
  await expect(menu.getByRole('option', { name: 'Heading 3', exact: true })).toHaveAttribute('aria-selected', 'true');
  await editorKey(page, 'Enter'); await content(page).pressSequentially('Chosen heading');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Chosen heading', level: 3 })).toBeVisible();
  await editorKey(page, 'Enter'); await content(page).pressSequentially('/task', { delay: 12 }); await expect(menu).toBeVisible();
  await editorKey(page, 'Enter'); await content(page).pressSequentially('Keyboard task');
  await expect(content(page).locator('li[data-type="taskItem"]')).toContainText('Keyboard task');
  await editorKey(page, 'Enter'); await editorKey(page, 'Enter');
  await content(page).pressSequentially('/table');
  await menu.getByRole('option', { name: 'Table', exact: true }).click();
  await expect(content(page).locator('table')).toBeVisible();
  await editorKey(page, 'Meta+ArrowUp'); await editorKey(page, 'Meta+ArrowRight');
  await editorKey(page, 'Enter'); await content(page).pressSequentially('/quote');
  await editorKey(page, 'Escape');
  await expect(menu).toHaveCount(0); await expect(content(page)).toContainText('/quote');
  await editorKey(page, 'Meta+s');
  const saved = readFileSync(join(vault, 'Reference/Empty.htmd'), 'utf8');
  expect(saved).toContain('### Chosen heading'); expect(saved).toContain('- [ ] Keyboard task'); expect(saved).toContain('|');
});

test('long-note lexer retains reference links across chunk boundaries', async ({ page }) => {
  const source = '[Across the note][target]\n\n' + Array.from({ length: 140 }, (_, i) => `Paragraph ${i}.\n\n`).join('') + '[target]: https://example.com/reference\n';
  writeFileSync(join(vault, 'Links.md'), source);
  await page.reload();
  await page.getByRole('treeitem', { name: /Links md/ }).click();
  await expect(content(page).getByRole('link', { name: 'Across the note' })).toHaveAttribute('href', 'https://example.com/reference');
  await content(page).focus(); await editorKey(page, 'Meta+s');
  expect(readFileSync(join(vault, 'Links.md'), 'utf8')).toBe(source);
});

test('continuous long documents support typing and keyboard navigation to the last node', async ({ page }, info) => {
  test.setTimeout(120_000);
  const results = [];
  for (const count of [100, 1000, 5000]) {
    writeFileSync(join(vault, 'Long.htmd'), Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}: **bold**, *emphasis*, and \`code\`. Café 🦀.\n\n`).join(''));
    await page.reload();
    await expect(page.locator('.ProseMirror')).toBeVisible();
    console.log('Opening continuous note:', info.project.name, count);
    const start = Date.now();
    await page.getByRole('treeitem', { name: /Long htmd/ }).click();
    await expect(page.locator('.ProseMirror').locator('p').first()).toContainText('Paragraph 1:', { timeout: 30_000 });
    const openObservedMs = Date.now() - start;
    console.log('Opened:', info.project.name, count, openObservedMs);
    await page.locator('.ProseMirror').evaluate(element => {
      const samples: number[] = [];
      Object.assign(window, { typingSamples: samples });
      element.addEventListener('beforeinput', () => {
        const start = performance.now(); requestAnimationFrame(() => samples.push(performance.now() - start));
      });
    });
    await page.locator('.ProseMirror').focus(); await page.locator('.ProseMirror').press('Meta+ArrowUp');
    await page.locator('.ProseMirror').pressSequentially('Typing stays responsive. ', { delay: 12 });
    await expect(page.locator('.ProseMirror').locator('p').first()).toContainText('Typing stays responsive.');
    await page.locator('.ProseMirror').press('Meta+ArrowDown');
    await page.locator('.ProseMirror').pressSequentially(' At the end.');
    await expect(page.locator('.ProseMirror').locator('p').last()).toContainText(`Paragraph ${count}:`);
    await expect(page.locator('.ProseMirror').locator('p').last()).toContainText('At the end.');
    const samples = await page.evaluate(() => (window as unknown as { typingSamples: number[] }).typingSamples);
    samples.sort((a, b) => a - b);
    results.push({ count, openObservedMs, mountedParagraphs: await page.locator('.ProseMirror').locator('p').count(),
      beforeinputToFrameP95Ms: samples[Math.floor((samples.length - 1) * .95)], samples: samples.length });
  }
  const artifacts = join(root, 'artifacts'); mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(artifacts, `continuous-${info.project.name}.json`), JSON.stringify({ browser: info.project.name,
    mode: 'headless Vite dev; real Rust vault through stdio IPC adapter; rAF precedes presentation; open includes test overhead', results }, null, 2) + '\n');
  await page.getByRole('treeitem', { name: /Welcome htmd/ }).click();
  await expect(page.getByRole('heading', { name: 'A quieter place to think' })).toBeVisible();
  await page.locator('.ProseMirror').focus(); await page.locator('.ProseMirror').press('Meta+ArrowUp');
  await page.screenshot({ path: join(artifacts, `continuous-${info.project.name}.png`) });
});

test('HTMD chart renders, edits its data, saves and reopens without losing the syntax example', async ({ page }, testInfo) => {
  await page.getByRole('treeitem', { name: /Chart htmd/ }).click();
  const chart = page.locator('[data-htmd-chart="true"]');
  await expect(chart).toHaveCount(1);
  await expect(chart.getByText('Notes written this week', { exact: true })).toBeVisible();
  await expect(chart.locator('svg').first()).toBeVisible();
  await expect(content(page).locator('pre').filter({ hasText: 'htmd:chart' })).toHaveCount(1);
  const original = readFileSync(join(vault, 'Examples/Chart.htmd'), 'utf8');
  await chart.getByRole('button', { name: 'Edit chart data' }).click();
  await expect(chart.locator('svg').first()).toBeVisible();
  const field = page.getByRole('textbox', { name: 'Chart JSON' });
  await field.fill('{');
  await page.getByRole('button', { name: 'Apply chart' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const json = original.split('```htmd:chart\n')[1].split('\n```')[0];
  const spec = JSON.parse(json); spec.title = 'Edited chart'; spec.series[0].values[0] = 12;
  await field.fill(JSON.stringify(spec, null, 2));
  await page.getByRole('button', { name: 'Apply chart' }).click();
  await expect(chart.getByText('Edited chart', { exact: true })).toBeVisible();
  await content(page).press('Meta+s');
  await expect.poll(() => readFileSync(join(vault, 'Examples/Chart.htmd'), 'utf8')).toContain('Edited chart');
  const saved = readFileSync(join(vault, 'Examples/Chart.htmd'), 'utf8');
  expect(saved.slice(saved.indexOf('## How it is stored'))).toBe(original.slice(original.indexOf('## How it is stored')));
  await page.reload();
  await page.getByRole('treeitem', { name: /Chart htmd/ }).click();
  await expect(chart.getByText('Edited chart', { exact: true })).toBeVisible();
  await page.screenshot({ path: join(root, `artifacts/chart-${testInfo.project.name}.png`) });
});

test('slash Chart inserts a custom rich node and supports typing after it', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Empty htmd/ }).click();
  await expect(content(page)).toHaveText('');
  await content(page).focus();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await content(page).pressSequentially('/chart', { delay: 12 });
  await expect(page.getByRole('option', { name: /Chart/ })).toBeVisible();
  await editorKey(page, 'Enter');
  await expect(page.locator('[data-htmd-chart="true"] svg').first()).toBeVisible();
  await content(page).pressSequentially('After chart');
  await expect(content(page).locator('p').last()).toHaveText('After chart');
  await content(page).press('Meta+s');
  await expect.poll(() => readFileSync(join(vault, 'Reference/Empty.htmd'), 'utf8')).toContain('```htmd:chart');
});
