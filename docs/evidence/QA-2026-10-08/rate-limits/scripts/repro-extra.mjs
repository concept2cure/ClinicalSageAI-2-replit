// Second probe: (1) annotation post after two document opens, and the panel text
// that follows; (2) the Send-for-review route (POST /api/regulatory/documents/...)
// with the document budget spent, then after the window resets. The send probe
// posts to a missing id, so the route writes nothing.
//
//   RL_OUT, APP_URL, SERVER_LOG as in repro.mjs
import { chromium, signIn, SEED_USER, BASE, sleep } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.RL_OUT;
if (!OUT) throw new Error('RL_OUT is required');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const events = [];
let phase = 'signin';
const pathOf = (u) => new URL(u).pathname;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await signIn(browser, SEED_USER);
const page = await ctx.newPage();
page.on('response', (r) => {
  if (!r.url().includes('/api/')) return;
  const p = pathOf(r.url());
  if (!/project-vault|regulatory\/documents|chat\/upload/.test(p)) return;
  events.push({ ms: Date.now() - t0, phase, method: r.request().method(), path: p.replace(/\/api\/c2c\/project-vault\/[^/]+/, '/…/project-vault/…'), status: r.status(), message: null });
});

async function openVault() {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1500);
  await page.getByText('Vorelinib', { exact: false }).first().click();
  await sleep(4000);
  await page.getByText('Vault (DMS)', { exact: true }).first().click();
  await page.waitForSelector('.vd-wrap', { timeout: 30000 });
  for (let i = 0; i < 30; i++) { if (!(await page.getByText('Loading the project vault…').count())) break; await sleep(500); }
  await sleep(1500);
}
const lane = () => page.getByTestId('vault-uploads-lane');
async function openDoc(title) {
  await lane().getByRole('button', { name: title, exact: false }).first().click();
  await sleep(3500);
}

const summary = { app: BASE, startedAt: new Date(t0).toISOString() };
const WAIT_RESET = Number(process.env.RL_WAIT_MS || 65000);

// (1) annotation post after two document opens
phase = 'annotate';
await sleep(WAIT_RESET);
await openVault();
const docA = 'Vorelinib DS Stability Protocol STB-0042';
const docB = 'Vorelinib-Batch-Analysis-DS';
// Entering the Vault auto-selects a document (8 reads), so one more open leaves room for the POST.
await openDoc(docA);
void docB;
const mark = events.length;
const panel = page.getByTestId('vault-annotations');
await panel.getByTestId('vault-annotations-open').click();
await page.getByTestId('vault-annotations-kind').selectOption('request_changes');
await page.getByTestId('vault-annotations-body').fill('QA rate-limit probe: change request posted after two document opens.');
await sleep(300);
const postBtn = page.getByTestId('vault-annotations-post');
summary.postButtonEnabled = await postBtn.isEnabled().catch(() => null);
await postBtn.click();
await sleep(4500);
summary.annotate = {
  requests: events.slice(mark).map(({ method, path: p, status, ms }) => ({ ms, method, path: p, status })),
  panelText: (await panel.innerText().catch(() => 'ERR')).slice(0, 900),
};
console.log('annotate sequence:', JSON.stringify(summary.annotate.requests.map((r) => `${r.method} ${r.status} ${r.path.split('/').slice(-1)[0]}`)));
console.log('annotate panel:', summary.annotate.panelText.replace(/\n+/g, ' | ').slice(0, 400));

// (2) Send-for-review route, budget spent (just after the annotate phase)
phase = 'send';
const probe = async () => page.evaluate(async () => {
  const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
  const org = localStorage.getItem('currentOrganizationId') || '';
  const r = await fetch('/api/regulatory/documents/diag-missing-id/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-organization-id': org },
    body: JSON.stringify({ to: 'in_review' }),
    credentials: 'include',
  });
  const text = await r.text();
  return { status: r.status, remaining: r.headers.get('x-ratelimit-remaining'), limit: r.headers.get('x-ratelimit-limit'), body: text.slice(0, 160) };
});
summary.sendWhileBudgetSpent = await probe();
console.log('send (budget spent):', JSON.stringify(summary.sendWhileBudgetSpent));
await sleep(WAIT_RESET);
summary.sendAfterWindowReset = await probe();
console.log('send (window reset):', JSON.stringify(summary.sendAfterWindowReset));

summary.finishedAt = new Date().toISOString();
summary.events = events;
fs.writeFileSync(path.join(OUT, 'extra-run.json'), JSON.stringify(summary, null, 2));
await browser.close();
console.log('wrote', path.join(OUT, 'extra-run.json'));
