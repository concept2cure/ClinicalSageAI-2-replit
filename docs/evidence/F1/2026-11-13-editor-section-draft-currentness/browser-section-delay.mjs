/** Controlled current-read rehearsal. Delays only an existing document's section GET;
 * all AnA POSTs are observed and aborted before server/provider dispatch.
 * node <file> <base> <program> <document> <email> <receipt-file> [fixed]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [base, programId, documentId, email, output, expected] = process.argv.slice(2);
assert.ok(base && programId && documentId && email && output);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(45000);
const receipt = { programId, documentId, expected: expected === 'fixed' ? 'fixed' : 'baseline', providerCalls: 0, errors: [] };
let release;
const pending = new Promise(resolve => { release = resolve; });
let observed;
const sectionRead = new Promise(resolve => { observed = resolve; });
const sectionPath = `/api/authoring/docs/${documentId}/sections`;
const api = (route) => page.evaluate(async route => {
  const r = await fetch(route, { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
  return { status: r.status, body: await r.json() };
}, route);
try {
  await page.goto(base);
  const login = await page.evaluate(async email => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const body = await r.json();
    if (!r.ok) return r.status;
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', body.accessToken);
      s.setItem('trialsage_refresh_token', body.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400000).toISOString());
      s.setItem('trialsage_user', JSON.stringify(body.user));
    }
    return r.status;
  }, email);
  assert.equal(login, 200);
  const saved = await api(`${sectionPath}?programId=${programId}`);
  assert.equal(saved.status, 200); assert.ok(saved.body.sections.length > 0);
  await page.route('**/api/ana-ri/stream', route => route.request().method() === 'POST' ? route.abort('aborted') : route.continue());
  await page.route(`**${sectionPath}*`, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    observed(); await pending; await route.continue().catch(() => {});
  });
  await page.goto(`${base}/concept2cure/document-authoring?program=${programId}&documentId=${documentId}`, { waitUntil: 'domcontentloaded' });
  await sectionRead;
  await page.locator('.ed-bar-id .dcv-bar-t:visible').waitFor();
  await page.getByTestId('ed-ana').getByRole('button', { name: 'AnA', exact: true }).click();
  const draft = page.getByRole('menuitem', { name: 'Draft with AnA', exact: true });
  receipt.pendingDisabled = await draft.isDisabled();
  if (expected === 'fixed') assert.equal(receipt.pendingDisabled, true, 'the section ask is disabled while its saved section read is pending');
  else assert.equal(receipt.pendingDisabled, false, 'baseline demonstrates the premature section action');
  if (expected === 'fixed') {
    release();
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('[role=menuitem]')].find(b => b.textContent.trim() === 'Draft with AnA');
      return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    });
  }
  await draft.click();
  await page.waitForURL('**/conversation-thread**');
  const [request] = await Promise.all([
    page.waitForRequest(r => new URL(r.url()).pathname === '/api/ana-ri/stream' && r.method() === 'POST'),
    page.getByRole('button', { name: 'Send message to AnA', exact: true }).click(),
  ]);
  const prepared = request.postDataJSON();
  const context = prepared.module_context;
  receipt.prepared = { projectId: prepared.project_id, documentId: context?.documentId, sectionId: context?.sectionId ?? null,
    sectionCode: context?.sectionCode ?? null, sectionUpdatedAt: context?.sectionUpdatedAt ?? null,
    savedRecordOnly: context?.savedRecordOnly, authoringSectionId: prepared.authoring_context?.sectionId ?? null,
    authoringSectionUpdatedAt: prepared.authoring_context?.sectionUpdatedAt ?? null };
  assert.equal(receipt.prepared.documentId, documentId);
  assert.equal(receipt.prepared.projectId, programId);
  const exact = saved.body.sections.filter(s => s.id === receipt.prepared.sectionId);
  receipt.matchingSavedSections = exact.length;
  assert.equal(exact.length, expected === 'fixed' ? 1 : 0);
  if (expected === 'fixed') {
    assert.equal(receipt.prepared.authoringSectionId, exact[0].id);
    assert.equal(receipt.prepared.sectionCode, exact[0].code);
    assert.equal(receipt.prepared.sectionUpdatedAt, exact[0].updated_at ?? null);
    assert.equal(receipt.prepared.authoringSectionUpdatedAt, exact[0].updated_at ?? null);
    assert.equal(receipt.prepared.savedRecordOnly, true);
  }
  receipt.outcome = expected === 'fixed' ? 'passed' : 'reproduced';
} catch (error) {
  receipt.outcome = 'failed'; receipt.errors.push(error.message); process.exitCode = 1;
} finally {
  release(); await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  console.info(JSON.stringify(receipt)); await browser.close();
}
