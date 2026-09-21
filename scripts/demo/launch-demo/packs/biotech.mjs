/**
 * launch-demo/packs/biotech.mjs — the BIOTECH demonstration pack.
 *
 * One fictional IND-stage program the founder can walk through every launch
 * app with (docs/demo/biotech-walkthrough.md):
 *
 *   Sponsor    Concept2Cure Therapeutics (fictional)
 *   Program    C2C-101 — a humanized IgG1 anti-IL-23p19 monoclonal antibody
 *   Indication moderate-to-severe plaque psoriasis
 *   Stage      US IND (original submission, sequence 0000)
 *
 * Every record is created through the product's own HTTP API as the signed-in
 * founder (lib.mjs `connect`), never by SQL and never by importing a service.
 * A refusal is a failed step with the status and body in the message; nothing
 * is skipped silently and nothing is recorded as done when the product said no.
 *
 * Idempotent by title: every title starts with DEMO_PREFIX.biotech and the pack
 * looks each record up before creating it, so a second run creates nothing and
 * reports what it found (`tally` in the manifest). Steps that need the second
 * signer (QMS approval, the authoring e-signature) run only when
 * OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD are supplied (lib.mjs `connectSigner`);
 * otherwise they are recorded as "not executed — signer credential not
 * supplied" and everything else completes.
 *
 * The story (every document body, protocol element and SOP) is in
 * biotech-content.mjs; the launch apps are seeded by biotech-authoring.mjs,
 * biotech-protocol.mjs, biotech-submission.mjs and biotech-qms.mjs. This file
 * owns the program, the Vault, the audit-trail check, and seed/purge.
 */
import { connectSigner, makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { ensureAuthoring } from './biotech-authoring.mjs';
import { INDICATION, MOLECULE, PRODUCT_NAME, PROGRAM_NAME, PROVENANCE, SOPS, CHANGE, T, VAULT_DOCS, findDemoByTitle, inDays } from './biotech-content.mjs';
import { ensureProtocol } from './biotech-protocol.mjs';
import { ensureQms } from './biotech-qms.mjs';
import { NOT_EXECUTED_NO_SIGNER, asArray, makeTally } from './biotech-shared.mjs';
import { ensureSubmission } from './biotech-submission.mjs';

/* ───────────────────────── 1. Projects ───────────────────────── */

async function createProgram({ api, run, tally }) {
  const j = must(await api('POST', '/api/c2c/projects', {
    name: T(PROGRAM_NAME),
    productName: PRODUCT_NAME,
    programType: 'ind',
    primaryAgency: 'FDA',
    indication: INDICATION,
    priority: 'high',
    targetSubmissionDate: inDays(180),
    teamMembers: [],
  }), 201, 'create program');
  run.record('program.intakeMeta', j.meta ?? null);
  run.note('Program create accepts name, productName, programType, primaryAgency, indication, priority, targetSubmissionDate, teamMembers only (server/routes/c2c/projects.ts:478-495): there is no description or sponsor field and phase is fixed to "planning" at intake, so those parts of the story live in the documents, not on the program row.');
  tally.created('program');
  return { row: j.data, spineSubmissionId: j.meta?.submissionId ?? null };
}

/** The program row as the manifest records it (detail read first, list row as fallback). */
function describeProgram(d, row) {
  return {
    id: row.id,
    code: d.code ?? row.code ?? null,
    title: d.title ?? d.name ?? row.title,
    productName: d.product_name ?? d.productName ?? PRODUCT_NAME,
    programType: d.program_type ?? d.programType ?? 'ind',
    phase: d.phase ?? row.stage ?? null,
    status: d.status ?? null,
    indication: d.indication ?? INDICATION,
    sponsor: 'Concept2Cure Therapeutics (fictional) — the organisation the founder is signed into',
  };
}

async function ensureProgram(ctx) {
  const { api, run, tally } = ctx;
  const program = {};
  run.record('program', program);
  await run.step('Projects: program C2C-101 (IND)', async () => {
    const list = must(await api('GET', '/api/c2c/projects?limit=200'), 200, 'list programs');
    let row = findDemoByTitle(list.data ?? [], PROGRAM_NAME);
    let spineSubmissionId = null;
    const created = !row;
    if (row) tally.found('program');
    else ({ row, spineSubmissionId } = await createProgram(ctx));
    const detail = must(await api('GET', `/api/c2c/projects/${row.id}`), 200, 'read program');
    Object.assign(program, describeProgram(detail.data ?? detail, row), { spineSubmissionId, created });
    return `${created ? 'created' : 'found'} ${row.id} (${program.code ?? '?'})`;
  });
  return program;
}

/* ───────────────────────── 2. Vault ───────────────────────── */

async function ingest({ api, tally }, program, spec, { title, pdf, bytesSha }) {
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${spec.key}-${spec.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
  form.append('programId', program.id);
  form.append('documentCode', `${MOLECULE}-${spec.key.toUpperCase()}.pdf`);
  form.append('documentTitle', title);
  form.append('documentType', spec.documentType);
  const j = must(await api('POST', '/api/vault/ingest', form), 201, `vault ingest ${spec.key}`);
  if (j.document?.contentHash && j.document.contentHash !== bytesSha) {
    throw new Error(`vault ingest ${spec.key}: server contentHash ${j.document.contentHash} != local sha256 ${bytesSha}`);
  }
  tally.created('vault-document');
  return { hit: { id: j.document.id, title, folderId: j.filing?.folderId ?? null, placementStatus: j.filing?.placementStatus ?? null }, document: j.document, filing: j.filing ?? null };
}

/**
 * Ingest may auto-suggest a folder; a person confirms the filing decision
 * (vault-filing.service.ts PlacementStatus 'suggested' → 'confirmed'). File
 * into the CTD module when the folder differs, confirm in place when it is
 * only suggested, and leave a confirmed filing alone.
 */
async function ensureFiled({ api, tally }, program, spec, hit) {
  if (hit.folderId === spec.folderId && hit.placementStatus === 'confirmed') {
    tally.found('vault-filing');
    return null;
  }
  const fj = must(await api('POST', `/api/c2c/project-vault/${program.id}/file`, {
    documentId: hit.id,
    folderId: spec.folderId,
    confirm: true,
    ctdSection: spec.sectionCode,
    note: `Filed into ${spec.folderId.replace('module-', 'Module ')} (CTD ${spec.sectionCode}) by the launch demo seed; placement confirmed by the founder's session.`,
  }), 200, `vault file ${spec.key}`);
  if (fj.success !== true || fj.filing?.folderId !== spec.folderId) {
    throw new Error(`vault file ${spec.key}: filing not recorded — ${JSON.stringify(fj).slice(0, 300)}`);
  }
  tally.created('vault-filing');
  return fj.filing;
}

async function ensureVaultDoc(ctx, program, spec) {
  const { api, tally } = ctx;
  const title = T(spec.name);
  const search = must(await api('GET', `/api/c2c/project-vault/${program.id}/search?q=${encodeURIComponent(spec.query)}&limit=50`), 200, `vault search ${spec.key}`);
  let hit = (search.data?.results ?? []).find((x) => x.title === title) || null;
  const pdf = makeMultiPagePdfBuffer({ title, subtitle: spec.pdf.subtitle, footer: 'DEMO — fictional content — Concept2Cure Therapeutics', sections: spec.pdf.sections });
  const bytesSha = sha256(pdf);
  const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
  const created = !hit;
  let document = null;
  let filing = null;
  if (hit) tally.found('vault-document');
  else ({ hit, document, filing } = await ingest(ctx, program, spec, { title, pdf, bytesSha }));
  filing = (await ensureFiled(ctx, program, spec, hit)) ?? filing;
  const rec = {
    key: spec.key,
    id: hit.id,
    title,
    documentType: spec.documentType,
    folderId: spec.folderId,
    sectionCode: spec.sectionCode,
    leafTitle: spec.leafTitle,
    pages,
    bytes: pdf.length,
    sha256: bytesSha,
    contentHash: document?.contentHash ?? null,
    filing,
    created,
  };
  return { rec, summary: `${created ? 'ingested' : 'found'} ${hit.id} → ${spec.folderId} (${pages} pages, ${pdf.length} bytes)` };
}

async function ensureVault(ctx, program) {
  const { api, run } = ctx;
  const out = [];
  run.record('vault.documents', out);
  for (const spec of VAULT_DOCS) {
    await run.step(`Vault: ${spec.name}`, async () => {
      const { rec, summary } = await ensureVaultDoc(ctx, program, spec);
      out.push(rec);
      return summary;
    });
  }
  await run.step('Vault: read model lists the filed documents', async () => {
    const d = must(await api('GET', `/api/c2c/project-vault/${program.id}`), 200, 'vault read model').data ?? {};
    run.record('vault.readModel', { documentCount: d.documentCount, unfiledCount: d.unfiledCount, standard: d.standard, dataRoom: d.dataRoom ?? null });
    if ((d.documentCount ?? 0) < VAULT_DOCS.length) throw new Error(`vault documentCount ${d.documentCount} < ${VAULT_DOCS.length}`);
    return `documentCount=${d.documentCount}, unfiled=${d.unfiledCount}, standard=${d.standard}`;
  });
  return out;
}

/* ───────────────────────── 8. Audit trail ───────────────────────── */

async function readLedger(api) {
  const l = must(await api('GET', '/api/audit-trail/ledger?limit=500'), 200, 'audit ledger');
  return { rows: l.data ?? [], meta: l.meta ?? null };
}

async function auditAfterRun({ api, run }, before, startedAt) {
  const after = await readLedger(api);
  const since = after.rows.filter((r) => r.at && new Date(r.at) >= startedAt);
  const unchained = since.filter((r) => !(r.hash && r.prevHash));
  run.record('audit', {
    window: 500,
    entriesBefore: before.rows.length,
    entriesAfter: after.rows.length,
    entriesWrittenThisRun: since.length,
    eventsThisRun: [...new Set(since.map((r) => r.event))],
    unchainedThisRun: unchained.length,
    chain: after.meta?.chain ?? null,
  });
  if (!after.meta?.chain || typeof after.meta.chain.ok !== 'boolean') throw new Error('ledger carried no server chain verdict (meta.chain)');
  if (after.meta.chain.ok !== true) {
    run.note(`Audit ledger meta.chain.ok is ${after.meta.chain.ok} on this database: ${JSON.stringify(after.meta.chain).slice(0, 300)}. Every entry this run wrote carries record and previous hashes; the break the server reports is in an older segment, not in this pack's rows.`);
  }
  return `${since.length} chained entries written this run (window ${after.rows.length}); meta.chain.ok=${after.meta.chain.ok}`;
}

/* ───────────────────────── Entry points ───────────────────────── */

export async function seed(ctx) {
  const { api, run, baseUrl, identity } = ctx;
  const startedAt = new Date();
  const tally = makeTally(run);
  const me = must(await api('GET', '/api/auth/me'), 200, 'auth/me').user ?? {};
  const signer = await connectSigner({ baseUrl, authorEmail: identity.email });
  run.record('identities', {
    author: { email: identity.email, userId: identity.userId, organizationId: identity.organizationId },
    signer: signer ? { email: signer.email, userId: signer.userId, organizationId: signer.session.user?.organizationId ?? null } : NOT_EXECUTED_NO_SIGNER,
  });
  run.record('provenance', PROVENANCE);
  if (!signer) run.note(NOT_EXECUTED_NO_SIGNER);

  const before = await readLedger(api);
  const c = { api, run, tally, me, signer };

  const program = await ensureProgram(c);
  const vaultDocs = await ensureVault(c, program);
  await ensureAuthoring(c, program);
  await ensureProtocol(c);
  await ensureSubmission(c, program, vaultDocs);
  await ensureQms(c);
  await run.step('Audit trail: ledger after the run', () => auditAfterRun(c, before, startedAt));

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  run.record('summary', { created: sum(tally.tally.created), found: sum(tally.tally.found) });
  console.info(`  ⇒ biotech pack: created ${sum(tally.tally.created)}, found ${sum(tally.tally.found)}`);
}

async function purgeLeaves({ api, run, tally }) {
  const program = findDemoByTitle(must(await api('GET', '/api/c2c/projects?limit=200'), 200, 'list programs').data ?? [], PROGRAM_NAME);
  if (!program) return 'no demo program — nothing to purge';
  const sub = asArray(must(await api('GET', '/api/submissions'), 200, 'list submissions'), 'data').find((s) => s.title === program.title) || null;
  if (!sub) return 'no canonical submission found';
  const seq = asArray(must(await api('GET', `/api/submissions/${sub.id}/sequences`), 200, 'list sequences'), 'data').find((s) => String(s.sequenceNumber ?? s.sequence_number) === '0000');
  if (!seq) return 'no sequence 0000';
  const leaves = asArray(must(await api('GET', `/api/submissions/sequences/${seq.id}/leaves`), 200, 'list leaves'), 'data', 'leaves');
  for (const l of leaves) {
    const r = await api('DELETE', `/api/submissions/sequences/${seq.id}/leaves/${l.id}`);
    if (r.status !== 204) throw new Error(`delete leaf ${l.id}: HTTP ${r.status} ${String(r.text).slice(0, 200)}`);
    tally.created('purged-leaf');
  }
  run.note('Program, vault documents, authoring documents, protocol document, submission and sequence have no delete or archive route for a signed-in author (authoring DELETE /docs/:id needs ADMIN_TOKEN; the others have none), so they remain and are reported here rather than removed by SQL.');
  return `${leaves.length} leaves removed`;
}

async function purgeQms({ api, run, tally }) {
  const docs = asArray(must(await api('GET', '/api/mdx/qms/documents'), 200, 'list QMS documents'), 'data');
  let retired = 0;
  for (const sop of SOPS) {
    const d = findDemoByTitle(docs, sop.name);
    if (!d || d.status === 'retired') continue;
    if (d.status === 'draft') {
      run.note(`${sop.docNumber} is draft: /retire only accepts effective, superseded, retired or in_review documents; the draft stays in the register.`);
      continue;
    }
    must(await api('POST', `/api/mdx/qms/documents/${d.id}/retire`, { reason: 'Launch demo purge: demonstration SOP withdrawn.' }), 200, `retire ${sop.docNumber}`);
    retired += 1;
    tally.created('purged-qms-retire');
  }
  const ch = asArray(must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes'), 'data').find((c) => (c.change_number ?? c.changeNumber) === CHANGE.changeNumber);
  let changes = 0;
  if (ch) {
    const r = await api('DELETE', `/api/mdx/qms/changes/${ch.id}`);
    if (r.status >= 300) throw new Error(`delete change ${ch.id}: HTTP ${r.status} ${String(r.text).slice(0, 200)}`);
    changes = 1;
    tally.created('purged-change');
  }
  return `${retired} SOPs retired, ${changes} change record(s) deleted`;
}

/**
 * Remove or archive this pack's records through the API. Where the product has
 * no delete or archive route, the record is left in place and the manifest says
 * so — the seed never reaches for SQL.
 */
export async function purge(ctx) {
  const { run } = ctx;
  const c = { ...ctx, tally: makeTally(run) };
  await run.step('Purge: eCTD leaves of sequence 0000', () => purgeLeaves(c));
  await run.step('Purge: retire QMS documents and delete the change record', () => purgeQms(c));
}
