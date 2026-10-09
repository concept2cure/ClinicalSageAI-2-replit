/**
 * launch-demo/lib.mjs — the ONE way demo data enters a Concept2Cure database.
 *
 * Every record is created through the product's own HTTP API as a real signed-in
 * user, so it is validated, tenant-scoped, audited and hash-chained exactly like
 * a customer's work. Nothing here writes to a table directly, and nothing here
 * runs on deploy (CLAUDE.md Rule 1: reference data reaches a deployed database
 * only through a migration; this is an operator command against a running
 * server — laptop, staging, or a demo tenant in production).
 *
 * Idempotency is by NAME: every demo record's title starts with the pack's
 * DEMO_PREFIX, and a pack looks its records up before creating them, so the
 * command can be re-run after a partial failure. `purge` removes by the same
 * prefix through the API's own delete/archive paths, never by SQL.
 *
 * Reuses the validation harness's API client and PDF fixture (tests/validation/
 * lib) — one client, one rate-limit strategy, one PDF writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiClient, devLogin } from '../../../tests/validation/lib/harness.mjs';
import { makePdfBuffer, sha256 } from '../../../tests/validation/lib/fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const MANIFEST_ROOT = path.join(REPO_ROOT, 'docs', 'evidence', 'DEMO');

/** Prefix on every demo record's title. A customer never sees it unless they run the seed. */
export const DEMO_PREFIX = { biotech: '[Demo · Biotech]', mdx: '[Demo · MDX]' };

export { makePdfBuffer, sha256 };

/**
 * Sign in and return an API client bound to that identity.
 *   token   — a bearer token for the target server (staging/production demo tenant)
 *   email   — dev-login email (local only; server must run ALLOW_DEV_AUTH=1)
 * The token wins when both are present. Refuses when neither is usable.
 */
export async function connect({ baseUrl, email, token, onRecord } = {}) {
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const auth = await bearerFor(base, { email, token });
  const api = createApiClient({ baseUrl: base, accessToken: auth.accessToken, onRecord: onRecord || (() => {}) });
  const me = await api('GET', '/api/auth/me');
  if (me.status !== 200) throw new Error(`could not resolve the signed-in user (${me.status}): ${String(me.text ?? '').slice(0, 200)}`);
  return { api, baseUrl: base, identity: identityOf(me.json, auth.identity) };
}

/** A bearer token: the one given (DEMO_SEED_TOKEN) or a local dev-login. */
async function bearerFor(base, { email, token }) {
  const given = token || process.env.DEMO_SEED_TOKEN || null;
  if (given) return { accessToken: given, identity: {} };
  const who = email || process.env.DEMO_SEED_EMAIL || 'jonmichaelpsmith@gmail.com';
  const auth = await devLogin(base, who);
  return { accessToken: auth.accessToken, identity: { email: who } };
}

/** The signed-in identity from /api/auth/me, whichever envelope the route uses. */
function identityOf(body, fallback) {
  const u = body?.user ?? body?.data ?? body ?? {};
  return {
    email: u.email ?? fallback.email ?? null,
    userId: u.id ?? null,
    organizationId: u.organizationId ?? u.organization_id ?? u.defaultOrganizationId ?? null,
  };
}

/** Throw with the response when a call did not answer one of the accepted statuses. */
export function must(res, accepted, what) {
  const ok = Array.isArray(accepted) ? accepted.includes(res.status) : res.status === accepted;
  if (!ok) throw new Error(`${what}: HTTP ${res.status} ${String(res.text ?? '').slice(0, 400)}`);
  return res.json ?? {};
}

/** A step runner that prints progress and collects a manifest of what exists after the run. */
export function makeRun(pack) {
  const manifest = { pack, prefix: DEMO_PREFIX[pack], startedAt: new Date().toISOString(), records: {}, notes: [] };
  return {
    manifest,
    async step(title, fn) {
      process.stdout.write(`  • ${title} … `);
      try {
        const out = await fn();
        process.stdout.write(`ok${out ? ` — ${typeof out === 'string' ? out : ''}` : ''}\n`);
        return out;
      } catch (err) {
        process.stdout.write(`FAILED\n`);
        throw err;
      }
    },
    record(key, value) {
      manifest.records[key] = value;
    },
    note(text) {
      manifest.notes.push(text);
    },
    write() {
      const dir = path.join(MANIFEST_ROOT, pack);
      fs.mkdirSync(dir, { recursive: true });
      manifest.finishedAt = new Date().toISOString();
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      return path.join(dir, 'manifest.json');
    },
  };
}

/** Title helper: `${prefix} ${name}`. Packs use it for every record they create. */
export function demoTitle(pack, name) {
  return `${DEMO_PREFIX[pack]} ${name}`;
}

/** Find a record whose title/name starts with the pack prefix and matches `name` exactly. */
export function findDemo(rows, pack, name, field = 'name') {
  const want = demoTitle(pack, name);
  return (rows || []).find((r) => String(r?.[field] ?? r?.title ?? '') === want) || null;
}

/* ── Additions shared by the biotech and MDX packs (additive; nothing above renamed) ── */

/**
 * The second identity that signs (QMS approval, authoring e-signature). Read
 * from the same environment the OQ runners use (tests/validation/lib/
 * credentials.mjs): OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD, optional
 * OQ_AUTHOR_EMAIL. Returns null when the credential is not supplied, so a pack
 * records its signed steps as "not executed — signer credential not supplied"
 * and completes everything else. The password is held in memory for the
 * password-bearing requests only; it is never printed or written anywhere.
 */
export async function connectSigner({ baseUrl, authorEmail, onRecord } = {}) {
  const email = (process.env.OQ_SIGNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OQ_SIGNER_PASSWORD || '';
  if (!email || !password) return null;
  const author = (authorEmail || process.env.OQ_AUTHOR_EMAIL || '').trim().toLowerCase();
  if (author && author === email) {
    throw new Error(`OQ_SIGNER_EMAIL is the author identity (${author}); the two-person rule needs a second identity`);
  }
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const session = await devLogin(base, email);
  const api = createApiClient({ baseUrl: base, accessToken: session.accessToken, onRecord: onRecord || (() => {}), identity: email });
  return { email, password, session, api, userId: session.user?.id ?? null };
}

/** PDF string escaping: parentheses and backslashes, and anything outside Latin-1 becomes '?'. */
function pdfLatin1(s) {
  return String(s ?? '')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Greedy word wrap at `max` characters (Helvetica at 11 pt ≈ 88 chars across a 468 pt column). */
function wrap(text, max) {
  const out = [];
  for (const para of String(text ?? '').split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > max) {
        out.push(line.trim());
        line = word;
      } else line = `${line} ${word}`;
    }
    out.push(line.trim());
  }
  return out;
}

/**
 * A structurally valid MULTI-PAGE PDF (US Letter, Helvetica, running header,
 * "page n of N" footer) built from real prose, so a document filed by a demo
 * pack opens like a document and not like a one-line fixture. Pure JavaScript —
 * no Ghostscript, no fonts embedded, deterministic for the same input.
 *
 *   makeMultiPagePdfBuffer({
 *     title, subtitle, footer,
 *     sections: [{ heading, paragraphs: ['…', '…'] }, …],
 *   })
 */
export function makeMultiPagePdfBuffer({ title, subtitle = '', footer = '', sections = [] }) {
  const LINES_PER_PAGE = 44;
  const BODY_SIZE = 11;
  const LEADING = 14;
  const TOP = 700;
  const LEFT = 72;
  const lines = []; // { text, bold, size }
  const push = (text, bold = false, size = BODY_SIZE) => lines.push({ text, bold, size });
  push(title, true, 16);
  if (subtitle) push(subtitle, false, 11);
  push('');
  for (const sec of sections) {
    push(sec.heading, true, 13);
    for (const p of sec.paragraphs ?? []) {
      for (const l of wrap(p, 88)) push(l);
      push('');
    }
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  const objs = [];
  const add = (body) => {
    objs.push(body);
    return objs.length; // 1-based object number
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const fontR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  pages.forEach((pageLines, idx) => {
    let y = TOP;
    const ops = [];
    ops.push(`BT /F2 8 Tf ${LEFT} 752 Td (${pdfLatin1(title)}) Tj ET`);
    ops.push(`BT /F1 8 Tf ${LEFT} 40 Td (${pdfLatin1(`${footer ? footer + '  |  ' : ''}Page ${idx + 1} of ${pages.length}`)}) Tj ET`);
    for (const l of pageLines) {
      if (l.text) ops.push(`BT /${l.bold ? 'F2' : 'F1'} ${l.size} Tf ${LEFT} ${y} Td (${pdfLatin1(l.text)}) Tj ET`);
      y -= l.size > BODY_SIZE ? LEADING + 4 : LEADING;
    }
    const content = ops.join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R ` +
        `/Resources << /Font << /F1 ${fontR} 0 R /F2 ${fontB} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
