// Actual local app, synthetic Lumen data; no model or document mutation.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2];
if (!['baseline', 'repaired'].includes(mode)) throw Error('Choose baseline or repaired');
const result = { mode, startedAt: new Date().toISOString(), sourceReads: [], blockedPosts: [], pageErrors: [], passed: false };
const check = (ok, message) => { if (!ok) throw Error(message); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
  let blockPosts = false;
  page.on('pageerror', error => result.pageErrors.push(error.message));
  await page.route('**/api/**', route => {
    const request = route.request();
    if (blockPosts && request.method() !== 'GET' && request.method() !== 'HEAD') {
      result.blockedPosts.push({ method: request.method(), path: new URL(request.url()).pathname });
      return route.abort();
    }
    return route.continue();
  });
  page.on('response', async response => {
    const url = new URL(response.url());
    if (/\/projects\/[^/]+\/sources$/.test(url.pathname)) {
      try {
        const body = await response.json();
        result.sourceReads.push({ path: url.pathname + url.search, status: response.status(), projectId: body.projectId,
          total: body.total, window: body.window, selection: body.selection,
          sources: body.sources?.map(row => ({ id: row.id, title: row.title, checksum: row.checksum })) });
      } catch { /* A cancelled navigation read is not the deliberate read below. */ }
    }
  });
  try {
    result.version = await (await page.request.get('http://127.0.0.1:5000/api/version')).json();
    await page.goto('http://127.0.0.1:5000/concept2cure/login', { waitUntil: 'domcontentloaded' });
    const chooser = page.getByRole('combobox', { name: 'Demo person' });
    await chooser.locator('option').filter({ hasText: 'Lumen Lead' }).waitFor({ state: 'attached' });
    const value = await chooser.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('Lumen Lead'))?.value);
    check(value, 'Lumen Lead is not available');
    await chooser.selectOption(value);
    await page.getByRole('button', { name: /demo access/i }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'));
    blockPosts = true;
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.locator('.pj-index button.pj-card,.pj-index button.ct-row').filter({ hasText: 'LMN-301' }).click();
    await page.locator('nav[aria-label="Project lifecycle"]').getByRole('button', { name: 'Evidence', exact: true }).click();
    const boxes = page.locator('.pj-src input[type=checkbox]:enabled');
    await boxes.first().waitFor();
    const titles = await boxes.evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label').slice(4, -11)));
    check(titles.length >= 2, 'Two readable sources are required');
    const first = titles[0];
    const second = titles.find(title => title !== first);
    check(second, 'Two distinct source titles are required');
    result.checkedTitles = [first, second];
    await page.getByRole('checkbox', { name: `Use ${first} as context`, exact: true }).first().check();
    const searchedRead = page.waitForResponse(response => {
      const url = new URL(response.url());
      return /\/sources$/.test(url.pathname) && url.searchParams.get('q') === second;
    });
    await page.getByLabel('Search sources by title or text').fill(second);
    await searchedRead;
    await page.getByRole('checkbox', { name: `Use ${first} as context`, exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('checkbox', { name: `Use ${second} as context`, exact: true }).first().waitFor();
    await page.getByRole('checkbox', { name: `Use ${second} as context`, exact: true }).first().check();
    result.draftLabel = await page.getByRole('button', { name: /Draft with \d+ pinned source/ }).innerText();
    await page.screenshot({ path: path.join(__dirname, `${mode}-selected-sources.png`) });
    check(result.draftLabel.includes('2 pinned sources'), 'Search discarded the off-page checked source');
    if (mode === 'repaired') {
      await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
      check(await page.getByRole('button', { name: /Draft with \d+ pinned source/ }).count() === 0, 'Clear selection retained explicit pins');
      check(!await page.getByRole('checkbox', { name: `Use ${second} as context`, exact: true }).isChecked(), 'Clear selection retained the visible checkbox');
      result.clearSelection = true;
      await page.getByRole('checkbox', { name: `Use ${second} as context`, exact: true }).check();
      const firstRead = page.waitForResponse(response => {
        const url = new URL(response.url());
        return /\/sources$/.test(url.pathname) && url.searchParams.get('q') === first;
      });
      await page.getByLabel('Search sources by title or text').fill(first);
      await firstRead;
      await page.getByRole('checkbox', { name: `Use ${first} as context`, exact: true }).first().check();
      check((await page.getByRole('button', { name: /Draft with \d+ pinned source/ }).innerText()).includes('2 pinned sources'), 'Selection could not be rebuilt after clearing');
      const exactRead = page.waitForResponse(response => /\/sources\?sourceIds=/.test(response.url()));
      await page.getByRole('button', { name: 'Build in editor', exact: true }).click();
      const verified = await exactRead;
      result.exactStatus = verified.status();
      check(verified.ok(), 'Exact selection read failed');
      const dialog = page.getByRole('dialog', { name: 'Build from selected sources' });
      await dialog.waitFor();
      result.dialogText = await dialog.innerText();
      check(result.checkedTitles.every(title => result.dialogText.includes(title)), 'Existing chooser lost a selected title');
      const exact = result.sourceReads.find(read => read.selection);
      check(exact?.sources.length === 2 && exact.selection.scope === 'verified-accessible-sources', 'Complete exact attestation is missing');
      check(exact.sources.every(source => result.dialogText.includes(`SHA-256 ${source.checksum}`)), 'Checked source checksums were not carried into the chooser');
      await page.screenshot({ path: path.join(__dirname, 'repaired-existing-chooser.png') });
      await dialog.getByRole('button', { name: 'New document', exact: true }).click();
      await page.getByText('This start uses 2 selected sources.', { exact: false }).waitFor();
      result.editorText = (await page.locator('main').innerText()).slice(0, 16000);
      check(result.editorText.includes('This start uses 2 selected sources.'), 'Existing document start lost the selected-source intent');
      await page.screenshot({ path: path.join(__dirname, 'repaired-single-editor-start.png') });
    }
    check(result.pageErrors.length === 0, 'Browser page errors occurred');
    check(result.blockedPosts.length === 0, 'Unexpected attempted mutation');
    result.passed = true;
  } catch (error) {
    result.failure = error.message;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(__dirname, `${mode}-browser-observation.json`), JSON.stringify(result, null, 2) + '\n');
    console.info(JSON.stringify({ mode, passed: result.passed, failure: result.failure, draftLabel: result.draftLabel, sourceReads: result.sourceReads.length }));
    await browser.close();
  }
})();
