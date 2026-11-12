/**
 * P-107 item 3, in the running app: a seal says when its version has been superseded.
 *
 *   node docs/evidence/SPINE/S6/2026-11-10/walk-seal-superseded.cjs [base-url]
 *
 * In the seeded LMN-301 project's Vault (Seals & fixity): 1. the seal holds the Investigator's Brochure and says
 * nothing of supersession; 2. a new version of that document is checked in through the Vault's own upload route
 * (POST /api/vault/ingest with supersedesDocumentId); 3. the same seal now reads "Superseded by version n on date",
 * and still holds, and opens, the version it sealed. Signs out at the end. Log: ./walk-seal-superseded.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function openSeal(page, programId) {
  await page.goto(`${BASE}/concept2cure/vault?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /^Seals/ }).click();
  const row = page.getByTestId('vault-seal-row').first();
  await row.waitFor({ timeout: 60000 });
  const holds = row.getByTestId('vault-seal-holds');
  if (!(await holds.evaluate((d) => d.open))) await holds.locator('summary').click();
  return row;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  try {
    await page.goto(BASE + '/');
    const projects = await page.evaluate(async (email) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json();
      const exp = new Date(Date.now() + 86_400_000).toISOString();
      for (const s of [localStorage, sessionStorage]) {
        s.setItem('trialsage_access_token', j.accessToken);
        s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp);
        s.setItem('trialsage_user', JSON.stringify(j.user));
      }
      const p = await fetch('/api/c2c/projects?limit=200', { headers: { Authorization: `Bearer ${j.accessToken}` } });
      return ((await p.json()).data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
    }, EMAIL);
    const program = projects.find((p) => /LMN-301/.test(p.title));
    expect(program, 'the LMN-301 demo project');

    // 0. A seal, when the project has none: "Seal this Vault…", signed with the demo signer's password.
    await page.goto(`${BASE}/concept2cure/vault?program=${program.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /^Seals/ }).click();
    await page.getByTestId('vault-seals').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    if ((await page.getByTestId('vault-seal-row').count()) === 0) {
      expect(process.env.DEMO_SIGNER_PASSWORD, 'DEMO_SIGNER_PASSWORD (from the Codespace app.env) to sign the seal');
      await page.getByTestId('vault-seal-open').click();
      await page.getByRole('radiogroup', { name: 'Signature meaning' }).getByRole('radio').first().click();
      await page.locator('.es-modal textarea, [role="dialog"] textarea').first().fill('Sealed for the supersession walk (P-107 item 3).');
      await page.locator('input[type="password"]').first().fill(process.env.DEMO_SIGNER_PASSWORD);
      await page.getByRole('button', { name: /Sign and commit/ }).click();
      await page.getByText('Signature applied').waitFor({ timeout: 30000 });
      step('0. the Vault is sealed, signed', {});
    }

    // 1. Before: the seal holds the brochure; nothing says superseded.
    let row = await openSeal(page, program.id);
    const before = await row.getByTestId('vault-seal-document').allInnerTexts();
    expect(before.some((t) => /Investigator's Brochure/.test(t)), `the seal holds the brochure (${before})`);
    const lines0 = await row.getByTestId('vault-seal-superseded').count();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'seal-1-before.png') });
    step('1. the seal holds the brochure', { documents: before.map((t) => t.replace(/\s+/g, ' ')), supersededLines: lines0 });

    // 2. A new version of the sealed document, through the Vault's upload route.
    const seals = await page.evaluate(async (id) => (await (await fetch(`/api/c2c/project-vault/${id}/seals`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } })).json()).data.seals, program.id);
    const sealed = seals[0].documents.find((d) => /Investigator's Brochure/.test(d.title ?? ''));
    const made = await page.evaluate(async ({ programId, sealed }) => {
      const form = new FormData();
      form.append('programId', programId);
      form.append('documentTitle', `${sealed.title} (revised)`);
      form.append('documentType', 'IB');
      form.append('supersedesDocumentId', sealed.id);
      form.append('file', new File([`Investigator's Brochure, revised for the seal walk ${Date.now()}.\n`], 'ib-revised.txt', { type: 'text/plain' }));
      const r = await fetch('/api/vault/ingest', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: form });
      const j = await r.json().catch(() => null);
      return { status: r.status, version: j?.document?.version ?? j?.data?.document?.version ?? null, error: j?.error ?? null, message: j?.message ?? null };
    }, { programId: program.id, sealed });
    // On a database where this walk already ran, the sealed version already has its successor: the Vault refuses a
    // second one (VERSION_NOT_CURRENT), which is the state step 3 reads.
    const already = made.status === 409 && made.error?.code === 'VERSION_NOT_CURRENT';
    expect(made.status < 300 || already, `a new version was checked in (${JSON.stringify(made)})`);
    step(already ? '2. the sealed version already has its successor (an earlier run); a second is refused' : '2. a new version of the sealed document is checked in',
      { sealedVersion: sealed.version, newVersion: made.version, refused: already ? 'VERSION_NOT_CURRENT' : null });

    // 3. After: the same seal says so, and still holds what it sealed.
    row = await openSeal(page, program.id);
    const line = row.getByTestId('vault-seal-superseded').first();
    await line.waitFor({ timeout: 30000 });
    const text = (await line.innerText()).replace(/\s+/g, ' ').trim();
    expect(/^Superseded by version .+ on \d{4}-\d{2}-\d{2}\. The seal still holds the version above\.$/.test(text), `the line (${text})`);
    const after = await row.getByTestId('vault-seal-document').allInnerTexts();
    const still = after.find((t) => /Investigator's Brochure/.test(t)) ?? '';
    expect(still.includes(`v${sealed.version}`) && still.includes(sealed.shortHash), `the seal still lists the sealed version and hash (${still})`);
    await line.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'seal-2-superseded.png') });
    step('3. the seal says its version was superseded; what it sealed is unchanged', { line: text, sealedRow: still.replace(/\s+/g, ' ') });
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-seal-superseded.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
