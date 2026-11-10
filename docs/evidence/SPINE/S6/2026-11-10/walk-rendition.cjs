/**
 * P-107 item 3, renditions, in the running app: a Word version is viewed as a PDF rendition bound to its SHA-256.
 *
 *   node docs/evidence/SPINE/S6/2026-11-10/walk-rendition.cjs [base-url]
 *
 * In the seeded LMN-301 project's Vault: 1. a Word file (made here with the `docx` library: a fictional note) is
 * uploaded through the Vault's own route; 2. its Versions row offers "View as PDF", which frames the rendition;
 * 3. the served headers bind it to the source (X-Rendition-Of-SHA256 is the version's recorded hash, X-Content-SHA256
 * its own); 4. the source still downloads as the Word file it is; a .txt version is refused a rendition by name.
 * Signs out at the end. Log: ./walk-rendition.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
const RUN = new Date().toISOString().slice(11, 19).replace(/:/g, '');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

/** The upload's answer, read once: the new version's id and recorded hash, or what the Vault said. */
function uploaded({ status, body }) {
  const d = (body && (body.document || (body.data && body.data.document))) || {};
  return { status, id: d.id || null, hash: d.contentHash || d.content_hash || null, error: (body && body.error) || null };
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

    // 1. A Word version, through the Vault's upload route.
    const title = `Stability note (fictional) ${RUN}`;
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph({ text: 'Stability note (fictional)', heading: HeadingLevel.HEADING_1 }),
      new Paragraph(`Made for the rendition walk ${RUN}. LMN-301 drug product, 25 C / 60% RH, 6 months: no trend observed.`),
      new Paragraph('This is demonstration text. It describes no real product or study.'),
    ] }] }));
    const upload = async (name, type, b64, docTitle) => page.evaluate(async ({ programId, name, type, b64, docTitle, code }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('programId', programId);
      form.append('documentCode', code);
      form.append('documentTitle', docTitle);
      form.append('documentType', 'OTHER');
      form.append('file', new File([bytes], name, { type }));
      const r = await fetch('/api/vault/ingest', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: form });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { programId: program.id, name, type, b64, docTitle, code: `S6-REND-${RUN}-${name.split('.').pop()}` }).then(uploaded);
    const word = await upload('stability-note.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docx.toString('base64'), title);
    expect(word.status < 300 && word.id, `the Word file was uploaded (${JSON.stringify(word)})`);
    step('1. a Word version is uploaded', { title, documentId: word.id, sourceSha256: word.hash });

    // 2. Its Versions row offers "View as PDF"; the rendition is framed.
    await page.goto(`${BASE}/concept2cure/vault?program=${program.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /^Uploads/ }).click();
    await page.getByRole('tabpanel', { name: /^Uploads/ }).getByText(title, { exact: false }).first().click();
    const versions = page.locator('aside.vd-detail details', { has: page.locator('summary', { hasText: /^Versions/ }) });
    await versions.waitFor({ timeout: 30000 });
    if (!(await versions.evaluate((d) => d.open))) await versions.locator('summary').click();
    const button = versions.getByTestId('vault-view-rendition').first();
    await button.waitFor({ timeout: 30000 });
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/documents/${word.id}/download?rendition=pdf`), { timeout: 120000 }),
      button.click(),
    ]);
    const headers = response.headers();
    expect(response.status() === 200 && /application\/pdf/.test(headers['content-type'] ?? ''), `the rendition is served as a PDF (${response.status()})`);
    const viewer = page.getByTestId('vault-version-viewer');
    await viewer.waitFor({ timeout: 60000 });
    await viewer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'rendition-1-viewer.png') });
    step('2. "View as PDF" frames the rendition', { viewerTitle: (await viewer.locator('.pf-viewer-t').innerText()).trim() });

    // 3. Bound to the source: both hashes, and the source's is the version's recorded hash.
    const source = headers['x-rendition-of-sha256'];
    const own = headers['x-content-sha256'];
    expect(/^[a-f0-9]{64}$/.test(source ?? '') && /^[a-f0-9]{64}$/.test(own ?? '') && source !== own, `both hashes are served (${source}, ${own})`);
    if (word.hash) expect(source === word.hash, `the rendition names the version's recorded hash (${source} vs ${word.hash})`);
    step('3. the rendition is bound to its source', { renditionOfSha256: source, renditionSha256: own, disposition: headers['content-disposition'] });

    // 4. The source is still the Word file; a text version has no rendition.
    const after = await page.evaluate(async ({ programId, id }) => {
      const h = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` };
      const src = await fetch(`/api/c2c/project-vault/${programId}/documents/${id}/download`, { headers: h });
      const head = new Uint8Array(await src.arrayBuffer()).slice(0, 2);
      return { status: src.status, type: src.headers.get('Content-Type'), zip: head[0] === 0x50 && head[1] === 0x4b, hash: src.headers.get('X-Content-SHA256') };
    }, { programId: program.id, id: word.id });
    expect(after.status === 200 && after.zip && after.hash === source, `the source still downloads as the Word file, with the same hash (${JSON.stringify(after)})`);
    const text = await upload('notes.txt', 'text/plain', Buffer.from(`Notes for the rendition walk ${RUN}.\n`).toString('base64'), `Rendition walk notes ${RUN}`);
    expect(text.status < 300 && text.id, `a text file was uploaded (${JSON.stringify(text)})`);
    const refused = await page.evaluate(async ({ programId, id }) => {
      const r = await fetch(`/api/c2c/project-vault/${programId}/documents/${id}/download?rendition=pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { programId: program.id, id: text.id });
    expect(refused.status === 422 && refused.body?.error === 'NO_RENDITION_FOR_FORMAT', `a text version is refused a rendition (${JSON.stringify(refused)})`);
    step('4. the source is unchanged; another format is refused by name', { source: after, refused: refused.body });
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-rendition.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
