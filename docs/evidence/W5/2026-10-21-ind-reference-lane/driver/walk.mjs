// W5/D7 — the IND eCTD demo lane, walked in headless Chromium on the product's own controls.
// Usage: OUT=<dir> STOP_AFTER=<click> node walk.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser, shot, mainText, settle, BASE, OUT, api } from './lib.mjs';

const PROGRAM_CODE = 'BX-512';
const STOP_AFTER = process.env.STOP_AFTER || 'all';
const VIDEO = process.env.VIDEO === '1';
const transcript = [];
const say = (line) => { transcript.push(line); console.info(line); };
let t0 = Date.now();
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
// With VIDEO=1 the heading carries the time into the recording (it starts with the page).
const step = (title) => { say(`\n  ## ${title}${VIDEO ? `  [video ${mmss(Date.now() - t0)}]` : ''}`); };

const { browser, context, page, auth, log, setStage } = await openBrowser({ video: VIDEO });
t0 = Date.now();
const program = (await api(auth.token, 'GET', '/api/c2c/projects')).body;
const rows = Array.isArray(program) ? program : (program.projects ?? program.data ?? []);
const bx = rows.find((p) => p.code === PROGRAM_CODE || String(p.name || '').includes('Vorelinib'));
if (!bx) throw new Error('BX-512 not found in /api/c2c/projects');
const PROGRAM = bx.id || bx.programId || bx.uuid;
say(`# program ${PROGRAM_CODE} = ${PROGRAM}`);

async function click1() {
  step('Click 1 — open BX-512 from Projects');
  setStage('Click 1');
  await page.goto(`${BASE}/concept2cure/projects`);
  await settle(page, 3000);
  await page.getByText('Vorelinib · KIT-mutant GIST (IND)').first().click();
  await settle(page, 3000);
  await shot(page, 'c1-project-home');
  const t = await mainText(page, 20000);
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- label is one of four uppercase literals at the call site below
  const grab = (label) => { const m = t.match(new RegExp(`${label}\\n([^\\n]+)`)); return m ? m[1] : '(absent)'; };
  say(`   identity: Sponsor=${grab('SPONSOR')} | Product=${grab('PRODUCT')} | Indication=${grab('INDICATION')} | IND number=${grab('IND NUMBER')}`);
}

async function openIndScreen() {
  await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}`);
  await settle(page, 3000);
  await page.getByRole('button', { name: /Forms and letters/ }).first().click();
  await settle(page, 4000);
}

async function click2() {
  step('Click 2a — record the applicant identity (sponsor record, then the program binding)');
  setStage('Click 2a');
  await openIndScreen();
  const identity = page.getByRole('region', { name: 'Recorded applicant identity' });
  await identity.getByRole('button', { name: 'Record a sponsor' }).click();
  const editor = page.getByRole('group', { name: 'Sponsor registry record' });
  const fill = async (label, value) => editor.getByLabel(label, { exact: true }).fill(value);
  await fill('Sponsor legal name', 'Concept2Cure Therapeutics');
  await fill('DUNS number', '000000512');
  await fill('Regulatory contact name', 'Sarah Chen');
  await fill('Regulatory contact telephone', '+1 (617) 555-0151');
  await fill('Regulatory contact email', 'regulatory@concept2cure.example');
  await fill('Authorized representative name', 'JM Smith');
  await fill('Authorized representative title', 'Chief Scientific Officer');
  await editor.getByLabel('Reason for sponsor record change').fill('Record the applicant for the BX-512 IND (demo sponsor; fictional DUNS and contact).');
  await editor.getByRole('button', { name: 'Save sponsor record' }).click();
  await settle(page, 2000);
  say(`   sponsor: ${(await editor.getByRole('status').first().innerText().catch(() => '(no status)')).trim()}`);
  await identity.getByRole('button', { name: 'Close sponsor editor' }).click().catch(() => {});
  const select = identity.getByLabel('Applicant sponsor record');
  const options = await select.locator('option').allInnerTexts();
  const pick = options.find((o) => o.includes('000000512'));
  await select.selectOption({ label: pick });
  await identity.getByLabel('Sponsor address', { exact: true }).fill('100 Demonstration Way, Cambridge, MA 02139, USA');
  await identity.getByLabel('IND type').selectOption({ label: 'Commercial IND' });
  await identity.getByLabel('Reason for program facts change').fill('Bind the recorded applicant sponsor to the BX-512 IND for forms and packaging.');
  await identity.getByRole('button', { name: 'Save to program' }).click();
  await settle(page, 2500);
  const statuses = await identity.getByRole('status').allInnerTexts();
  say(`   program facts: ${statuses.map((s) => s.trim()).filter(Boolean).join(' | ') || '(no status)'}`);
  say(`   recorded: ${(await identity.innerText()).match(/Recorded sponsor:[^\n]+/)?.[0] ?? '(no recorded sponsor line)'}`);
  await shot(page, 'c2a-applicant-identity');

  step('Click 2b — Form FDA 1571: build & check, then the PDF');
  setStage('Click 2b');
  await page.getByLabel('Phase', { exact: true }).selectOption({ label: 'Phase 1' }).catch(async () => {
    await page.locator('select').filter({ hasText: 'Phase 1' }).first().selectOption({ label: 'Phase 1' });
  });
  await page.getByLabel('Serial number').fill('0000').catch(() => {});
  const row1571 = page.locator('tr', { hasText: 'FDA 1571 — IND application' });
  await row1571.getByRole('button', { name: /Build & check/ }).click();
  await settle(page, 2500);
  say(`   build: ${(await row1571.locator('td').nth(1).innerText()).replace(/\n/g, ' · ')}`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), row1571.getByRole('button', { name: /PDF/ }).click()]);
  const pdfPath = path.join(OUT, 'form-1571-rendered.pdf');
  await dl.saveAs(pdfPath);
  say(`   rendered 1571: ${dl.suggestedFilename()} ${fs.statSync(pdfPath).size} bytes`);

  step('Click 2c — file the completed 1571 at m1.1 in sequence 0000');
  setStage('Click 2c');
  const target = page.getByRole('region', { name: 'Where completed forms are filed' });
  const subSel = target.locator('select').first();
  const subOpts = await subSel.locator('option').allInnerTexts();
  await subSel.selectOption({ label: subOpts.find((o) => o.includes('Vorelinib')) });
  await settle(page, 1500);
  const seqSel = target.locator('select').nth(1);
  const seqOpts = await seqSel.locator('option').allInnerTexts();
  say(`   sequences offered: ${seqOpts.join(' | ')}`);
  await seqSel.selectOption({ label: seqOpts.find((o) => o.includes('0000')) });
  // The sponsor completes and signs the form in Acrobat; this sandbox cannot. A stand-in:
  // the render plus one appended comment line (FDA's encryption intact), marked as such.
  const standIn = path.join(OUT, 'form-1571-standin-completed.pdf');
  fs.copyFileSync(pdfPath, standIn);
  fs.appendFileSync(standIn, '% STAND-IN completion for a sandbox walk (W5/D7, 2026-10-22): not completed by a sponsor, not signed.\n');
  say('   stand-in: the rendered 1571 plus one appended comment line — not sponsor-completed, not signed');
  await row1571.getByRole('checkbox').check();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    row1571.getByRole('button', { name: /Attach completed form/ }).click(),
  ]);
  await chooser.setFiles(standIn);
  await settle(page, 3000);
  say(`   attach: ${(await row1571.locator('td').nth(1).innerText()).replace(/\n/g, ' · ')}`);
  const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  say(`   notices: ${toasts.map((s) => s.trim()).filter(Boolean).slice(-3).join(' | ')}`);
  await shot(page, 'c2c-1571-filed-0000');
}

async function waitForOptions(select, n, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if ((await select.locator('option').count().catch(() => 0)) >= n) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`select never offered ${n} options`);
}

async function placeOpenDocument({ seqLabel, section, op, reason, shotName }) {
  await page.getByRole('button', { name: 'Place into filing' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  const subSel = dlg.locator('#apf-sub');
  await waitForOptions(subSel, 2);
  const subOpts = await subSel.locator('option').allInnerTexts();
  const subPick = subOpts.find((o) => o.includes('Vorelinib'));
  if (subPick) await subSel.selectOption({ label: subPick });
  const seqSel = dlg.locator('#apf-seq');
  await waitForOptions(seqSel, 2);
  const seqOpts = await seqSel.locator('option').allInnerTexts();
  say(`   sequences offered: ${seqOpts.join(' | ')}`);
  await seqSel.selectOption({ label: seqOpts.find((o) => o.startsWith(seqLabel)) });
  await dlg.locator('#apf-section').fill(section);
  await dlg.locator('#apf-op').selectOption({ label: op });
  await dlg.getByLabel(/Reason for this placement/).fill(reason);
  await dlg.getByRole('button', { name: /Place leaf in the sequence/ }).click();
  await settle(page, 2500);
  const verdicts = await dlg.getByRole('status').allInnerTexts();
  say(`   verdict: ${verdicts.map((v) => v.trim()).filter(Boolean).join(' | ')}`);
  await shot(page, shotName);
  await dlg.getByRole('button', { name: /^(Close|Cancel)$/ }).last().click().catch(() => {});
}

async function openAuthoredDocument(title) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`);
  await settle(page, 3000);
  const row = page.locator('div, li, tr').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Open' }) }).last();
  await row.getByRole('button', { name: 'Open' }).first().click();
  await settle(page, 4000);
}

async function click3() {
  step('Click 3 — place the approved 3.2.S.4 document in 0000, at the code the dialog proposes');
  setStage('Click 3');
  await openAuthoredDocument('Control of Drug Substance (CTD 3.2.S.4)');
  say(`   editor: ${page.url().replace(BASE, '')}`);
  await placeOpenDocument({ seqLabel: '0000', section: '3.2.S.4', op: 'New',
    reason: 'File the approved control of drug substance document in the original IND sequence.', shotName: 'c3-placed-0000' });
}

const V1 = path.resolve('in/v1/BX-512-analytical-procedures.pdf');
const V2 = path.resolve('in/v2/BX-512-analytical-procedures.pdf');
const VAULT_TITLE = 'BX-512-analytical-procedures';

async function openVault() {
  await page.goto(`${BASE}/concept2cure/vault?program=${PROGRAM}`);
  await settle(page, 4000);
}

async function vaultUpload(file) {
  await page.getByLabel('Document type for uploaded files').selectOption({ label: 'Module 3 · quality' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('vault-upload-button').click()]);
  await chooser.setFiles(file);
  await settle(page, 5000);
}

/** Open the uploaded document in the Vault, as a person would, by clicking its row. Nothing
 *  selects it after an upload, so acting on "the selected document" without this acted on
 *  whichever row the Vault opened by default. Refuses to go on unless the details name it. */
async function openVaultDocument() {
  await page.getByText(VAULT_TITLE, { exact: true }).first().click();
  await settle(page, 1500);
  const details = await page.getByTestId('vault-filing-block').count();
  const opened = (await mainText(page, 60000)).includes(VAULT_TITLE);
  if (!details || !opened) throw new Error(`the Vault did not open ${VAULT_TITLE}`);
}

async function placeVaultDocument({ seqLabel, section, op, reason, shotName }) {
  await page.getByRole('button', { name: /Place into filing…/ }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  const subSel = dlg.locator('#vpf-sub');
  await waitForOptions(subSel, 2);
  const subPick = (await subSel.locator('option').allInnerTexts()).find((o) => o.includes('Vorelinib'));
  if (subPick) await subSel.selectOption({ label: subPick });
  const seqSel = dlg.locator('#vpf-seq');
  await waitForOptions(seqSel, 2);
  const seqOpts = await seqSel.locator('option').allInnerTexts();
  say(`   sequences offered: ${seqOpts.join(' | ')}`);
  await seqSel.selectOption({ label: seqOpts.find((o) => o.startsWith(seqLabel)) });
  await dlg.locator('#vpf-section').fill(section);
  await dlg.locator('#vpf-op').selectOption({ label: op });
  await dlg.getByLabel(/Reason for this placement/).fill(reason);
  const submit = dlg.getByRole('button', { name: /^.?\s*Place into filing$/ });
  if (process.env.DEBUG_DIALOG) {
    const seen = new Map();
    const onReq = (r) => { if (r.url().includes('/api/')) { const k = r.url().replace(BASE, '').replace(/[0-9a-f-]{36}/g, ':id'); seen.set(k, (seen.get(k) ?? 0) + 1); } };
    page.on('request', onReq);
    for (let i = 0; i < 8; i += 1) {
      const box = await submit.boundingBox().catch(() => null);
      const h = await dlg.evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
      say(`   dbg t+${i * 250}ms button=${JSON.stringify(box)} dialogH=${h}`);
      await page.waitForTimeout(250);
    }
    page.off('request', onReq);
    say(`   dbg requests in 2s: ${JSON.stringify([...seen.entries()])}`);
    say(`   dbg dialog text: ${(await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 1500)}`);
  }
  for (let i = 0; i < 40 && await submit.isDisabled(); i += 1) await page.waitForTimeout(250);
  if (await submit.isDisabled()) say(`   !! placement button disabled: ${await submit.getAttribute('title')}`);
  try {
    await submit.click({ timeout: 8000 });
  } catch (err) {
    if (!/not stable/.test(String(err.message))) throw err;
    const metrics = [];
    for (let i = 0; i < 6; i += 1) {
      metrics.push(await dlg.locator('.de-body').evaluate((el) => `${el.scrollHeight}/${el.clientHeight}/${el.clientWidth}`).catch(() => '?'));
      await page.waitForTimeout(120);
    }
    say(`   observed: the enabled submit button never settles (1-px layout oscillation; .de-body scrollHeight/clientHeight/clientWidth over 720 ms: ${metrics.join(' ')}); clicked with force, as a person can`);
    await submit.click({ force: true });
  }
  await settle(page, 2500);
  const verdicts = await dlg.getByRole('status').allInnerTexts();
  say(`   verdict: ${verdicts.map((v) => v.trim()).filter(Boolean).join(' | ').slice(0, 900)}`);
  await shot(page, shotName);
  await dlg.getByRole('button', { name: /^(Close|Cancel)$/ }).last().click().catch(() => {});
}

async function click3b() {
  step('Click 3b — Vault: upload 3.2.S.4.2 analytical procedures v1.0, confirm its filing, place it in 0000');
  setStage('Click 3b');
  await openVault();
  await vaultUpload(V1);
  say(`   upload: ${(await page.locator('[role="status"]').allInnerTexts()).map((s) => s.trim()).filter((s) => /Auto-filed|uploaded|version/i.test(s)).join(' | ').slice(0, 400)}`);
  await openVaultDocument();
  await page.getByLabel('Reason for this filing decision').fill('Analytical procedures belong in Module 3, at 3.2.S.4.2.');
  await page.getByRole('button', { name: /Confirm filing/ }).click();
  await settle(page, 2500);
  say(`   filing: ${(await mainText(page, 60000)).split('\n').filter((l) => /CONFIRMED|FILED|Folder|v1\.0/.test(l)).slice(0, 6).join(' | ')}`);
  await placeVaultDocument({ seqLabel: '0000', section: '3.2.S.4.2', op: 'New',
    reason: 'File analytical procedures v1.0 in the original IND sequence.', shotName: 'c3b-vault-v1-placed-0000' });
}

async function vaultReviseV2() {
  step('Click 6c — Vault: upload the revised file under the same name, as version 2.0, and place it in 0001 as Replace');
  setStage('Click 6c');
  await openVault();
  await vaultUpload(V2);
  const offer = page.getByRole('button', { name: new RegExp(`Upload as a new version of ${VAULT_TITLE}`) });
  say(`   check-in offered: ${await offer.count()}`);
  await offer.click();
  await settle(page, 4000);
  const lines = (await mainText(page, 60000)).split('\n').filter((l) => /v2\.0|v1\.0|version/i.test(l)).slice(0, 8);
  say(`   versions: ${lines.join(' | ')}`);
  await shot(page, 'c6c-vault-v2-checked-in');
  await openVaultDocument();
  await placeVaultDocument({ seqLabel: '0001', section: '3.2.S.4.2', op: 'Replace',
    reason: 'Analytical procedures revised to 2.0; replace the version filed in 0000.', shotName: 'c6c-vault-v2-placed-0001' });
}

async function openSubmissionCenter(tab) {
  await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}`);
  await settle(page, 3000);
  if (tab) { await page.getByRole('tab', { name: tab }).click(); await settle(page, 2000); }
}

async function selectWorkingSequence(number) {
  await openSubmissionCenter('Sequences');
  await page.locator('main').getByText(number, { exact: true }).first().click();
  await settle(page, 1500);
}

async function compileSequence({ number, rehearsal, shotPrefix }) {
  await selectWorkingSequence(number);
  await page.getByRole('tab', { name: 'Dispatch' }).click();
  await settle(page, 2500);
  await page.getByRole('button', { name: /Validate and compile this sequence/ }).click();
  await settle(page, 4000);
  say(`   compile surface: ${page.url().replace(BASE, '')}`);
  const subType = await page.locator('#ectd-subtype').inputValue({ timeout: 1000 }).catch(() => null);
  const recorded = (await mainText(page, 60000)).split('\n').find((l) => /^Type\s/.test(l) || /recorded on sequence/.test(l) && /Type/.test(l));
  say(subType != null ? `   "Submission" selector reads: ${subType}` : `   no "Submission" selector; the screen states: ${recorded ?? '(no type line)'}`);
  if (rehearsal) await page.getByLabel(/Rehearsal — bind against recorded, unfiled sequences/).check();
  await page.getByRole('button', { name: /Compile eCTD/ }).click();
  await page.getByRole('button', { name: /Compiling…/ }).waitFor({ state: 'detached', timeout: 180000 }).catch(() => {});
  await settle(page, 3000);
  const hierarchy = page.getByRole('region', { name: 'Leaf hierarchy' });
  if (await hierarchy.count()) say(`   leaf hierarchy: ${(await hierarchy.innerText()).replace(/\n+/g, ' | ').slice(0, 1800)}`);
  const lifecycle = page.getByRole('region', { name: 'Lifecycle' });
  if (await lifecycle.count()) say(`   lifecycle: ${(await lifecycle.innerText()).replace(/\n+/g, ' | ').slice(0, 1800)}`);
  const body = await mainText(page, 60000);
  const facts = body.split('\n').filter((l) => /SHA-256|PDF\/A|Recorded|FDA form|DTD|validat|refus|blocked|not filed|rehearsal/i.test(l)).slice(0, 25);
  say(`   package facts: ${facts.join(' | ').slice(0, 2500)}`);
  const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  say(`   notices: ${toasts.map((s) => s.trim()).filter(Boolean).slice(-4).join(' | ').slice(0, 1200)}`);
  await shot(page, `${shotPrefix}-compiled`);
  const exportBtn = page.getByRole('button', { name: /Download package \(\.zip\)/ });
  say(`   download package control: ${await exportBtn.count()}`);
  if (await exportBtn.count()) {
    try {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), exportBtn.first().click()]);
      const file = path.join(OUT, 'packages', dl.suggestedFilename());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await dl.saveAs(file);
      say(`   exported: ${dl.suggestedFilename()} ${fs.statSync(file).size} bytes`);
    } catch (err) {
      const t2 = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
      say(`   export: no download (${err.message.split('\n')[0]}) — ${t2.map((s) => s.trim()).filter(Boolean).slice(-2).join(' | ')}`);
    }
  }
}

async function click4() {
  step('Click 4 — compile and export sequence 0000');
  setStage('Click 4');
  await compileSequence({ number: '0000', rehearsal: false, shotPrefix: 'c4-0000' });
}

async function click5() {
  step('Click 5 — dispatch readiness on sequence 0000 (Submission Center → Dispatch)');
  setStage('Click 5');
  await selectWorkingSequence('0000');
  await page.getByRole('tab', { name: 'Dispatch' }).click();
  await settle(page, 4000);
  const t = await mainText(page, 60000);
  const from = t.indexOf('Dispatch');
  say(`   dispatch tab: ${t.slice(from, from + 3500).replace(/\n+/g, ' | ')}`);
  await shot(page, 'c5-dispatch-readiness-0000');
}

async function click6() {
  step('Click 6a — Submission Center: start sequence 0001 (amendment)');
  setStage('Click 6a');
  await openSubmissionCenter('Sequences');
  await page.getByLabel('Type of sequence 0001').selectOption('amendment');
  await page.getByRole('button', { name: 'Start sequence 0001' }).click();
  await settle(page, 3000);
  const notes = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  say(`   start: ${notes.map((s) => s.trim()).filter(Boolean).slice(-2).join(' | ')}`);
  await shot(page, 'c6a-0001-started');

  step('Click 6b — withdraw the 0000 leaf at 3.2.S.4 from 0001');
  setStage('Click 6b');
  await openAuthoredDocument('Control of Drug Substance (CTD 3.2.S.4)');
  await placeOpenDocument({ seqLabel: '0001', section: '3.2.S.4', op: 'Delete',
    reason: 'Withdraw the control of drug substance document filed in 0000 (lifecycle rehearsal).', shotName: 'c6b-withdrawal-placed-0001' });

  await vaultReviseV2();

  step('Click 6d — rehearsal compile and export of 0001');
  setStage('Click 6d');
  await compileSequence({ number: '0001', rehearsal: true, shotPrefix: 'c6d-0001-rehearsal' });
}

const clicks = { click1, click2, click3, click3b, click4, click5, click6 };
try {
  for (const [name, fn] of Object.entries(clicks)) {
    await fn();
    if (STOP_AFTER === name) break;
  }
} catch (err) {
  say(`\n  !! ${err.message.split('\n')[0]}`);
  console.info(String(err.message).slice(0, 3000));
  await shot(page, 'zz-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  say(`\n  console errors: ${JSON.stringify(log.console.slice(0, 30), null, 2)}`);
  say(`  failed/4xx+ requests: ${JSON.stringify(log.failed.slice(0, 40), null, 2)}`);
  fs.writeFileSync(path.join(OUT, 'transcript.txt'), transcript.join('\n') + '\n');
  await context.close();
  await browser.close();
}
