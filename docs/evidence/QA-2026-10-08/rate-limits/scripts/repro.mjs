// Reproduce the Vault document-request and data-room upload rate limits against
// the running app (RLS enforced) as the seeded admin, through the real sign-in form.
//
//   RL_OUT   evidence folder (JSON + text written here)
//   RL_PHASE "vault" (open N documents) | "dataroom" (drop 15 files) | "both"
//   RL_DOCS  how many Vault documents to open (default 8)
import { chromium, signIn, SEED_USER, BASE, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.RL_OUT;
const PHASE = process.env.RL_PHASE || 'both';
const DOCS = Number(process.env.RL_DOCS || 8);
const FILES = process.env.RL_FILES || path.join(path.dirname(new URL(import.meta.url).pathname), 'files');
if (!OUT) throw new Error('RL_OUT is required');
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const events = [];
let phase = 'signin';
const pathOf = (u) => new URL(u).pathname;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await signIn(browser, SEED_USER);
const page = await ctx.newPage();

page.on('request', (r) => {
  if (!r.url().includes('/api/')) return;
  events.push({ ms: Date.now() - t0, phase, ev: 'request', method: r.method(), path: pathOf(r.url()) });
});
page.on('response', async (r) => {
  if (!r.url().includes('/api/')) return;
  const h = r.headers();
  const row = {
    ms: Date.now() - t0, phase, ev: 'response', method: r.request().method(), path: pathOf(r.url()), status: r.status(),
    xRateLimitLimit: h['x-ratelimit-limit'] ?? null, xRateLimitRemaining: h['x-ratelimit-remaining'] ?? null,
  };
  if (r.status() === 429) {
    try { const j = JSON.parse(await r.text()); row.message = j.message ?? null; } catch { row.message = null; }
  }
  events.push(row);
});

const isDocGet = (e) => e.method === 'GET' && /\/api\/c2c\/project-vault\/[^/]+\/documents\/[^/]+\//.test(e.path);
const docSuffix = (p) => p.replace(/^.*\/documents\/[^/]+\//, '');

async function openVorelinib() {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1500);
  await page.getByText('Vorelinib', { exact: false }).first().click();
  await sleep(4000);
}

const summary = { startedAt: new Date(t0).toISOString(), app: BASE, phases: {} };

if (PHASE === 'vault' || PHASE === 'both') {
  phase = 'vault';
  await openVorelinib();
  await page.getByText('Vault (DMS)', { exact: true }).first().click();
  await page.waitForSelector('.vd-wrap', { timeout: 30000 });
  for (let i = 0; i < 30; i++) { if (!(await page.getByText('Loading the project vault…').count())) break; await sleep(500); }
  await sleep(1500);

  const lane = page.getByTestId('vault-uploads-lane');
  const buttons = lane.getByRole('button');
  const names = (await buttons.allInnerTexts()).map((s) => s.trim().split('\n')[0]).filter(Boolean);
  const uniq = [...new Set(names)].slice(0, DOCS);
  summary.documentsOpened = [];
  for (let i = 0; i < uniq.length; i++) {
    const title = uniq[i];
    phase = `open#${i + 1}`;
    const mark = events.length;
    await lane.getByRole('button', { name: title, exact: false }).first().click();
    await sleep(3500);
    const slice = events.slice(mark);
    const docGets = slice.filter((e) => e.ev === 'request' && isDocGet(e));
    const docResp = slice.filter((e) => e.ev === 'response' && isDocGet(e));
    const per = {};
    for (const r of docResp) {
      const k = docSuffix(r.path);
      per[k] ??= {};
      per[k][r.status] = (per[k][r.status] ?? 0) + 1;
    }
    summary.documentsOpened.push({
      index: i + 1,
      title,
      documentScopedGetsIssued: docGets.length,
      documentScopedResponses: docResp.length,
      byEndpointAndStatus: per,
      firstRefusal: docResp.find((r) => r.status === 429)?.message ?? null,
      rateLimitHeaders: docResp[0] ? { limit: docResp[0].xRateLimitLimit, lastRemaining: docResp[docResp.length - 1].xRateLimitRemaining } : null,
    });
    console.log(`open#${i + 1} ${title.slice(0, 50)} -> docGETs=${docGets.length} ${JSON.stringify(per)}`);
  }
}

if (PHASE === 'dataroom' || PHASE === 'both') {
  phase = 'dataroom';
  await openVorelinib();
  const dz = page.locator('.pj-dropzone');
  await dz.scrollIntoViewIfNeeded();
  const files = fs.readdirSync(FILES).filter((f) => f.endsWith('.txt')).sort().map((f) => path.join(FILES, f));
  const mark = events.length;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dz.click()]);
  await chooser.setFiles(files);
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const txt = await page.locator('section.pj-sec', { has: page.getByRole('heading', { name: 'Data room', exact: true }) }).innerText().catch(() => '');
    if (!/Uploading /.test(txt) && i > 3) break;
  }
  await sleep(2000);
  const slice = events.slice(mark).filter((e) => e.ev === 'response' && e.path === '/api/chat/upload');
  const byStatus = {};
  for (const r of slice) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  summary.dataRoomDrop = {
    filesDropped: files.length,
    responses: slice.map((r, i) => ({ n: i + 1, status: r.status, message: r.message ?? null, limit: r.xRateLimitLimit, remaining: r.xRateLimitRemaining })),
    byStatus,
  };
  console.log(`dataroom drop of ${files.length}: ${JSON.stringify(byStatus)}`);
  const chip = page.locator('section.pj-sec', { has: page.getByRole('heading', { name: 'Data room', exact: true }) });
  summary.dataRoomDrop.sectionText = (await chip.innerText().catch(() => '')).slice(0, 1500);
}

summary.finishedAt = new Date().toISOString();
summary.events = events;
fs.writeFileSync(path.join(OUT, `${PHASE}-run.json`), JSON.stringify(summary, null, 2));
const consoleErrors = [];
await browser.close();
console.log('wrote', path.join(OUT, `${PHASE}-run.json`), 'events', events.length);
