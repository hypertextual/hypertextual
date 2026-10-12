// Use an existing Playwright install without adding prototype dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 640 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
    await page.goto(url + '#editor');
    await page.waitForFunction(() => document.querySelectorAll('.tab').length === 3);
    await page.evaluate(() => document.fonts.ready);

    // Keyboard navigation reaches and activates the rich element.
    await page.locator('h1').focus();
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    assert(await page.locator('.chart').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter');
    assert(await page.locator('.data-editor').isVisible());
    await page.getByLabel('Pages Mon', { exact: true }).fill('-1');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert(await page.locator('.error').isVisible());
    await page.getByLabel('Pages Mon', { exact: true }).fill('8');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert(!(await page.locator('.data-editor').isVisible()));
    assert.match(await page.locator('.plot').getAttribute('aria-label'), /Mon: 8 pages/);
    await page.keyboard.press('Enter');
    await page.getByLabel('Chart title', { exact: true }).fill('Cancelled change');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.chart-title').textContent(), 'Drafting and revision');

    // Insert mode preserves literal colons; article drafts survive tab switches.
    await page.locator('h1').focus();
    await page.keyboard.press('i');
    await page.keyboard.type(' test:');
    assert(!(await page.locator('.command-panel').isVisible()));
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'A note on attention.md' }).click();
    assert.equal(await page.locator('#format').textContent(), 'MD');
    await page.getByRole('tab', { name: 'Writing rhythm.htmd' }).click();
    assert.match(await page.locator('h1').textContent(), /test:/);
    await page.locator('h1').focus();
    await page.keyboard.press('v');
    assert.equal(await page.locator('#mode').textContent(), 'VISUAL');
    assert.equal(await page.locator('h1').getAttribute('data-visual'), 'true');
    await page.keyboard.press('Escape');

    // Modal cursors and Visual selections grow with keyboard movement.
    await page.locator('h1').focus();
    assert(await page.locator('.modal-cursor').isVisible());
    await page.keyboard.press('v');
    const initialSelection=await page.evaluate(()=>window.getSelection().toString());
    await page.keyboard.press('l');
    await page.keyboard.press('l');
    assert((await page.evaluate(()=>window.getSelection().toString())).length > initialSelection.length);
    await page.keyboard.press('Escape');
    assert(await page.locator('.modal-cursor').isVisible());

    // Space leader opens groups, runs key sequences, and preserves text input.
    await page.locator('h1').focus();
    await page.keyboard.press('Space');
    assert(await page.getByRole('dialog', { name: 'Space shortcuts' }).isVisible());
    await page.keyboard.press('z');
    assert.match(await page.locator('.whichkey-message').textContent(), /No shortcut/);
    assert(await page.locator('#whichkey').isVisible());
    await page.keyboard.press('f');
    assert.match(await page.locator('#whichkey-path').textContent(), /Files/);
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('#whichkey-path').textContent(), 'Space · Shortcuts');
    await page.keyboard.press('f');
    await page.keyboard.press('e');
    assert(await page.locator('.tree .active').evaluate(el => el === document.activeElement));
    await page.locator('h1').focus();
    await page.keyboard.press('v');
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mode').textContent(), 'VISUAL');
    assert(await page.locator('h1').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    await page.keyboard.press('i');
    await page.keyboard.press('Space');
    assert(!(await page.locator('#whichkey').isVisible()));
    assert.match(await page.locator('h1').textContent(), /test:\s$/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await page.keyboard.press('/');
    assert(await page.locator('#palette').isVisible());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await page.keyboard.press('b');
    await page.keyboard.press('n');
    assert.equal(await page.locator('#format').textContent(), 'MD');
    await page.getByRole('tab', { name: 'Writing rhythm.htmd' }).click();
    await page.locator('h1').focus();

    // Login is visibly future scope and never pretends to authenticate.
    await page.getByRole('button', { name: 'Login (future scope)', exact: true }).click();
    assert.match(await page.locator('#status').textContent(), /future release/);
    assert(!(await page.locator('dialog[open]').count()));
    await page.locator('h1').focus();

    // Both command surfaces filter, run, dismiss, and restore focus.
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('not-a-command');
    assert.match(await page.locator('#palette-results').textContent(), /No matching/);
    await page.keyboard.press('Escape');
    assert(await page.locator('h1').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search commands').fill('Focus file tree');
    await page.keyboard.press('Enter');
    assert(await page.locator('.tree .active').evaluate(el => el === document.activeElement));
    await page.locator('h1').focus();
    await page.keyboard.press(':');
    assert(await page.locator('.command-panel').isVisible());
    await page.getByLabel('Colon command', { exact: true }).fill('next');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#format').textContent(), 'MD');
    await page.keyboard.press('Control+Shift+E');
    assert(await page.locator('.tree .active').evaluate(el => el === document.activeElement));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.tree .folder').nth(1).getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.tree .folder').nth(1).getAttribute('aria-expanded'), 'true');
    await page.keyboard.press(':');
    await page.locator('#colon-results button').first().focus();
    await page.keyboard.press('Escape');
    assert(!(await page.locator('.command-panel').isVisible()));

    // Slash completion stays at the caret and inserts a block without losing text.
    await page.goto(url + '#slash-menu');
    await page.waitForSelector('#slash-menu:not([hidden])');
    assert(await page.locator('p.text').first().evaluate(el => el === document.activeElement));
    await page.keyboard.type('nothingmatches');
    assert.match(await page.locator('.slash-results').textContent(), /No matching blocks/);
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#slash-menu').isVisible()));
    assert.equal(await page.locator('#mode').textContent(), 'INSERT');
    assert.match(await page.locator('p.text').first().textContent(), /\/nothingmatches$/);
    await page.goto('about:blank');
    await page.goto(url + '#slash-filtered');
    await page.waitForSelector('#slash-menu:not([hidden])');
    assert.equal(await page.locator('.slash-results button').count(), 1);
    await page.keyboard.press('Enter');
    assert(await page.getByRole('group', { name: 'Inserted chart', exact: true }).isVisible());
    assert(!((await page.locator('p.text').first().textContent()).includes('/chart')));
    await page.keyboard.press('Enter');
    await page.getByLabel('Inserted chart title', { exact: true }).fill('New evidence');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.inserted-rich-title').textContent(), 'New evidence');
    await page.goto('about:blank');
    await page.goto(url + '#slash-menu');
    await page.waitForSelector('#slash-menu:not([hidden])');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.slash-results [aria-selected=true]').getAttribute('data-block'), '1');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    assert(await page.locator('.inserted-block h2').isVisible());

    // Colon completions show full names while accepting implicit shorthand.
    await page.goto(url + '#command-filtered');
    await page.waitForSelector('.command-panel:not([hidden])');
    assert.deepEqual(await page.locator('#colon-results button').allTextContents(), ['write','write-all']);
    await page.getByLabel('Colon command', { exact: true }).fill('wa');
    assert.deepEqual(await page.locator('#colon-results button').allTextContents(), ['write-all']);
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#status').textContent(), /All open drafts saved/);
    await page.locator('h1').focus();

    // Settings preview themes, cancel drafts, and apply editing preferences.
    await page.keyboard.press('Control+,');
    assert(await page.getByRole('dialog', { name: 'Settings', exact: true }).isVisible());
    await page.getByLabel('Theme', { exact: true }).selectOption('dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.keyboard.press('Control+,');
    await page.getByLabel('Keymap', { exact: true }).selectOption('standard');
    await page.locator('#settings-apply').click();
    assert.equal(await page.locator('#mode').textContent(), 'EDIT');
    await page.keyboard.press('Control+,');
    await page.getByLabel('Keymap', { exact: true }).selectOption('helix');
    await page.locator('#settings-apply').click();
    assert.equal(await page.locator('#mode').textContent(), 'NORMAL');
    await page.keyboard.press('Control+,');
    await page.getByRole('tab', { name: 'Editor', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('#settings-plugins').isVisible());
    assert.match(await page.locator('#settings-plugins').textContent(), /future scope/);
    await page.keyboard.press('Escape');

    // Capture fresh, deterministic states rather than the test's changed draft.
    const states = { editor: 'editor', markdown: 'reference', 'graph-selected': 'graph-selected', 'graph-edit': 'graph-edit', palette: 'palette', command: 'command', visual: 'visual', insert: 'insert', whichkey: 'whichkey', 'whichkey-files': 'whichkey-files', 'slash-menu': 'slash-menu', 'slash-filtered': 'slash-filtered', 'block-inserted': 'block-inserted', 'visual-expanded': 'visual-expanded', settings: 'settings', 'settings-dark': 'settings-dark', 'settings-plugins': 'settings-plugins', 'command-filtered': 'command-filtered' };
    for (const [name, state] of Object.entries(states)) {
      await page.goto('about:blank');
      await page.goto(url + '#' + state);
      await page.waitForFunction(() => document.querySelectorAll('.tab').length === 3);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#format').textContent(), name === 'markdown' ? 'MD' : 'HTMD');
      assert.equal(await page.locator('h1').textContent(), name === 'markdown' ? 'A note on attention' : 'Writing rhythm');
      const layout = await page.evaluate(() => ({
        header: document.querySelector('.titlebar').getBoundingClientRect().toJSON(),
        tabs: document.querySelector('.tabs').getBoundingClientRect().toJSON(),
        main: document.querySelector('main').getBoundingClientRect().toJSON(),
        row: document.querySelector('.tree .file').getBoundingClientRect().toJSON()
      }));
      assert(layout.tabs.top >= layout.header.top && layout.tabs.bottom <= layout.header.bottom);
      assert.equal(layout.main.top, layout.header.bottom);
      assert(layout.row.height <= 24);
      if(name.startsWith('whichkey')){
        const pane=await page.locator('#whichkey').boundingBox();
        assert(pane.x > 700 && pane.width < 280 && pane.y + pane.height < 617);
        const rows=await page.locator('.whichkey-grid button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().toJSON()));
        assert(rows.every(row=>row.x===rows[0].x && row.height<=25));
      }
      if(name==='palette'){
        assert.equal(await page.locator('#palette').evaluate(el=>getComputedStyle(el,'::backdrop').backdropFilter),'none');
        assert.equal(await page.locator('#palette').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
      }
      if(name==='insert')assert(await page.locator('.insert-caret').isVisible());
      if(name==='command'||name==='command-filtered'){
        const panel=await page.locator('.command-panel').boundingBox();
        assert.equal(panel.x,0);assert.equal(panel.width,1120);assert(panel.height<115);
        const labels=await page.locator('#colon-results button').allTextContents();
        assert(labels.includes('write') && labels.includes('write-all'));
        if(name==='command')assert(labels.length>=12);
        else assert.deepEqual(labels,['write','write-all']);
      }
      await page.screenshot({ path: path.join(__dirname, 'snapshots', name + '.png'), animations: 'disabled' });
    }
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('Interaction checks passed; captured eighteen 1120 × 640 snapshots.');
  } finally {
    await browser.close();
  }
}

capture().catch(error => { console.error(error); process.exitCode = 1; });
