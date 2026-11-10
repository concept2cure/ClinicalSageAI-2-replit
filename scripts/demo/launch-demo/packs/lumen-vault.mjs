/**
 * launch-demo/packs/lumen-vault.mjs — a faux client Data Room in each Lumen
 * demonstration project's Vault: 14 documents in LMN-201, 3 or 4 in each
 * other project, governed artifacts (three in LMN-201, one in each other
 * project), and a seal on each.
 *
 * 2026-11-06: before a founder demo every Lumen project's Vault held one or two
 * uploads. Required documents read "0 of 9", Governed artifacts 0, and Seals &
 * fixity "None yet". This fills it through the routes the Vault itself uses,
 * as the signed-in account, and builds nothing:
 *
 *   upload          POST /api/vault/ingest (useVaultUpload.ts), with the person's
 *                   filing (folder, evidence kind, CTD section) recorded as
 *                   'confirmed', which is what Required documents counts
 *                   (server/services/vault/vault-coverage.ts)
 *   filing repair   POST /api/c2c/project-vault/:id/file (Vault.tsx fileDocument)
 *   review          POST /api/regulatory/documents, then …/:cid/advance
 *                   {to:'in_review', route} (VaultReviewRoute.tsx submitRoute)
 *   sign, approve   POST …/:cid/sign {meaning:'reviewed'|'approved'} as the named
 *                   reviewer and approver (VaultLifecycle.tsx signReview,
 *                   approveOnRoute), each with their own password
 *   fixity, seal    POST /api/c2c/project-vault/:id/fixity (VaultFixityCheck.tsx),
 *                   POST …/:id/seals (VaultSeals.tsx), the seal signed by the approver
 *   artifacts       POST /api/concept2cure/projects/:id/artifacts and PUT …/status
 *                   (server/routes/c2c/artifacts.ts; the Vault reads them as its
 *                   Governed artifacts branch)
 *
 * Three people: the signed-in account uploads and sends; ctx.signer (lib.mjs
 * connectSigner, OQ_SIGNER_*) signs the review; ctx.approver (connectApprover
 * below, OQ_APPROVER_*) approves and seals. Without both, the documents are
 * still uploaded and filed, and the signed steps are noted as not executed.
 *
 * Idempotent: a document is found by its exact title in the Vault's own read
 * before it is uploaded, a version's stage is read before it is advanced, a seal
 * by its reason, an artifact by its title. A second run creates nothing.
 * Everything is SYNTHETIC; see ./lumen-vault-content.mjs.
 */
import { createApiClient, devLogin } from '../../../../tests/validation/lib/harness.mjs';
import { makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { T } from './lumen-content.mjs';
import { VAULT_ARTIFACTS, VAULT_DOCUMENTS, vaultPdf } from './lumen-vault-content.mjs';

const DOCS = '/api/regulatory/documents';
const vaultPath = (programId) => `/api/c2c/project-vault/${encodeURIComponent(programId)}`;
const dateIn = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const NO_PEOPLE = 'not executed: review and approval need two people other than the uploader (ctx.signer, ctx.approver)';
/** How far a version has gone: 0 not sent, 1 in review, 2 review signed, 3 approved (or beyond). */
const RANK = { draft: 0, in_review: 1, reviewed: 2, approved: 3 };

/**
 * The approver: a third identity, as lib.mjs connectSigner makes the second.
 * Read from OQ_APPROVER_EMAIL / OQ_APPROVER_PASSWORD (tests/validation/lib/
 * credentials.mjs). Null when not supplied. The password is held for the
 * signing requests only and never printed.
 */
export async function connectApprover({ baseUrl, excludeEmails = [], onRecord } = {}) {
  const email = (process.env.OQ_APPROVER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OQ_APPROVER_PASSWORD || '';
  if (!email || !password) return null;
  if (excludeEmails.map((e) => String(e).trim().toLowerCase()).includes(email)) {
    throw new Error(`OQ_APPROVER_EMAIL (${email}) is the uploader or the reviewer; an approval needs a third person`);
  }
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const session = await devLogin(base, email);
  const api = createApiClient({ baseUrl: base, accessToken: session.accessToken, onRecord: onRecord || (() => {}), identity: email });
  return { email, password, session, api, userId: session.user?.id ?? null };
}

/** The people for the signed steps, or null with why. */
export function signingPeople({ identity, signer, approver }) {
  if (!signer || !approver) return null;
  const emails = [identity?.email, signer.email, approver.email].map((e) => String(e ?? '').toLowerCase());
  if (new Set(emails).size !== 3) throw new Error('The uploader, reviewer and approver must be three different people; nothing was sent for review.');
  const id = (who) => {
    const n = Number(who.userId ?? who.session?.user?.id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${who.email} has no account id the review route can name`);
    return n;
  };
  return { signer, approver, reviewerId: id(signer), approverId: id(approver) };
}

/* ───────────────────────── Find what is there ───────────────────────── */

/**
 * The project's uploads by title, from the read the Library draws
 * (GET /api/c2c/project-vault/:id). A title held twice is ambiguous, and a
 * seeded title that is ambiguous fails rather than pick one.
 */
async function readCabinet(api, programId) {
  const j = must(await api('GET', vaultPath(programId)), 200, 'read the project Vault');
  const d = j.data ?? j;
  if (d.pendingStore === true) throw new Error('The Vault store is not provisioned on this server; no document was uploaded.');
  const byTitle = new Map();
  const twice = new Set();
  const walk = (nodes, folder) => {
    for (const n of nodes ?? []) {
      if (Array.isArray(n.children)) { walk(n.children, n.id); continue; }
      if (n.src !== 'upload' || !n.docId) continue;
      if (byTitle.has(n.title)) twice.add(n.title);
      /* The document's own filing record, not the node it hangs under: since the Vault's filing binders
         (2026-11-06) a filed upload sits under a binder node (cab-bn:1.14.4.1), so the parent's id never equalled
         the folder and every found document was filed again on each run (vault-filing 21 on a second run). */
      const f = n.filing ?? {};
      byTitle.set(n.title, {
        id: n.docId, folder: f.folderId ? `cab-${f.folderId}` : folder,
        placement: f.placementStatus ?? n.status, num: f.ctdSection ?? n.num,
      });
    }
  };
  walk((d.tree ?? []).filter((f) => f.id === 'cabinet'), null);
  return { byTitle, twice, truncated: d.uploadsWindow?.truncated === true, read: d };
}

/** The upload titled `title`: from the cabinet, or by search when the cabinet's read was capped. */
async function findUpload(api, programId, cabinet, title) {
  if (cabinet.twice.has(title)) throw new Error(`Two documents in this Vault are titled "${title}"; reconcile them before seeding.`);
  const hit = cabinet.byTitle.get(title);
  if (hit || !cabinet.truncated) return hit ?? null;
  const s = must(await api('GET', `${vaultPath(programId)}/search?q=${encodeURIComponent(title)}&limit=50`), 200, 'search the Vault');
  const found = (s.data?.results ?? []).filter((x) => x.title === title);
  if (found.length > 1) throw new Error(`Two documents in this Vault are titled "${title}"; reconcile them before seeding.`);
  // Found by search, its filing is not known here: confirming it again is the filing route's no-op.
  return found[0] ? { id: found[0].id, folder: null, placement: null, num: null } : null;
}

/* ───────────────────────── Upload and file ───────────────────────── */

/** The PDF's page count, read from its own page objects. */
const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

async function upload({ api, tally }, program, doc, title, pdf) {
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), doc.code);
  form.append('programId', program.id);
  form.append('documentCode', doc.code);
  form.append('documentTitle', title);
  form.append('documentType', doc.type);
  form.append('classification', doc.cls);
  if (doc.filing) {
    const [folderId, kind, section] = doc.filing;
    form.append('folderId', folderId);
    form.append('evidenceKind', kind);
    if (section) form.append('ctdSection', section);
  }
  const j = must(await api('POST', '/api/vault/ingest', form), [200, 201], `upload ${doc.code}`);
  if (!j.document?.id) throw new Error(`the Vault recorded no document for ${doc.code}: ${JSON.stringify(j).slice(0, 300)}`);
  if (j.document.contentHash && j.document.contentHash !== sha256(pdf)) {
    throw new Error(`the Vault's SHA-256 for ${doc.code} differs from the bytes sent`);
  }
  // The same bytes at the same code are the Vault's own record of this file (VR-05): found, not made.
  if (j.reupload) tally.found('vault-document');
  else tally.created('vault-document');
  const f = j.filing ?? {};
  return { id: j.document.id, folder: f.folderId ? `cab-${f.folderId}` : null, placement: f.placementStatus ?? null, num: doc.filing?.[2] ?? null };
}

/** A document's filing as the seed states it; a found one filed elsewhere is filed again, by the filing route. */
async function ensureFiled({ api, tally }, program, doc, hit) {
  if (!doc.filing) return hit.placement ?? 'left to the classifier';
  const [folderId, , section] = doc.filing;
  const inPlace = hit.placement === 'confirmed' && hit.folder === `cab-${folderId}` && (!section || hit.num === section);
  if (inPlace) return `filed ${folderId}${section ? ` at ${section}` : ''}`;
  const j = must(await api('POST', `${vaultPath(program.id)}/file`, {
    documentId: hit.id, folderId, confirm: true, ...(section ? { ctdSection: section } : {}),
    note: `Demo seed: filed to ${folderId}${section ? ` at CTD ${section}` : ''}, as the synthetic data room places it.`,
  }), 200, `file ${doc.code}`);
  if (j.success !== true || j.filing?.folderId !== folderId) throw new Error(`the filing of ${doc.code} was not recorded: ${JSON.stringify(j).slice(0, 300)}`);
  tally.created('vault-filing');
  return `filed ${folderId}${section ? ` at ${section}` : ''} (repaired)`;
}

/* ───────────────────────── Review and approval ───────────────────────── */

/** The current version's lifecycle record, and how far it has gone. */
async function stageOf(api, program, docId) {
  const j = must(await api('GET', `${vaultPath(program.id)}/documents/${encodeURIComponent(docId)}/versions`), 200, 'read the versions');
  const lc = (j.data?.versions ?? []).find((v) => v.id === docId)?.lifecycle ?? null;
  if (!lc || !lc.stage || lc.stage === 'authoring') return { lc, rank: 0 };
  if (lc.stage === 'in_review') return { lc, rank: lc.review ? 2 : 1 };
  return { lc, rank: 3 }; // approved, superseded, placed, packaged or submitted: past what the seed asks
}

/**
 * Take the version to `doc.stage` on a named route: the uploader sends it, the
 * reviewer signs the review, the approver signs the approval. Each step is
 * taken only when the version has not reached it.
 */
export async function ensureStage({ api, run, tally }, program, doc, docId, people) {
  const want = RANK[doc.stage];
  if (!want) return 'draft (not sent for review)';
  if (!people) return NO_PEOPLE;
  let { lc, rank } = await stageOf(api, program, docId);
  if (rank >= want) {
    tally.found('vault-lifecycle');
    return `${lc.stage}${lc.review ? ', review signed' : ''} (already)`;
  }
  const done = [];
  let cid = lc?.canonicalId ?? null;
  if (rank === 0) {
    const started = must(await api('POST', DOCS, { sources: { vault_documents: { nativeId: docId, role: 'artifact' } } }), [200, 201], `start the review record of ${doc.code}`);
    cid = started.canonicalId;
    if (!cid) throw new Error(`no review record was started for ${doc.code}: ${JSON.stringify(started).slice(0, 300)}`);
    const sent = must(await api('POST', `${DOCS}/${encodeURIComponent(cid)}/advance`, {
      to: 'in_review',
      reason: `Demo seed: send the synthetic ${doc.code} for review by the named reviewer and approver.`,
      route: { reviewers: [people.reviewerId], approvers: [people.approverId], order: 'parallel', reviewDueDate: dateIn(7), approvalDueDate: dateIn(14) },
    }), 200, `send ${doc.code} for review`);
    if (sent.stage !== 'in_review') throw new Error(`${doc.code} was not moved into review: ${JSON.stringify(sent).slice(0, 300)}`);
    tally.created('vault-review-route');
    done.push('sent');
    rank = 1;
  }
  if (want >= 2 && rank < 2) {
    const r = must(await people.signer.api('POST', `${DOCS}/${encodeURIComponent(cid)}/sign`, {
      meaning: 'reviewed', password: people.signer.password,
      reason: `Demo seed: reviewed the synthetic ${doc.code}; content is consistent with the demonstration program.`,
    }), 200, `sign the review of ${doc.code}`);
    if (r.reviewComplete !== true) throw new Error(`the review of ${doc.code} was not completed: ${JSON.stringify(r).slice(0, 300)}`);
    tally.created('vault-review-signature');
    done.push(`review signed by ${people.signer.email}`);
    rank = 2;
  }
  if (want >= 3 && rank < 3) {
    const a = must(await people.approver.api('POST', `${DOCS}/${encodeURIComponent(cid)}/sign`, {
      meaning: 'approved', password: people.approver.password,
      reason: `Demo seed: approved the synthetic ${doc.code} for the demonstration data room.`,
    }), 200, `approve ${doc.code}`);
    if (a.approvalComplete !== true || a.stage !== 'approved') throw new Error(`${doc.code} was not approved: ${JSON.stringify(a).slice(0, 300)}`);
    tally.created('vault-approval');
    done.push(`approved by ${people.approver.email}`);
  }
  run.record(`lumenVault.lifecycle.${program.id}.${doc.key}`, { canonicalId: cid, stage: doc.stage });
  return done.join(', ');
}

async function ensureDocument(ctx, program, doc, cabinet, people, out) {
  const { api, run } = ctx;
  const title = T(doc.name);
  await run.step(`Vault: ${doc.project} ${doc.code}`, async () => {
    const pdf = makeMultiPagePdfBuffer(vaultPdf(doc));
    const pages = pageCount(pdf);
    if (pages < 2) throw new Error(`${doc.code} renders as ${pages} page; the data room's documents are multi-page`);
    let hit = await findUpload(api, program.id, cabinet, title);
    const created = !hit;
    if (hit) ctx.tally.found('vault-document');
    else hit = await upload(ctx, program, doc, title, pdf);
    const filed = await ensureFiled(ctx, program, doc, hit);
    const stage = await ensureStage(ctx, program, doc, hit.id, people);
    out.push({ key: doc.key, code: doc.code, id: hit.id, title, type: doc.type, filing: doc.filing, stf: doc.stf ?? null, stage: doc.stage, pages, sha256: sha256(pdf) });
    return `${created ? 'uploaded' : 'found'} ${hit.id} (${pages} pages); ${filed}; ${stage}`;
  });
}

/* ───────────────────────── Governed artifacts ───────────────────────── */

/**
 * The project's governed artifacts: created by the signed-in account, moved to
 * review by it, and approved by the approver with an e-signature (approval is
 * refused to an author).
 */
async function ensureArtifacts({ api, run, tally }, program, label, artifacts, people) {
  const base = `/api/concept2cure/projects/${encodeURIComponent(program.id)}/artifacts`;
  for (const a of artifacts) {
    const title = T(a.name);
    await run.step(`Governed artifact: ${a.type} on ${label}`, async () => {
      const rows = must(await api('GET', base), 200, 'list the project\'s governed artifacts').data ?? [];
      const same = rows.filter((r) => r.title === title);
      if (same.length > 1) throw new Error(`Two governed artifacts are titled "${title}"; reconcile them before seeding.`);
      let row = same[0] ?? null;
      const steps = [];
      if (row) tally.found('governed-artifact');
      else {
        row = must(await api('POST', base, {
          type: a.type, category: 'document', title, content: a.content, ctdSection: a.ctdSection,
          documentClass: a.documentClass, clientTrack: 'biotech', submissionProgram: 'ind', regulatorScope: 'fda',
          metadata: { generationMethod: 'manual', synthetic: true },
        }), [200, 201], `create the governed artifact "${a.name}"`).data;
        if (!row?.id) throw new Error(`the governed artifact "${a.name}" was not recorded`);
        tally.created('governed-artifact');
        steps.push('created');
      }
      const status = row.status ?? 'draft';
      const want = { draft: 0, review: 1, approved: 2 }[a.stage];
      const have = { draft: 0, review: 1, approved: 2, locked: 3 }[status] ?? 0;
      if (want >= 1 && have < 1) {
        must(await api('PUT', `${base}/${encodeURIComponent(row.id)}/status`, { status: 'review', reason: 'Demo seed: ready for review.' }), 200, `send "${a.name}" for review`);
        tally.created('governed-artifact-review');
        steps.push('in review');
      }
      if (want >= 2 && have < 2) {
        if (!people) return `${steps.join(', ') || status}; approval ${NO_PEOPLE}`;
        steps.push(await ensureArtifactReview(api, `${base}/${encodeURIComponent(row.id)}`, a.name, people));
        const approval = await people.approver.api('PUT', `${base}/${encodeURIComponent(row.id)}/status`, {
          status: 'approved', reason: 'Demo seed: approved for the demonstration project.',
          attestation: { meaning: 'approval', attestationText: 'I approve this synthetic memo as the current version for the demonstration project.' },
          reauth: { password: people.approver.password },
        });
        /* A document placed in a CTD section needs more independent reviewers than this organisation has besides
           its author and approver (P-95 Q2, server/services/artifact-approval-act.ts). It stays in review with its
           review recorded, and the step says so; the server's floor is not worked around. */
        if (approval.status === 409 && /independent reviewers/.test(String(approval.text ?? ''))) {
          return `${row.id}: ${steps.join(', ')}; approval not executed: ${String(approval.json?.error?.message ?? approval.text).slice(0, 160)}`;
        }
        must(approval, 200, `approve "${a.name}"`);
        tally.created('governed-artifact-approval');
        steps.push(`approved by ${people.approver.email}`);
      }
      return `${row.id}: ${steps.length ? steps.join(', ') : `${status} (already)`}`;
    });
  }
}

/**
 * The artifact's review, before its approval: since 2026-11-09 (P-95, server/services/artifact-approval-act.ts) an
 * artifact is approved only after every reviewer named in its current round has approved it. The author names the
 * second person, who approves, through the routes the artifact card's Review step uses
 * (ConversationArtifactReview.tsx). A round that already holds that person's approval is left as it is.
 */
async function ensureArtifactReview(api, artifactPath, name, people) {
  const read = async () => must(await api('GET', `${artifactPath}/reviews/status`), 200, `read the review of "${name}"`).data ?? {};
  let status = await read();
  const live = () => (status.reviewers ?? []).filter((r) => r.status !== 'withdrawn');
  let mine = live().find((r) => Number(r.reviewerId) === people.reviewerId) ?? null;
  if (mine?.decision?.decision === 'approve') return `reviewed by ${people.signer.email} (already)`;
  if (!mine) {
    must(await api('POST', `${artifactPath}/reviewers`, {
      reviewerIds: [people.reviewerId], notes: 'Demo seed: please review this synthetic memo before its approval.',
    }), [200, 201], `name the reviewer of "${name}"`);
    status = await read();
    mine = live().find((r) => Number(r.reviewerId) === people.reviewerId) ?? null;
    if (!mine) throw new Error(`the review of "${name}" does not name ${people.signer.email} after naming them`);
  }
  must(await people.signer.api('POST', `${artifactPath}/reviews/submit`, {
    decision: 'approve', comment: 'Demo seed: reviewed; consistent with the synthetic study record.',
  }), [200, 201], `approve the review of "${name}"`);
  return `reviewed by ${people.signer.email}`;
}

/* ───────────────────────── Fixity and seal ───────────────────────── */

/**
 * Seal the project's Vault once, as it stands after seeding, signed by the
 * approver (meaning: approval). The stored files are re-proven first, on the
 * run that seals, so every verdict is in each document's history; a version
 * that cannot be proven stops the seal.
 */
async function ensureSeal({ api, run, tally }, program, label, people) {
  const reason = `Demo seed: seal the ${label} demonstration data room as it stands after seeding (synthetic documents only).`;
  await run.step(`Seals & fixity: ${label}`, async () => {
    const seals = must(await api('GET', `${vaultPath(program.id)}/seals`), 200, 'read the seals').data?.seals;
    if (!Array.isArray(seals)) throw new Error('the seals could not be read; this is not an empty list');
    const mine = seals.find((s) => s.reason === reason);
    if (mine) { tally.found('vault-seal'); return `sealed already (${mine.id})`; }
    const sealer = people?.approver ?? null;
    if (!sealer) return NO_PEOPLE;
    const fx = must(await api('POST', `${vaultPath(program.id)}/fixity`, {}), 200, 'check the stored files').data;
    if (!fx || typeof fx.checked !== 'number') throw new Error('the fixity check answered no result');
    tally.created('vault-fixity-check');
    if (fx.counts?.verified !== fx.checked) {
      throw new Error(`${fx.checked - (fx.counts?.verified ?? 0)} stored version(s) could not be proven: ${JSON.stringify(fx.findings).slice(0, 300)}; the Vault was not sealed`);
    }
    const s = must(await sealer.api('POST', `${vaultPath(program.id)}/seals`, { meaning: 'approval', reason, password: sealer.password }), [200, 201], `seal the ${label} Vault`);
    tally.created('vault-seal');
    const seal = s.data?.seal ?? s.seal ?? {};
    return `${fx.checked} stored versions proven; sealed ${seal.id ?? ''} over ${seal.documentCount ?? '?'} documents by ${sealer.email}`;
  });
}

/* ───────────────────────── The read-back ───────────────────────── */

/** What the Vault's tabs read now, from the same read: uploads, coverage, artifacts, seals. */
async function readBack({ api, run }, program, label) {
  return run.step(`Vault read-back: ${label}`, async () => {
    const d = (await readCabinet(api, program.id)).read;
    const cov = d.coverage?.state === 'available' ? `${d.coverage.covered} of ${d.coverage.required} required sections` : `coverage ${d.coverage?.state ?? 'absent'}`;
    const seals = must(await api('GET', `${vaultPath(program.id)}/seals`), 200, 'read the seals').data?.seals ?? [];
    const summary = { uploads: d.uploadsWindow?.total ?? null, documents: d.documentCount, coverage: cov,
      artifacts: d.artifacts?.total ?? null, unfiled: d.unfiledCount ?? null, seals: seals.length };
    run.record(`lumenVault.readBack.${label}`, summary);
    return `${summary.uploads} uploads, ${summary.coverage}, ${summary.artifacts} governed artifacts, ${summary.seals} seal(s)`;
  });
}

/**
 * ctx: { api, run, tally, identity, signer?, approver? }
 * programs: { 'LMN-201': { id }, 'LMN-801': { id }, 'LMN-301': { id }, 'LMN-401': { id } }
 */
export async function ensureLumenVault(ctx, programs) {
  const { run } = ctx;
  const people = signingPeople(ctx);
  if (!people) run.note(`Lumen Vault: review, approval and seals ${NO_PEOPLE}. The documents were uploaded and filed.`);
  run.note('Lumen Vault: every document and governed artifact is SYNTHETIC (scripts/demo/launch-demo/packs/lumen-vault-content.mjs). No person, site, lot, result or decision in them is real, and none is Lumen Bioscience\'s.');
  const documents = {};
  run.record('lumenVault.documents', documents);
  for (const [label, docs] of Object.entries(VAULT_DOCUMENTS)) {
    const program = programs?.[label];
    if (!program?.id) throw new Error(`No ${label} project was given; its Vault was not seeded.`);
    const cabinet = await readCabinet(ctx.api, program.id);
    documents[label] = [];
    for (const doc of docs) await ensureDocument(ctx, program, { ...doc, project: label }, cabinet, people, documents[label]);
    await ensureArtifacts(ctx, program, label, VAULT_ARTIFACTS[label] ?? [], people);
    await ensureSeal(ctx, program, label, people);
    await readBack(ctx, program, label);
  }
  return documents;
}
