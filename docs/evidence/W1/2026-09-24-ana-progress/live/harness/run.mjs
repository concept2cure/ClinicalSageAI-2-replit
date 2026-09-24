// End to end, on the real server: attach a real file on Home, send, follow the
// turn to the conversation page, and check what the progress UI says against
// what the server did. The model is a local fake (fake-anthropic.mjs) that
// plays a fixed plan → search → draft → answer turn; everything else is real.
//
//   node run.mjs <label> <width> <height> <light|dark> [--live] [--rail]
// getComputedStyle runs inside page.evaluate — the browser's global, not Node's.
/* global getComputedStyle */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const [label, w, h, scheme, ...flags] = process.argv.slice(2);
const D = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/6396cbd4-d9c3-52f8-9173-e7fd431e4774/scratchpad';
const OUT = `${D}/e2e/out`;
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5057';
const login = JSON.parse(fs.readFileSync(`${D}/login.json`, 'utf8'));
const project = JSON.parse(fs.readFileSync(`${D}/project.json`, 'utf8')).data;
const FILE = `${D}/Protocol-ONC-221-v3.2.txt`;

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, colorScheme: scheme });
await ctx.addInitScript(({ login, project, dark }) => {
  localStorage.setItem('trialsage_access_token', login.accessToken);
  localStorage.setItem('trialsage_refresh_token', login.refreshToken);
  localStorage.setItem('trialsage_user', JSON.stringify(login.user));
  localStorage.setItem('trialsage_token_expiry', new Date(Date.now() + 8 * 3600e3).toISOString());
  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: project.id, title: project.title, code: project.code }));
  if (!localStorage.getItem('c2c-v2-prefs')) localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, anaOpen: true }));
}, { login, project, dark: scheme === 'dark' });

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
let streamBody = null;
let uploadResult = null;
page.on('request', (r) => {
  if (r.url().includes('/api/ana-ri/stream') && r.method() === 'POST') {
    try { streamBody = JSON.parse(r.postData() || '{}'); } catch { /* */ }
  }
});
page.on('response', async (r) => {
  if (r.url().includes('/api/chat/upload')) {
    try { uploadResult = await r.json(); } catch { /* */ }
  }
});

await page.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' });
const composer = page.locator('textarea').first();
await composer.waitFor({ timeout: 60000 });

// Attach a real file through the composer's own input → POST /api/chat/upload.
await page.locator('input[type=file]').first().setInputFiles(FILE);
await page.waitForFunction(() => document.body.innerText.includes('Protocol-ONC-221-v3.2.txt'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
check('upload answered by the server with a file id', uploadResult?.fileId, uploadResult?.fileId);

await composer.fill('Draft a one-page summary of the protocol primary endpoint');
await composer.press('Enter');
await page.waitForURL('**/conversation-thread', { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('.ana-step-chip'), null, { timeout: 30000 });

// The turn carried the file by the id the upload returned.
await page.waitForFunction(() => true);
for (let i = 0; i < 40 && !streamBody; i += 1) await page.waitForTimeout(250);
check('stream request carries file_ids', streamBody?.file_ids?.includes(uploadResult?.fileId), JSON.stringify(streamBody?.file_ids));

const chipText = () => page.locator('.ana-step-chip').first().innerText();

if (flags.includes('--live')) {
  await page.waitForFunction(() => /Step 2 of 3/.test(document.querySelector('.ana-step-chip')?.textContent || ''), null, { timeout: 60000 });
  check('live chip counts her declared plan', /Step 2 of 3/.test(await chipText()), await chipText());
  const live = await page.evaluate(() => ({
    current: document.querySelector('.ana-rail-item.is-current .ana-rail-l')?.textContent,
    done: document.querySelectorAll('.ana-rail-item.is-done').length,
    state: document.querySelector('.ana-work-state')?.textContent,
    polite: [...document.querySelectorAll('[aria-live="polite"]')].map((n) => n.textContent).filter(Boolean),
  }));
  check('rail marks the step in progress', /Draft the endpoint summary/.test(live.current || ''), JSON.stringify(live));
  check('state line says still working', /^Still working/.test(live.state || ''), live.state);
  await page.screenshot({ path: `${OUT}/${label}-live.png` });
}

await page.waitForFunction(() => /3 of 3 done/.test(document.querySelector('.ana-step-chip')?.textContent || ''), null, { timeout: 90000 });
await page.waitForTimeout(2500);
check('settled chip reads N of M done', /3 of 3 done/.test(await chipText()), await chipText());

const settled = await page.evaluate(() => {
  const chip = document.querySelector('.ana-step-chip');
  const controls = chip?.getAttribute('aria-controls');
  const used = [...document.querySelectorAll('.ana-work-line')].map((li) => li.textContent);
  return {
    expanded: chip?.getAttribute('aria-expanded'),
    controlsResolves: !!(controls && document.getElementById(controls)),
    state: document.querySelector('.ana-work-state')?.textContent,
    rail: [...document.querySelectorAll('.ana-rail-item')].map((li) => li.className.replace('ana-rail-item ', '') + ':' + li.querySelector('.ana-rail-l')?.firstChild?.textContent),
    used,
    headings: [...document.querySelectorAll('.ana-work h2, .ana-work h3')].map((n) => n.textContent),
    toggle: document.querySelector('.ana-activity-toggle')?.textContent,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
check('chip is a disclosure naming a panel that exists', settled.expanded === 'true' && settled.controlsResolves, JSON.stringify(settled));
check('state line says finished', /^Finished in/.test(settled.state || ''), settled.state);
check('every plan step done', settled.rail.length === 3 && settled.rail.every((r) => r.startsWith('is-done')), settled.rail.join(' | '));
check('uploads row names the real file and says how it was attached', settled.used.some((u) => /Protocol-ONC-221-v3\.2\.txt/.test(u) && /1 attached by name only/.test(u)), settled.used.join(' | '));
check('memory row says it could not be read (embeddings blocked here)', settled.used.some((u) => /Memory.*Could not be read/.test(u)), settled.used.join(' | '));
check('panel has no Outputs section', !settled.headings.includes('Outputs'), settled.headings.join(', '));
check('folded line does not repeat the plan', settled.toggle && !/Planned/.test(settled.toggle), settled.toggle);
check('no horizontal overflow', settled.overflowX <= 0, String(settled.overflowX));
const extra = await page.evaluate(() => ({
  artifactsPanel: !!document.querySelector('.ct-artifacts'),
  title: document.querySelector('.ct-head')?.textContent || '',
  doneMark: getComputedStyle(document.querySelector('.ana-rail-item.is-done .ana-rail-mark')).backgroundColor,
  pendingBg: getComputedStyle(document.querySelector('.ana-work')).backgroundColor,
}));
check('no empty Artifacts block beside a drafted document', !extra.artifactsPanel, String(extra.artifactsPanel));
const titleBox = await page.evaluate(() => { const t = document.querySelector('.ct-head-t'); return t ? Math.round(t.getBoundingClientRect().width) : 0; });
check('the title keeps readable room in the header', titleBox >= 100, String(titleBox));
check('title is the question, not the attachment line', !/Attached/.test(extra.title) && !/endpoint A\b/.test(extra.title), extra.title.slice(0, 120));
check('done marker is a filled disc', extra.doneMark !== extra.pendingBg && !/rgba\(0, 0, 0, 0\)/.test(extra.doneMark), extra.doneMark);
await page.screenshot({ path: `${OUT}/${label}-settled.png` });

// Open the record and one step's inputs.
const toggle = page.locator('.ana-activity-toggle').last();
if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
const searchRow = page.locator('button.ana-activity-row', { hasText: "project's documents" }).last();
if (await searchRow.count()) await searchRow.click();
await page.waitForTimeout(400);
const rows = await page.evaluate(() => [...document.querySelectorAll('.ana-activity-list > li')].map((li) => li.querySelector('.ana-activity-row')?.textContent?.replace(/\s+/g, ' ').trim()));
check('record opens on the plan, then the steps in order', /^Planned 3 steps/.test(rows[0] || ''), rows.join(' | '));
check('no round headers under a declared plan', rows.every((r) => !/Went back|First pass/.test(r || '')) && !(await page.locator('.ana-activity-round-h').count()), rows.join(' | '));
check('the draft is said once in the record', rows.filter((r) => /Primary endpoint summary/.test(r || '')).length === 1, rows.join(' | '));
const rowHeights = await page.evaluate(() => [...document.querySelectorAll('.ana-activity-row')].map((b) => Math.round(b.getBoundingClientRect().height)));
check('row targets are at least 24px', rowHeights.every((x) => x >= 24), rowHeights.join(','));
await page.screenshot({ path: `${OUT}/${label}-record-open.png`, fullPage: false });

if (flags.includes('--rail')) {
  // The same conversation from a module with the rail.
  await page.getByRole('button', { name: /Project/ }).first().click();
  await page.waitForTimeout(3000);
  const rail = await page.evaluate(() => ({
    rail: !!document.querySelector('aside.ana'),
    chip: document.querySelector('aside.ana .ana-step-chip')?.textContent,
    cards: document.querySelectorAll('aside.ana .ana-out-card').length,
  }));
  check('the rail shows the same turn and chip', rail.rail && /3 of 3 done/.test(rail.chip || ''), JSON.stringify(rail));
  await page.screenshot({ path: `${OUT}/${label}-rail.png` });
  await page.evaluate(() => { const b = document.querySelector('aside.ana .ana-body'); if (b) b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => {
    const c = document.querySelector('aside.ana .ana-out');
    return c ? { text: c.textContent?.replace(/\s+/g, ' ').trim(), h: Math.round(c.getBoundingClientRect().height) } : null;
  });
  check('the rail shows the draft as an output card with its save state', card && /Primary endpoint summary/.test(card.text) && /Saved as an authoring document/.test(card.text), JSON.stringify(card));
  await page.screenshot({ path: `${OUT}/${label}-rail-turn.png` });
}

if (flags.includes('--editor')) {
  // The drafted document in the full editor, and AnA asked from its pane.
  await page.getByText('Edit in Authoring').first().click();
  const ask = page.getByRole('textbox', { name: /Ask AnA about/ });
  await ask.waitFor({ timeout: 20000 });
  await ask.fill('Check the estimand wording in this section');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => /3 of 3 done/.test([...document.querySelectorAll('.ana-step-chip')].map((c) => c.textContent).join(' ')), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const ed = await page.evaluate(() => {
    const pane = document.querySelector('[aria-label^="AnA — document authoring"]');
    const convo = pane?.querySelector('[role="region"][aria-label="AnA conversation"]');
    const rec = convo?.querySelector('.ana-activity');
    const md = convo?.querySelector('.ana-md');
    return {
      pane: !!pane,
      chip: pane?.querySelector('.ana-step-chip')?.textContent,
      panel: !!pane?.querySelector('.ana-work'),
      recordBeforeAnswer: !!(rec && md && rec.compareDocumentPosition(md) & Node.DOCUMENT_POSITION_FOLLOWING),
      live: convo?.getAttribute('aria-live'),
      nextActions: [...(convo?.querySelectorAll('.ana-next-action') ?? [])].map((b) => b.textContent?.trim()),
    };
  });
  check('the editor pane runs the same chip, panel and record', ed.pane && /3 of 3 done/.test(ed.chip || '') && ed.panel, JSON.stringify(ed));
  check('the editor renders the record above the answer', ed.recordBeforeAnswer, JSON.stringify(ed));
  check('the editor conversation is not a live region', ed.live === null, String(ed.live));
  check('next actions read as labels, not ids', ed.nextActions.length > 0 && ed.nextActions.every((t) => !/_/.test(t || '')), JSON.stringify(ed.nextActions));
  await page.screenshot({ path: `${OUT}/${label}-editor.png` });
}

check('no page errors', errors.length === 0, errors.join(' || '));
fs.writeFileSync(`${OUT}/${label}-checks.json`, JSON.stringify(checks, null, 1));
for (const c of checks) console.info(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `  — ${c.detail}`}`);
await browser.close();
