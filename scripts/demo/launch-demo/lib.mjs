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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiClient, devLogin } from '../../../tests/validation/lib/harness.mjs';
import { makePdfBuffer, sha256 } from '../../../tests/validation/lib/fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
// DEMO_MANIFEST_ROOT keeps a run's manifests out of the repository (a Codespace's own seed,
// .devcontainer/post-start.sh, writes them to its state directory, not over the committed evidence).
export const MANIFEST_ROOT = process.env.DEMO_MANIFEST_ROOT
  ? path.resolve(process.env.DEMO_MANIFEST_ROOT)
  : path.join(REPO_ROOT, 'docs', 'evidence', 'DEMO');

/** Prefix on every demo record's title. A customer never sees it unless they run the seed. */
export const DEMO_PREFIX = { biotech: '[Demo · Biotech]', mdx: '[Demo · MDX]', lumen: '[Demo · Lumen]', faux: '[Demo · Faux]', portfolio: '[Demo · Portfolio]' };

export { makePdfBuffer, sha256 };

/**
 * Sign in and return an API client bound to that identity.
 *   token   — a bearer token for the target server (staging/production demo tenant)
 *   email   — dev-login email (local only; server must run ALLOW_DEV_AUTH=1)
 * The token wins when both are present. Refuses when neither is usable.
 */
export async function connect({ baseUrl, email, token, onRecord, expectedOrganizationId, clientWorkspaceId } = {}) {
  // Validate operator scope before authentication; never truncate a malformed id.
  const expectedOrg = optionalPositiveId(expectedOrganizationId, 'organization');
  const workspaceId = optionalPositiveId(clientWorkspaceId, 'client workspace');
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const auth = await bearerFor(base, { email, token });
  const api = createApiClient({ baseUrl: base, accessToken: auth.accessToken, onRecord: onRecord || (() => {}) });
  // /me can carry an account's default organization; the verified session names
  // the actual tenant of this bearer and rechecks its membership.
  const response = await api('GET', '/api/auth/session');
  if (response.status !== 200) throw new Error(`Demo session verification failed (HTTP ${response.status}). No demo records were written.`);
  const identity = identityOf(response.json);
  const expectedEmail = (email || process.env.DEMO_SEED_EMAIL || auth.identity.email || '').trim().toLowerCase();
  if (expectedEmail && identity.email.toLowerCase() !== expectedEmail) {
    throw new Error('The signed-in account does not match the requested demo email. No demo records were written.');
  }
  if (expectedOrg !== undefined && Number(identity.organizationId) !== expectedOrg) {
    throw new Error('The signed-in organization does not match the requested demo organization. No demo records were written.');
  }
  // Exercise the same protected stores Projects and Tasking use. An empty
  // provisioned tenant may be seeded; an unread store is not an empty tenant.
  const projects = await api('GET', '/api/c2c/projects?limit=1');
  if (projects.status !== 200 || !Array.isArray(projects.json?.data) ||
      projects.json?.meta?.pendingStore === true || projects.json?.meta?.reconciliationRequired === true) {
    throw new Error('Demo Projects are unavailable or require access reconciliation. No demo records were written.');
  }
  const tasks = await api('GET', '/api/task-management/board');
  if (tasks.status !== 200 || !Array.isArray(tasks.json?.data) ||
      tasks.json?.meta?.partial !== false || !Array.isArray(tasks.json?.meta?.unreadSources) ||
      tasks.json.meta.unreadSources.length > 0) {
    throw new Error('Demo Tasking could not be read completely. No demo records were written.');
  }
  return { api, baseUrl: base, identity, clientWorkspaceId: workspaceId,
    preflight: { session: 'verified', projects: 'readable', tasking: 'readable',
      taskCount: tasks.json.data.length, browser: 'not_executed' } };
}

/** The work areas the demo walks through, as rail and catalog name them. */
export const DEMO_AREAS = {
  projects: 'Projects', tasks: 'Tasks', 'communication-center': 'Communication', vault: 'Vault',
  'submission-center': 'Submission Center', cmc: 'CMC / Module 3', rbm: 'Risk-based monitoring',
  biostatistics: 'Biostatistics', quality: 'Quality', insights: 'Reporting & analytics',
};

/** The demo areas this organisation's plan leaves locked: [{ id, label, requiredTier }]. */
async function lockedDemoAreas(api) {
  const nav = must(await api('GET', '/api/module-subscriptions/navigation'), 200, 'read the organisation\'s subscription');
  const byId = new Map((nav.surfaces ?? []).map((s) => [s.id, s]));
  const locked = Object.entries(DEMO_AREAS)
    .filter(([id]) => byId.get(id)?.entitled === false)
    .map(([id, label]) => ({ id, label, requiredTier: byId.get(id).requiredTier ?? null }));
  return { tier: nav.tier ?? null, masterAdmin: nav.masterAdmin === true, locked };
}

/**
 * Before seeding, make sure the demo's work areas are open to the organisation,
 * or say plainly which are not. `plan` (from --plan) is applied only by the
 * platform owner, through the Master licensing route a person would use, with
 * a reason on the audit trail; nothing else changes an organisation's plan.
 */
export async function ensureDemoPlan({ api, identity }, plan) {
  let state = await lockedDemoAreas(api);
  // The owner sees every area whatever the plan; the organisation's other
  // members see the plan's set, so --plan applies whenever the plan differs.
  if (plan && state.tier !== plan) {
    if (!state.masterAdmin) {
      throw new Error(`--plan ${plan}: only the platform owner can change an organisation's plan, and ${identity.email} is not. Nothing was seeded.`);
    }
    must(await api('PATCH', `/api/admin/master/licensing/tenants/${identity.organizationId}/tier`, {
      tier: plan, reason: 'Demo seed: the demonstration organisation needs every work area the demo shows.',
    }), 200, `set the organisation's plan to ${plan}`);
    state = await lockedDemoAreas(api);
  }
  if (state.locked.length) {
    console.warn(`\n⚠ On the ${state.tier ?? 'current'} plan these demo areas are locked for organisation ${identity.organizationId}, and show "not included in your subscription":`);
    for (const l of state.locked) console.warn(`    ${l.label}${l.requiredTier ? ` (from ${l.requiredTier})` : ''}`);
    console.warn('  Their records are still seeded. To open them, the platform owner sets the plan in Master licensing → Tenants, or re-runs this with --plan enterprise.\n');
  } else if (state.masterAdmin && state.tier !== 'enterprise') {
    console.info(`Every demo area is open to you as platform owner. Other members of organisation ${identity.organizationId} see what the ${state.tier ?? 'current'} plan includes; --plan enterprise opens every area to them.`);
  } else {
    console.info(`Every demo area is open on the ${state.tier ?? 'current'} plan.`);
  }
  return { tier: state.tier, locked: state.locked.map((l) => l.id), changedTo: plan && state.tier === plan ? plan : null };
}

/** Explicit ids are positive integers, not preferences inferred from a profile. */
function optionalPositiveId(value, label) {
  if (value === undefined) return undefined;
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value))) {
    throw new Error(`A valid positive ${label} id is required. No demo records were written.`);
  }
  return Number(value);
}

/** A bearer token: the one given (DEMO_SEED_TOKEN) or a local dev-login as the account the operator names. */
async function bearerFor(base, { email, token }) {
  const given = token || process.env.DEMO_SEED_TOKEN || null;
  if (given) return { accessToken: given, identity: {} };
  // 2026-10-15: no built-in identity. With none given it signed in as a real
  // person's personal address, and every demo record was created as, and
  // audited to, them.
  const who = email || process.env.DEMO_SEED_EMAIL;
  if (!who) {
    throw new Error(
      'demo seed: name the account the records are created as — --email <address> or DEMO_SEED_EMAIL ' +
        '(dev-login, local server), or DEMO_SEED_TOKEN. No identity is built in.',
    );
  }
  const auth = await devLogin(base, who);
  return { accessToken: auth.accessToken, identity: { email: who } };
}

/** Only the server-verified session supplies the actor and organization. */
function identityOf(body) {
  const u = body?.user;
  if (body?.authenticated !== true || !u || typeof u !== 'object' || Array.isArray(u) ||
      u.id == null || u.organizationId == null ||
      typeof u.email !== 'string' || !u.email.trim() ||
      typeof u.organizationName !== 'string' || !u.organizationName.trim()) {
    throw new Error('The demo account has no complete authenticated organization context. No demo records were written.');
  }
  optionalPositiveId(u.id, 'user');
  optionalPositiveId(u.organizationId, 'organization');
  return { email: u.email.trim(), userId: u.id, organizationId: u.organizationId,
    organizationName: u.organizationName.trim() };
}

/** Throw with the response when a call did not answer one of the accepted statuses. */
export function must(res, accepted, what) {
  const ok = Array.isArray(accepted) ? accepted.includes(res.status) : res.status === accepted;
  if (!ok) throw new Error(`${what}: HTTP ${res.status} ${String(res.text ?? '').slice(0, 400)}`);
  return res.json ?? {};
}

/** A step runner that prints progress and collects a manifest of what exists after the run. */
export function makeRun(pack) {
  const manifest = { pack, prefix: DEMO_PREFIX[pack], outcome: 'in_progress', browserQualification: 'not_executed', startedAt: new Date().toISOString(), records: {}, notes: [] };
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
    write(outcome = 'unqualified') {
      if (!['seeded_unqualified', 'purged', 'failed', 'unqualified'].includes(outcome)) throw new Error('Invalid demo run outcome');
      manifest.outcome = outcome;
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

/**
 * The synthetic second person who reviews the demo's documents (P-122, 2026-11-10). Since P-95 (33c3e4de9) an
 * approval is refused (409 REVIEW_REQUIRED) until the document's latest review route names a reviewer and every
 * reviewer has signed, and the author is never their own reviewer. With no second signer supplied, the seed left
 * every review "not executed", so no seeded document could be approved in a live demo.
 *
 * This member is made through the product, as an administrator adds anyone: POST /api/tenant-users (role
 * reviewer), then the activation link the server hands back when it sends no email, redeemed with a random password
 * (POST /api/auth/reset-password). The password is held in memory for this run's review signatures and is never
 * printed, recorded or written. The address is synthetic (`@example.test`, a reserved domain) and nothing else is
 * accepted. On a later run the member is found and its password is not known: what still needs its signature is
 * said, never faked. Null when the seed identity may not add members, or the server sent the link by email.
 */
export const SYNTHETIC_REVIEWER = { email: 'demo-reviewer@example.test', name: 'Demo Reviewer (synthetic)', role: 'reviewer' };

export async function ensureSyntheticReviewer({ api, baseUrl, identity, onRecord } = {}) {
  const { email, name, role } = SYNTHETIC_REVIEWER;
  if (!/^[a-z0-9.+-]+@example\.test$/.test(email)) throw new Error('The synthetic reviewer must be an @example.test address');
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const org = Number(identity?.organizationId);
  const listed = await api('GET', `/api/tenant-users/${org}`);
  const rows = Array.isArray(listed.json) ? listed.json : [];
  const found = rows.find((r) => String(r.email ?? '').toLowerCase() === email) || null;
  let password = null;
  let note = null;
  if (!found) {
    const created = await api('POST', '/api/tenant-users', { email, name, role, organizationId: org });
    if (created.status !== 201) return { state: 'not created', note: `adding the synthetic reviewer answered HTTP ${created.status} ${JSON.stringify(created.json ?? '').slice(0, 160)}` };
    const setupUrl = created.json?.invitation?.setupUrl;
    const token = setupUrl ? new URL(setupUrl).searchParams.get('token') : null;
    if (!token) return { state: 'created, no password', note: 'the server emailed its activation link, so the seed cannot set its password' };
    const candidate = `${crypto.randomBytes(18).toString('base64url')}-Rv9!`;
    const redeemed = await fetch(`${base}/api/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ token, newPassword: candidate }),
    });
    if (redeemed.ok) password = candidate;
    else note = `its activation link was refused (HTTP ${redeemed.status})`;
  } else {
    note = 'it was added on an earlier run, and its password is never kept';
  }
  /* Signed in as a person is: the development sign-in on a local server, else the password just set. */
  let session;
  try { session = await devLogin(base, email); } catch (err) {
    if (!password) return { state: found ? 'found' : 'created', email, password: null, note: `${note ?? 'no password'}; ${err.message.slice(0, 120)}` };
    // Read when needed: a stand-in harness (demo-recovery.test.mjs) carries only what the rest of the seed uses.
    const { passwordLogin } = await import('../../../tests/validation/lib/harness.mjs');
    session = await passwordLogin(base, { email, password });
  }
  const reviewerApi = createApiClient({ baseUrl: base, accessToken: session.accessToken, onRecord: onRecord || (() => {}), identity: email });
  return { state: found ? 'found' : 'created', email, password, session, api: reviewerApi, userId: session.user?.id ?? null, note };
}

/**
 * Characters the pack prose uses that Latin-1 lacks. Until 2026-11-12 each printed as "?" in every seeded PDF
 * (GA-DEMO-14). The fonts are Helvetica with WinAnsiEncoding, which has the dashes, the curly quotes, the bullet,
 * the ellipsis and the euro sign at its own codes (0x80-0x9f); the rest has no code there and is written out.
 */
const WIN_ANSI = { '\u2013': '\x96', '\u2014': '\x97', '\u2018': '\x91', '\u2019': '\x92', '\u201c': '\x93', '\u201d': '\x94', '\u2022': '\x95', '\u2026': '\x85', '\u20ac': '\x80', '\u2122': '\x99' };
const SPELLED = { '\u2265': '>=', '\u2264': '<=', '\u2212': '-', '\u2192': '->', '\u2190': '<-', '\u2500': '-', '\u2248': '~', '\u2260': '!=', '\u03b1': 'alpha', '\u03b2': 'beta', '\u03b3': 'gamma', '\u03b4': 'delta', '\u03b8': 'theta', '\u03ba': 'kappa', '\u03bb': 'lambda', '\u03c3': 'sigma', '\u00a0': ' ' };

/** PDF string escaping: WinAnsi and spelled-out characters first, then parentheses and backslashes; anything else becomes '?'. */
function pdfLatin1(s) {
  return String(s ?? '')
    .replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u2122]/g, (c) => WIN_ANSI[c])
    .replace(/[\u2265\u2264\u2212\u2192\u2190\u2500\u2248\u2260\u03b1-\u03c3\u00a0]/g, (c) => SPELLED[c] ?? '?')
    .replace(/[^\x20-\x7e\x80-\xff]/g, '?')
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
  // Wrapped to the 468 pt column: a long subtitle ran off the page (GA-DEMO-14).
  for (const l of wrap(title, 56)) push(l, true, 16);
  if (subtitle) for (const l of wrap(subtitle, 84)) push(l, false, 11);
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
    const header = title.length > 110 ? `${title.slice(0, 109).trimEnd()}\u2026` : title;
    ops.push(`BT /F2 8 Tf ${LEFT} 752 Td (${pdfLatin1(header)}) Tj ET`);
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

/**
 * Write an SOP's text into its editing copy, where a section is still empty
 * (2026-10-31). A QMS document's text is authored in the editor, never posted
 * with the register entry, and it cannot be sent for review or approved with
 * no saved text (QMS_CONTENT_REQUIRED). The editing copy's sections are coded
 * `qms-<key>`; `textByKey` maps each key to plain text. Returns how many
 * sections were written.
 */
/**
 * Send a QMS draft for review, naming the second signer as its approver
 * (2026-11-09). The server has refused, since 2026-10-08, to approve a draft:
 * only a document under review is approved (QMS_INVALID_STATE). It also refuses
 * to send one with no review route that names its approver (RR4,
 * REVIEW_ROUTE_REQUIRED). The packs approved straight from draft and sent
 * without a route, so on a fresh database each stopped at its QMS step. The
 * author sends; the approver is the signer, never the author (two-person
 * rule). `approvalDueDate` is the route's due date (YYYY-MM-DD).
 */
export async function sendQmsForReview(api, doc, signer, { reason, approvalDueDate }) {
  if (!signer?.userId) throw new Error(`QMS document ${doc.docNumber ?? doc.id}: the approver (the second signer) has no account id`);
  const res = must(await api('PATCH', `/api/mdx/qms/documents/${doc.id}`, {
    status: 'in_review',
    reason,
    route: { approvers: [Number(signer.userId)], approvalDueDate },
  }), 200, `send ${doc.docNumber ?? doc.id} for review`);
  return res.data?.status ?? 'in_review';
}

export async function fillQmsSections(api, qmsId, textByKey) {
  const editor = must(await api('GET', `/api/mdx/qms/documents/${qmsId}/editor`), 200, `open the editing copy of QMS document ${qmsId}`);
  const docId = (editor.data ?? editor)?.document?.id;
  if (!docId) throw new Error(`QMS document ${qmsId} has no editing copy`);
  const sections = must(await api('GET', `/api/authoring/docs/${docId}/sections`), 200, `read the sections of ${docId}`).sections ?? [];
  const html = (text) => `<p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  let written = 0;
  for (const s of sections) {
    const text = textByKey?.[String(s.code ?? '').replace(/^qms-/, '')];
    if (!text || String(s.content ?? '').replace(/<[^>]*>/g, '').trim()) continue;
    must(await api('PATCH', `/api/authoring/sections/${s.id}`, { content: html(text), changeReason: 'Demo: write the SOP text for the demonstration' }), 200, `write section ${s.code}`);
    written += 1;
  }
  return written;
}
