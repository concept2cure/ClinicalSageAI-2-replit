/**
 * The runbook's "Live: what to show" steps, as each person sees them (walk.cjs runs them).
 */
const {
  BASE, PEOPLE, DATASETS, MANIFEST, APPROVE, state, shot, toTop, step, retrying, openCsr, checkCsrCatalog, openVersions,
} = require('./walk-common.cjs');

// ---------------------------------------------------------------- live: what to show (runbook, "Live: what to show")

/** Live 1: the Vault, the project's study files at Approved, and one file's review and approval sign-offs. */
async function liveVault() {
  const page = PEOPLE.author.page;
  await page.goto(`${BASE}/concept2cure/vault?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  await page.getByText(/^Uploads · \d+/).first().click();
  await page.locator('main').getByText(DATASETS[0][0], { exact: true }).filter({ visible: true }).first().click(); // the visible row (walk-common.cjs openVersions)
  const list = page.locator('main').getByText(/Module 5 · clinical · (Approved|In review|Not sent for review)/);
  await list.first().waitFor();
  const lines = await list.allInnerTexts();
  const approved = lines.filter((l) => l.includes('Approved')).length;
  const listShot = await shot(page, '30-live-vault-files-approved.png');
  const versions = await openVersions(page, MANIFEST);
  await versions.locator('text=/Approval|approved/i').first().scrollIntoViewIfNeeded().catch(() => {});
  return { outcome: approved === APPROVE.length ? 'pass' : 'fail', approvedFiles: approved, filesListed: lines.length, listShot,
    screenshot: await shot(page, '31-live-vault-manifest-sign-offs.png') };
}

/** Live 3: the prepared CSR; Study data, the build's section review, the narratives and the CSR files. */
async function livePreparedCsr() {
  const page = PEOPLE.author.page;
  const panel = await openCsr(page);
  const shots = {};
  await panel.locator('summary').first().scrollIntoViewIfNeeded();
  shots.studyData = await shot(page, '32-live-csr-study-data.png');
  const parts = [['section[aria-label="Section review"]', 'sectionReview', '33-live-csr-section-review.png'],
    ['section[aria-label="Patient safety narratives"]', 'narratives', '34-live-csr-narratives.png'],
    ['section[aria-label="CSR assembly"]', 'csrFiles', '35-live-csr-files.png']];
  const text = {};
  for (const [sel, key, file] of parts) {
    const part = panel.locator(sel);
    await toTop(part);
    text[key] = (await part.innerText()).split('\n').slice(0, 3).join(' | ').slice(0, 300);
    shots[key] = await shot(page, file);
  }
  return { text, screenshots: shots };
}

/** Live 4: the CSR's imported sections (F6: in the CSR itself; template text without a model key). */
async function liveWorkingCopy() {
  const page = PEOPLE.author.page;
  if (!state.data.importedIntoCsr) return { outcome: 'blocked', blockedBy: 'nothing imported into the CSR' };
  await retrying(page, () => openCsr(page));
  const sections = await page.locator('main').getByText(/^(1|8) · /).count().catch(() => 0);
  return { outcome: 'blocked', blockedBy: 'its text is the build’s template text: real drafting needs a model key', sectionsShown: sections,
    screenshot: await shot(page, '36-live-csr-sections.png') };
}

/** Live 5: the reviewer's CSR scientific review, as far as it goes. */
async function liveReview() {
  const page = PEOPLE.reviewer.page;
  await page.goto(`${BASE}/concept2cure/project-home?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Review/ }).click();
  const reviewTab = await shot(page, '37-live-review-tab.png');
  await page.getByRole('button', { name: 'Review documents on the review board' }).click();
  await page.getByRole('button', { name: /Record review decision/ }).first().click();
  const dlg = page.getByRole('dialog').last();
  await dlg.locator('#rv-decision').selectOption({ label: 'Approve' });
  await dlg.getByRole('checkbox', { name: /Study data the imported CSR build was drafted from/ }).check();
  const read = page.waitForResponse((r) => /\/csr-evidence\/preview$/.test(r.url()));
  await dlg.getByRole('button', { name: 'Read the retained tables' }).click();
  const preview = await read;
  await dlg.getByText('2. Each figure in the saved text').scrollIntoViewIfNeeded();
  const figuresShot = await shot(page, '38-live-review-figures.png');
  const selects = dlg.locator('select:not(#rv-decision)');
  for (let i = 0; i < await selects.count(); i++) await selects.nth(i).selectOption({ label: 'Not a result from these tables' });
  const gaps = (await dlg.innerText()).split('\n').filter((l) => /needs your statement|No figure is mapped|Confirm that/.test(l));
  await dlg.getByText('3. Your attestation').scrollIntoViewIfNeeded();
  const gapsShot = await shot(page, '39-live-review-attestation-gaps.png');
  const recordDisabled = await dlg.getByRole('button', { name: 'Record approval' }).isDisabled();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  return { outcome: 'blocked', blockedBy: 'the copy reports no result to map (template text); real drafting needs a model key',
    tablesPreview: preview.status(), candidateFigures: await selects.count().catch(() => null), recordApprovalDisabled: recordDisabled, gaps, reviewTab, figuresShot, screenshot: gapsShot };
}

/** Live 6: E-sign as the approver, and Place into filing, as far as each goes. */
async function liveSignAndPlace() {
  const page = PEOPLE.approver.page;
  if (!state.data.importedIntoCsr) return { outcome: 'blocked', blockedBy: 'nothing imported into the CSR' };
  await retrying(page, () => openCsr(page));
  const said = {};
  for (const [name, file] of [['E-sign', '40-live-esign.png'], ['Place into filing', '41-live-place-into-filing.png']]) {
    const button = page.getByRole('button', { name, exact: true }).first();
    said[name] = { disabled: await button.isDisabled().catch(() => null), title: await button.getAttribute('title').catch(() => null) };
    if (!said[name].disabled) {
      await button.click();
      await page.waitForTimeout(1500);
      said[name].opened = (await page.getByRole('dialog').last().innerText().catch(() => '')).split('\n').slice(0, 6).join(' | ').slice(0, 400);
    }
    said[name].screenshot = await shot(page, file);
    await page.keyboard.press('Escape');
  }
  return { outcome: 'blocked', blockedBy: 'the working copy is not approved (review blocked above)', said };
}

/** 390 wide: the project, the CSR's panel and the review board at phone width, with any horizontal overflow measured. */
async function liveNarrow() {
  const out = {};
  const views = [['author', '42-390-project.png', async (p) => { await p.goto(`${BASE}/concept2cure/project-home?program=${state.data.programId}`, { waitUntil: 'networkidle' }); }],
    ['author', '43-390-csr-build-panel.png', async (p) => { const panel = await openCsr(p); await panel.locator('summary').first().scrollIntoViewIfNeeded(); }],
    ['reviewer', '44-390-review-board.png', async (p) => { await p.goto(`${BASE}/concept2cure/review?program=${state.data.programId}`, { waitUntil: 'networkidle' }); }]];
  for (const [who, file, open] of views) {
    const page = PEOPLE[who].page;
    await page.setViewportSize({ width: 390, height: 844 });
    await retrying(page, () => open(page));
    await page.waitForTimeout(1500);
    out[file] = { horizontalOverflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), screenshot: await shot(page, file) };
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  return { views: out };
}

async function live() {
  await step('Live 1: the Vault, seven files Approved with their sign-offs', liveVault, { page: PEOPLE.author.page });
  await step('Live 2: New document (show only): the CSR is one type in the one editor', checkCsrCatalog, { page: PEOPLE.author.page });
  await step('Live 3: the prepared CSR: study data, section review, narratives, CSR files', livePreparedCsr, { page: PEOPLE.author.page });
  await step('Live 4: the working copy', liveWorkingCopy, { page: PEOPLE.author.page });
  await step('Live 5: review as the reviewer (CSR scientific review)', liveReview, { page: PEOPLE.reviewer.page });
  await step('Live 6: E-sign as the approver, then Place into filing', liveSignAndPlace, { page: PEOPLE.approver.page });
  await step('390 wide: project, CSR panel, review board', liveNarrow, { page: PEOPLE.author.page });
}

module.exports = { live };
