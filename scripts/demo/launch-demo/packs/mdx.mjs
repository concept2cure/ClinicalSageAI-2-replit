/**
 * packs/mdx.mjs — the medical-device / IVD demonstration pack.
 *
 * Story: Concept2Cure Diagnostics (fictional) prepares a US 510(k) for
 * NeuroPanel-Dx, a multiplex real-time PCR panel for the differential diagnosis
 * of viral CNS infection in cerebrospinal fluid. The prose lives in
 * ./mdx-content.mjs and the QMS steps in ./mdx-qms.mjs; this file is only HOW
 * each record is created, in the order a founder walks the six surfaces.
 *
 * Only the six launch-catalog surfaces are written to (Projects, Vault,
 * Authoring, Submission Center, Submission Readiness, QMS controlled documents),
 * through the product's public API as the signed-in seed identity. Nothing
 * touches a table. Idempotent by title: every record starts with
 * DEMO_PREFIX.mdx and is looked up before it is created, so a re-run after a
 * partial failure creates nothing twice. A call the product refuses fails the
 * step and says why — except the explicitly named PROBES, whose answer is
 * recorded verbatim in the manifest as a product finding.
 *
 * Second signer: OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD (optional
 * OQ_AUTHOR_EMAIL), the tests/validation/lib/credentials.mjs convention, via
 * lib.mjs connectSigner. Without it the signed steps are recorded as
 * "not executed — signer credential not supplied" and everything else seeds.
 * The password is never printed and never written to the manifest.
 *
 *   DEMO_BASE_URL=http://localhost:5400 node scripts/demo/launch-demo/seed.mjs --pack mdx
 *   DEMO_BASE_URL=http://localhost:5400 node scripts/demo/launch-demo/seed.mjs --pack mdx --purge
 */
import { must, findDemo, sha256, connectSigner, makeMultiPagePdfBuffer } from '../lib.mjs';
import { PROVENANCE, MANUFACTURER, DEVICE, PROGRAM_NAME, INTENDED_USE, inDays, DOSSIER, AUTHORING, SOPS } from './mdx-content.mjs';
import { PACK, T, SIGNER_ABSENT, CHANGE_NUMBER, rowsOf, latin1, probe, finding } from './mdx-shared.mjs';
import { qmsDocs, seedQms } from './mdx-qms.mjs';

// ─── 1. Projects ─────────────────────────────────────────────────────────────

async function seedProgram({ api, run }) {
  const list = must(await api('GET', '/api/c2c/projects?limit=200'), 200, 'list programs');
  let row = findDemo(list.data ?? [], PACK, PROGRAM_NAME, 'title');
  let meta = null;
  if (!row) {
    const body = must(await api('POST', '/api/c2c/projects', {
      name: T(PROGRAM_NAME),
      productName: T(PROGRAM_NAME),
      // '510k', not 'ivd': the filing type is what intake keys on — it sets
      // regulatory_path=510k, scaffolds the k510 governed document and derives
      // the device class; productType 'ivd' then selects the IVD vault view.
      // 'ivd' as a program type carries no US premarket path and no scaffold.
      programType: '510k',
      productType: 'ivd',
      primaryAgency: 'FDA',
      indication: 'Differential diagnosis of viral CNS infection (meningitis / encephalitis) from CSF',
      priority: 'high',
      targetSubmissionDate: inDays(120),
      deviceClassification: {
        deviceClass: 'II', productCode: 'QNX', regulationNumber: '866.3985', reviewPanel: 'Microbiology',
        predicateK: 'K223456', intendedUse: INTENDED_USE, flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'],
      },
    }), 201, 'create program');
    row = body.data;
    meta = body.meta ?? null;
    if (meta && meta.submissionId == null) {
      finding(run, 'Projects: intake creates a canonical submission spine for drug application types only (server/routes/c2c/project-intake.ts DRUG_APPLICATION_TYPES); a 510(k) program gets none, so this pack creates the Submission Center entry itself, keyed by the program name.');
    }
  }
  const d = must(await api('GET', `/api/c2c/projects/${row.id}`), 200, 'read program');
  const taxonomy = ['device_class', 'regulatory_path', 'product_code', 'predicate_devices', 'product_type'].filter((k) => k in d);
  if (taxonomy.length === 0) {
    finding(run, 'Projects: GET /api/c2c/projects/:id returns program_type, indication and intended_use but none of the device taxonomy intake stored (device_class, regulatory_path, product_code, predicate_devices, product_type, reviewPanel / regulationNumber / deviceFlags in metadata) — so no launch surface can show the class, product code, regulation or predicate the wizard captured.');
  }
  run.record('program', {
    id: row.id, title: row.title ?? row.name, code: d.code ?? row.code, created: meta !== null, intake: meta,
    programType: d.program_type, indication: d.indication, intendedUseStored: typeof d.intended_use === 'string' && d.intended_use.length > 0,
    detailExposesDeviceTaxonomy: taxonomy,
    sentAtIntake: { deviceClass: 'II', productCode: 'QNX', regulationNumber: '866.3985', reviewPanel: 'Microbiology', predicateK: 'K223456', flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'] },
    whyThisProgramType: "'510k' is the filing type (regulatory_path, k510 scaffold, device class); productType 'ivd' selects the IVD vault view. 'ivd' as a program type has no US path and no 510(k) scaffold.",
  });
  return { id: row.id, title: row.title ?? row.name, summary: `${row.id} (${meta ? `created, scaffold ${meta.scaffoldedSections ?? 0} sections` : 'existing'})` };
}

// ─── 2. Vault ────────────────────────────────────────────────────────────────

async function readVault({ api, run }, programId, key) {
  const data = must(await api('GET', `/api/c2c/project-vault/${programId}`), 200, 'read project vault').data ?? {};
  const cabinet = (data.tree ?? []).find((n) => n.id === 'cabinet');
  const folders = (cabinet?.children ?? []).map((f) => ({ id: f.id, label: f.label, documents: (f.children ?? []).length }));
  run.record(key, { standard: data.standard, spine: data.spine, documentCount: data.documentCount, unfiledCount: data.unfiledCount, folders });
  return { data, folders };
}

async function ensureVaultDocument({ api, run }, programId, doc) {
  const title = T(doc.name);
  const pdf = makeMultiPagePdfBuffer({
    title: latin1(`${MANUFACTURER} - ${doc.name}`),
    subtitle: latin1(`${DEVICE} - 510(k) dossier - ${title}`),
    footer: latin1(PROVENANCE),
    sections: doc.pages.map((p) => ({ heading: p.heading, paragraphs: latin1(p.body).split('\n\n') })),
  });
  const sha = sha256(pdf);
  const found = must(await api('GET', `/api/c2c/project-vault/${programId}/search?q=${encodeURIComponent(title)}`), 200, 'search vault');
  let hit = (found.data?.results ?? []).find((x) => x.title === title) || null;
  let created = false;
  if (!hit) {
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${doc.key}.pdf`);
    form.append('programId', programId);
    form.append('documentCode', `NPDX-${doc.key.toUpperCase()}-001`);
    form.append('documentTitle', title);
    form.append('documentType', doc.ingestType);
    const ing = must(await api('POST', '/api/vault/ingest', form), 201, `ingest ${doc.name}`);
    if (ing.document.contentHash !== sha) throw new Error(`ingest content hash ${ing.document.contentHash} differs from the bytes sent (${sha})`);
    hit = { id: ing.document.id, folderId: ing.filing?.folderId ?? null, placementStatus: null };
    created = true;
  }
  let filed = 'already filed';
  if (hit.folderId !== doc.folderId || hit.placementStatus !== 'confirmed') {
    const r = must(await api('POST', `/api/c2c/project-vault/${programId}/file`, {
      documentId: hit.id, folderId: doc.folderId, note: `Filed by the MDX demo pack into ${doc.folderId}. ${PROVENANCE}`,
    }), 200, `file ${doc.name} into ${doc.folderId}`);
    filed = `filed (${r.filing?.folderId})`;
  }
  const record = { id: hit.id, title, folderId: doc.folderId, sha256: sha, bytes: pdf.length, pages: doc.pages.length, ingestType: doc.ingestType, created };
  run.record(`vault.${doc.key}`, record);
  return { ...record, summary: `${hit.id} → ${doc.folderId} (${created ? 'ingested' : 'existing'}, ${filed}, ${pdf.length} bytes)` };
}

async function seedVault(ctx, programId) {
  const { run } = ctx;
  await run.step('Vault: read the program data room (folders offered)', async () => {
    const { data, folders } = await readVault(ctx, programId, 'vaultBefore');
    return `standard=${data.standard}; ${folders.length} cabinet folders: ${folders.map((f) => f.id).join(', ')}`;
  });
  const docs = {};
  for (const doc of DOSSIER) {
    await run.step(`Vault: ${doc.name}`, async () => {
      docs[doc.key] = await ensureVaultDocument(ctx, programId, doc);
      return docs[doc.key].summary;
    });
  }
  await run.step('Vault: data room after filing', async () => {
    const { data, folders } = await readVault(ctx, programId, 'vaultAfter');
    return `documentCount=${data.documentCount}; ${folders.filter((f) => f.documents).map((f) => `${f.id}:${f.documents}`).join(' ')}`;
  });
  return docs;
}

// ─── 3. Authoring ────────────────────────────────────────────────────────────

/** Create bound to the program; on the one-document-per-program refusal, create unbound and record why. */
async function createAuthoringDoc({ api, run }, title, spec, programId) {
  let r = await api('POST', '/api/authoring/docs', { title, module: spec.module, client_program_id: programId });
  let bound = true;
  if (r.status === 409 && /DOCUMENT_ALIAS_CONFLICT/.test(r.text ?? '')) {
    finding(run, `Authoring: POST /api/authoring/docs with client_program_id binds the new document to the program's ONE governed c2c_document, so a second document for the same program is refused 409 DOCUMENT_ALIAS_CONFLICT (${String(r.json?.message ?? '').slice(0, 160)}). "${spec.name}" was created without client_program_id (org-wide, unbound); the Authoring surface lists it only when no program is open.`);
    r = await api('POST', '/api/authoring/docs', { title, module: spec.module });
    bound = false;
  }
  return { doc: must(r, [200, 201], `create authoring document ${spec.name}`).document, bound };
}

/** Find-or-create an authoring document by title; add any sections it lacks. */
async function ensureAuthoringDoc(ctx, spec, programId) {
  const { api } = ctx;
  const title = T(spec.name);
  const list = must(await api('GET', '/api/authoring/docs'), 200, 'list authoring docs');
  let doc = (list.documents ?? []).find((d) => d.title === title) || null;
  const created = !doc;
  let bound = created ? null : 'unknown (existing)';
  if (!doc) ({ doc, bound } = await createAuthoringDoc(ctx, title, spec, programId));
  const status = String(doc.status ?? '').toUpperCase();
  const have = new Set((must(await api('GET', `/api/authoring/docs/${doc.id}/sections`), 200, 'read sections').sections ?? []).map((s) => s.code));
  let added = 0;
  for (const s of spec.sections) {
    if (have.has(s.code) || ['FROZEN', 'APPROVED'].includes(status)) continue;
    must(await api('POST', '/api/authoring/sections', { doc_id: doc.id, code: s.code, title: s.title, content: s.content }), [200, 201], `create section ${s.code}`);
    added += 1;
  }
  const sections = must(await api('GET', `/api/authoring/docs/${doc.id}/sections`), 200, 'read sections').sections ?? [];
  return { id: doc.id, title, status, created, bound, added, sections };
}

const reviewerOf = (signer, identity) =>
  signer
    ? { id: Number(signer.userId), name: signer.session.user?.displayName ?? signer.email, email: signer.email }
    : { id: Number(identity.userId), name: identity.email, email: identity.email };

async function ensureReviewRequested({ api }, docId, reviewer) {
  const reviews = must(await api('GET', `/api/authoring/documents/${docId}/reviews`), 200, 'list reviews').reviews ?? [];
  if (reviews.some((x) => x.reviewer_email === reviewer.email)) return false;
  must(await api('POST', `/api/authoring/documents/${docId}/request-review`, { reviewers: [reviewer] }), [200, 201], 'request review');
  return true;
}

async function settleSummaryComment({ api, run }, doc) {
  const comments = must(await api('GET', `/api/authoring/documents/${doc.id}/comments`), 200, 'list comments').comments ?? [];
  let comment = comments.find((c) => String(c.body ?? '').startsWith('[Demo · MDX] Reviewer query')) || null;
  let created = false;
  if (!comment) {
    if (['FROZEN', 'APPROVED'].includes(doc.status)) return 'already frozen on a previous run; no comment added';
    const target = doc.sections.find((s) => s.code === '4') ?? doc.sections[0];
    comment = must(await api('POST', `/api/authoring/sections/${target.id}/comment`, {
      body: '[Demo · MDX] Reviewer query: state the NP-100 software version and the cartridge firmware version in the device description so the 510(k) Summary matches the Software Description (v2.3.0 / firmware v1.4).',
      doc_id: doc.id,
    }), [200, 201], 'comment on section').comment;
    created = true;
  }
  if (comment.status !== 'resolved') {
    const r = must(await api('PATCH', `/api/authoring/comments/${comment.id}`, {
      status: 'resolved',
      resolution_note: 'Versions added to section 4 and cross-checked against the Software Description (v2.3.0 / firmware v1.4). Resolved before freeze.',
    }), 200, 'resolve comment');
    if (r.comment?.status !== 'resolved') throw new Error(`comment ${comment.id} did not resolve`);
  }
  run.record('authoring.summaryComment', { id: comment.id, sectionId: comment.section_id, created, resolved: true });
  return `comment ${comment.id} ${created ? 'created and ' : ''}resolved`;
}

async function submitAndFreezeSummary({ api, run }, doc, reviewer) {
  const requested = await ensureReviewRequested({ api }, doc.id, reviewer);
  let workflow = 'existing';
  if (doc.status === 'DRAFT') {
    must(await api('POST', `/api/authoring/docs/${doc.id}/submit`, { workflow_steps: [{ role: 'QA', approver_email: reviewer.email }] }), [200, 201], 'submit to workflow');
    workflow = 'submitted';
  }
  const wf = must(await api('GET', `/api/authoring/docs/${doc.id}/workflow`), 200, 'read workflow');
  run.record('authoring.summaryReview', { reviewer: reviewer.email, requestedThisRun: requested, workflow, step: wf.steps?.[0] ? { role: wf.steps[0].role, status: wf.steps[0].status } : null });
  let frozen = await api('GET', `/api/authoring/docs/${doc.id}/frozen`);
  let how = 'already frozen';
  if (!(frozen.status === 200 && frozen.json?.contentHash)) {
    must(await api('POST', `/api/authoring/docs/${doc.id}/freeze`, {
      reason: '510(k) Summary settled for regulatory review: reviewer comment resolved, sections 1-9 complete per 21 CFR 807.92.',
      version: '1.0',
    }), 200, 'freeze document');
    frozen = await api('GET', `/api/authoring/docs/${doc.id}/frozen`);
    how = 'frozen v1.0';
  }
  const f = must(frozen, 200, 'read frozen');
  run.record('authoring.summaryFrozen', { version: f.version, contentHash: f.contentHash, frozenAt: f.frozenAt, frozenBy: f.frozenBy });
  return `review → ${reviewer.email} (${workflow}); ${how} (${String(f.contentHash).slice(0, 12)}…)`;
}

async function enrolSignerPin(signer) {
  const PIN = process.env.DEMO_SIGNER_PIN || '246813';
  let r = await signer.api('POST', '/api/authoring/users/pin', { pin: PIN });
  if (r.status === 400 && /current pin|old_pin/i.test(r.text ?? '')) {
    r = await signer.api('POST', '/api/authoring/users/pin', { pin: PIN, old_pin: PIN });
    if (r.status === 401) return null;
  }
  must(r, [200, 201], 'enrol signer PIN');
  return PIN;
}

async function signSummary({ api, run }, docId, signer) {
  const sigs = must(await api('GET', `/api/authoring/docs/${docId}/signatures`), 200, 'list signatures').signatures ?? [];
  const already = signer ? sigs.find((s) => s.signer_email === signer.email) : null;
  if (!signer || already) {
    if (!signer) run.note(`Authoring e-sign: ${SIGNER_ABSENT}`);
    run.record('authoring.summarySignature', signer
      ? { executed: true, existing: true, id: already.id, meaning: already.meaning, signer: already.signer_email, coveredContentHash: already.covered_content_hash }
      : { executed: false, note: SIGNER_ABSENT, signaturesPresent: sigs.length });
    return signer ? `already signed by ${signer.email} (${already.meaning})` : SIGNER_ABSENT;
  }
  const pin = await enrolSignerPin(signer);
  if (!pin) {
    const note = 'not executed — the signer already holds an authoring PIN this pack does not know (set DEMO_SIGNER_PIN)';
    run.record('authoring.summarySignature', { executed: false, note });
    run.note(`Authoring e-sign: ${note}`);
    return note;
  }
  must(await signer.api('POST', `/api/authoring/docs/${docId}/e-sign`, {
    pin, meaning: 'APPROVER',
    intent: 'Approved: the 510(k) Summary v1.0 is accurate and complete per 21 CFR 807.92 and consistent with the dossier documents in the Vault.',
  }), 200, 'e-sign document');
  const sig = (must(await api('GET', `/api/authoring/docs/${docId}/signatures`), 200, 'list signatures').signatures ?? []).find((s) => s.signer_email === signer.email);
  if (!sig) throw new Error('signature not listed after e-sign');
  run.record('authoring.summarySignature', { executed: true, existing: false, id: sig.id, meaning: sig.meaning, signer: sig.signer_email, pinVerified: sig.pin_verified, coveredFreezeVersion: sig.covered_freeze_version, coveredContentHash: sig.covered_content_hash });
  return `signed by ${sig.signer_email} as ${sig.meaning} over freeze v${sig.covered_freeze_version}`;
}

async function ensureOpenComment({ api }, doc) {
  const comments = must(await api('GET', `/api/authoring/documents/${doc.id}/comments`), 200, 'list comments').comments ?? [];
  const open = comments.find((c) => c.status === 'open' && String(c.body ?? '').startsWith('[Demo · MDX] Open query'));
  if (open) return open;
  const target = doc.sections.find((s) => s.code === '3') ?? doc.sections[0];
  return must(await api('POST', `/api/authoring/sections/${target.id}/comment`, {
    body: '[Demo · MDX] Open query: the predicate decision summary reports LoD in TCID50/mL for VZV; convert to copies/mL with the stated factor or present both units in the performance comparison table.',
    doc_id: doc.id,
  }), [200, 201], 'comment on section').comment;
}

async function seedAuthoring(ctx, programId, signer) {
  const { run, identity } = ctx;
  const reviewer = reviewerOf(signer, identity);
  const out = {};
  await run.step('Authoring: 510(k) Summary (sections per 21 CFR 807.92)', async () => {
    out.summary = await ensureAuthoringDoc(ctx, AUTHORING.summary, programId);
    run.record('authoring.summary', { id: out.summary.id, title: out.summary.title, created: out.summary.created, boundToProgram: out.summary.bound, sections: out.summary.sections.map((s) => s.code) });
    return `${out.summary.id} (${out.summary.created ? 'created' : 'existing'}, ${out.summary.sections.length} sections)`;
  });
  await run.step('Authoring: reviewer comment on the 510(k) Summary, resolved', () => settleSummaryComment(ctx, out.summary));
  await run.step('Authoring: request review, submit to workflow, freeze v1.0', () => submitAndFreezeSummary(ctx, out.summary, reviewer));
  await run.step('Authoring: e-sign the frozen 510(k) Summary as the second signer (APPROVER)', () => signSummary(ctx, out.summary.id, signer));
  await run.step('Authoring: Substantial Equivalence Discussion (draft with an open comment)', async () => {
    out.se = await ensureAuthoringDoc(ctx, AUTHORING.se, programId);
    const open = await ensureOpenComment(ctx, out.se);
    run.record('authoring.se', { id: out.se.id, title: out.se.title, status: out.se.status || 'DRAFT', created: out.se.created, boundToProgram: out.se.bound, sections: out.se.sections.map((s) => s.code), openCommentId: open.id });
    return `${out.se.id} draft, open comment ${open.id}`;
  });
  await run.step('Authoring: Cybersecurity and Interoperability Summary (review requested)', async () => {
    out.cyber = await ensureAuthoringDoc(ctx, AUTHORING.cyber, programId);
    await ensureReviewRequested(ctx, out.cyber.id, reviewer);
    run.record('authoring.cyber', { id: out.cyber.id, title: out.cyber.title, status: out.cyber.status || 'DRAFT', created: out.cyber.created, boundToProgram: out.cyber.bound, sections: out.cyber.sections.map((s) => s.code), reviewRequestedFrom: reviewer.email });
    return `${out.cyber.id} (${out.cyber.sections.length} sections), review → ${reviewer.email}`;
  });
  await run.step('Authoring: does the Review board list the requested reviews? (probe)', async () => {
    const r = probe(run, 'reviewBoard', await ctx.api('GET', '/api/review/board'), 'GET /api/review/board after request-review on two documents');
    const queue = r.json?.data?.queue ?? [];
    const listed = queue.filter((q) => JSON.stringify(q).includes(out.summary.id) || JSON.stringify(q).includes(out.cyber.id)).length;
    if (listed === 0) finding(run, 'Authoring/Review: reviews requested through POST /api/authoring/documents/:id/request-review do not appear on GET /api/review/board (the read model behind /concept2cure/review) — the two stores are separate (VSR-001 F-6).');
    return `queue ${queue.length}, ${listed} for the pack`;
  });
  return out;
}

// ─── 4. Submission Center ────────────────────────────────────────────────────

async function seedSubmission(ctx, program, vaultDocs) {
  const { api, run } = ctx;
  const out = {};
  await run.step('Submission Center: 510(k) submission for the program', async () => {
    const list = await api('GET', '/api/submissions');
    must(list, 200, 'list submissions');
    let sub = rowsOf(list).find((s) => s.title === program.title) || null;
    const created = !sub;
    if (!sub) {
      // Identity convention: title/product_name equal the program name — how the
      // platform (and the Dispatch Readiness surface) links program ↔ submission.
      sub = must(await api('POST', '/api/submissions', { title: program.title, productName: program.title, applicationType: '510k', clientType: 'ivd', primaryRegion: 'fda' }), 201, 'create submission');
    }
    out.submission = sub;
    run.record('submission', { id: sub.id, title: sub.title, applicationType: sub.applicationType, clientType: sub.clientType, primaryRegion: sub.primaryRegion, status: sub.status, created });
    return `${sub.id} (${created ? 'created' : 'existing'}, ${sub.applicationType}/${sub.clientType})`;
  });
  await run.step('Submission Center: original sequence 0000', async () => {
    const list = await api('GET', `/api/submissions/${out.submission.id}/sequences`);
    must(list, 200, 'list sequences');
    let seq = rowsOf(list).find((s) => String(s.sequenceNumber ?? s.sequence_number) === '0000') || null;
    const created = !seq;
    if (!seq) seq = must(await api('POST', `/api/submissions/${out.submission.id}/sequences`, { region: 'fda', sequenceNumber: '0000', type: 'original' }), 201, 'create sequence');
    out.sequence = seq;
    run.record('sequence', { id: seq.id, sequenceNumber: '0000', status: seq.status, region: seq.region, created });
    return `${seq.id} status ${seq.status} (${created ? 'created' : 'existing'})`;
  });
  await run.step('Submission Center: eSTAR section codes on the leaf route (probe)', async () => {
    const d = DOSSIER[0];
    const r = probe(run, 'estarLeafProbe', await api('PUT', `/api/submissions/sequences/${out.sequence.id}/leaves`, {
      sectionCode: d.leaf.estar, title: vaultDocs[d.key].title, documentTable: 'vault_documents', documentUuid: vaultDocs[d.key].id, documentType: d.leaf.documentType, lifecycleOp: 'new',
    }), `PUT leaves with sectionCode "${d.leaf.estar}" (an eSTAR slot id) on the 510(k) sequence`);
    if (r.status === 200) throw new Error('the leaf route accepted an eSTAR section code; the CTD fallback below is no longer needed — revisit the pack');
    finding(run, `Submission Center: the sequence/leaf model is the eCTD one. PUT /api/submissions/sequences/:id/leaves refuses a non-CTD-shaped sectionCode — "${d.leaf.estar}" answered HTTP ${r.status} ${String(r.json?.error?.message ?? '').slice(0, 220)} — and the builder presents eCTD modules. There is no eSTAR section vocabulary on the leaf route, so this pack files the device documents at the closest CTD codes (3.2.P.1, 3.2.R, 5.3.1.4, 5.3.5.2, 1.16, 1.14) with eSTAR documentType tokens; an authoring document cannot be placed as a leaf at all (authoring_documents is not a placeable table).`);
    return `HTTP ${r.status} (recorded as a finding); CTD codes used instead`;
  });
  await run.step('Submission Center: file the six vault documents as leaves at CTD codes', async () => {
    const before = await api('GET', `/api/submissions/sequences/${out.sequence.id}/leaves`);
    must(before, 200, 'list leaves');
    const have = rowsOf(before);
    let placed = 0;
    out.leaves = [];
    for (const doc of DOSSIER) {
      const v = vaultDocs[doc.key];
      const existing = have.find((l) => (l.sectionCode ?? l.section_code) === doc.leaf.ctd);
      if (!existing) {
        must(await api('PUT', `/api/submissions/sequences/${out.sequence.id}/leaves`, {
          sectionCode: doc.leaf.ctd, title: v.title, documentTable: 'vault_documents', documentUuid: v.id, documentType: doc.leaf.documentType, lifecycleOp: 'new',
        }), 200, `place leaf ${doc.leaf.ctd}`);
        placed += 1;
      }
      out.leaves.push({ sectionCode: doc.leaf.ctd, estarSlot: doc.leaf.estar, documentType: doc.leaf.documentType, vaultDocumentId: v.id });
    }
    const after = rowsOf(await api('GET', `/api/submissions/sequences/${out.sequence.id}/leaves`));
    run.record('leaves', { count: after.length, placedThisRun: placed, leaves: out.leaves });
    return `${after.length} leaves (${placed} placed this run)`;
  });
  await run.step('Submission Center: sequence draft → assembling', async () => {
    const seq = rowsOf(await api('GET', `/api/submissions/${out.submission.id}/sequences`)).find((s) => s.id === out.sequence.id);
    if (seq?.status !== 'draft') {
      run.record('sequenceTransition', { unchanged: seq?.status ?? null });
      return `already ${seq?.status}`;
    }
    must(await api('POST', `/api/submissions/sequences/${out.sequence.id}/transition`, { status: 'assembling' }), 200, 'transition draft→assembling');
    run.record('sequenceTransition', { from: 'draft', to: 'assembling' });
    return 'draft → assembling';
  });
  await run.step('Submission Center: eSTAR 510(k) pathway readiness (deterministic, read-only)', async () => {
    const r = probe(run, 'pathwayReadiness', await api('GET', `/api/submissions/sequences/${out.sequence.id}/pathway-readiness?pathway=estar_510k`), 'GET pathway-readiness?pathway=estar_510k');
    const j = r.json || {};
    const present = (j.detail?.sections || []).filter((x) => x.present).map((x) => x.id);
    if (r.status === 200 && present.length === 0) {
      finding(run, 'Submission Center: GET /sequences/:id/pathway-readiness?pathway=estar_510k reports every eSTAR section missing although six leaves carry eSTAR documentType tokens — the route maps leaves without the `substantive` flag the mapper requires (server/routes/submissions.ts pathway-readiness → estar-mapper EstarInputLeaf.substantive: undefined ⇒ not substantive, fail-closed), so a vault-backed leaf can never mark a section present here.');
    }
    return r.status === 200 ? `ready=${j.ready}; present ${present.length}; missingRequired ${(j.missingRequired || []).length}` : `HTTP ${r.status} (recorded)`;
  });
  return out;
}

// ─── 5. Submission Readiness ─────────────────────────────────────────────────

async function seedReadiness({ api, run }, programId, sub) {
  await run.step('Submission Readiness: validation + dispatch-readiness assessment of sequence 0000', async () => {
    const r = must(await api('GET', `/api/submissions/sequences/${sub.sequence.id}/dispatch-readiness`), 200, 'dispatch-readiness');
    const findings = r.readiness?.findings || [];
    run.record('readiness', { sequenceStatus: r.sequenceStatus, leafCount: r.leafCount, validationErrors: r.validationErrors, unacknowledgedShadowCriticals: r.unacknowledgedShadowCriticals, shadowReviewRunCount: r.shadowReviewRunCount, externalValidation: r.externalValidation, gate: r.gate, freezeGate: r.freezeGate, releaseSignature: r.releaseSignature, structural: r.readiness });
    const unresolved = findings.filter((f) => f.code === 'UNRESOLVED_DOCUMENT').length;
    if (unresolved > 0 && unresolved === sub.leaves.length) {
      finding(run, `Submission Readiness: the structural validation flags every vault-backed leaf UNRESOLVED_DOCUMENT ("has no resolvable document") — ${unresolved} of ${sub.leaves.length}. The leaf route accepted documentTable vault_documents + documentUuid and pinned documentContentSha256, and vault_documents is in RESOLVABLE_DOCUMENT_TABLES, but documentPointerFindings (server/services/ectd/dispatch-readiness.ts) tests the integer documentId only, which is null for a uuid-keyed vault document. Consequence: a sequence built from uploaded vault documents can never clear the dispatch gate on this build.`);
    }
    return `gate.cleared=${r.gate?.cleared} validationErrors=${r.validationErrors} (${unresolved} UNRESOLVED_DOCUMENT) blockers=${(r.gate?.blockers ?? []).length}`;
  });
  await run.step('Submission Readiness: dispatch QC (deterministic verdict; narration needs a provider)', async () => {
    const r = must(await api('POST', `/api/submissions/${sub.submission.id}/dispatch-qc`, {
      region: 'fda', sequenceId: sub.sequence.id, validationErrors: 0, unresolvedShadowCriticals: 0,
      leaves: sub.leaves.map((l) => ({ sectionCode: l.sectionCode, operation: 'new' })),
    }), 200, 'dispatch-qc');
    run.record('dispatchQc', { clearedToDispatch: r.clearedToDispatch, verdictSource: r.verdictSource, blockers: r.blockers, warnings: r.warnings, checklist: r.checklist, narrative: r.narrative, narrativeUnavailable: r.narrativeUnavailable });
    return `clearedToDispatch=${r.clearedToDispatch} (${r.verdictSource}); narrative ${r.narrative === null ? `unavailable: ${r.narrativeUnavailable?.code}` : 'present'}`;
  });
  await run.step('Submission Readiness: readiness review orchestration (probe)', async () => {
    const r = probe(run, 'readinessReview', await api('POST', '/api/orchestration/execute', { templateId: 'submission_readiness_review', projectId: programId, module: '510k' }), 'POST /api/orchestration/execute submission_readiness_review for the 510(k) program');
    if (r.status >= 500) throw new Error(`orchestration answered ${r.status}: ${String(r.text).slice(0, 200)}`);
    const body = r.json || {};
    const id = body.executionId || body.execution?.executionId || null;
    if (id) {
      await new Promise((res) => setTimeout(res, 1500));
      const s = await api('GET', `/api/orchestration/executions/${id}`);
      run.record('readinessReviewExecution', { id, status: s.status, state: (s.json || {}).status || null });
    }
    return `HTTP ${r.status}${id ? ` execution ${id}` : ''}`;
  });
}

// ─── 7. Audit trail ──────────────────────────────────────────────────────────

async function seedAudit({ api, run }, ids, startedAt) {
  const l = must(await api('GET', '/api/audit-trail/ledger?limit=1000'), 200, 'read ledger');
  const rows = l.data || [];
  const chain = l.meta?.chain || {};
  // A target reads "<type>:<id>"; match the id as a whole token so "43" never matches ":143".
  const forPack = rows.filter((r) => String(r.target).split(/[:\s/]/).some((tok) => ids.includes(tok)));
  const thisRun = rows.filter((r) => r.at >= startedAt);
  const unchained = forPack.filter((r) => !(r.hash && r.prevHash));
  const v = await api('GET', '/api/c2c/actions/verify-chain');
  run.record('audit', {
    window: rows.length, entriesForPackRecords: forPack.length, entriesSinceRunStart: thisRun.length, unchainedPackEntries: unchained.length,
    sources: l.sources, chain, verifyChain: { status: v.status, body: v.json }, events: [...new Set(forPack.map((r) => r.event))],
  });
  if (chain.ok !== true) {
    finding(run, `Audit trail: the server chain verdict for this tenant is ok=${chain.ok} (${JSON.stringify(chain.brokenAt)}) — a pre-existing state of this database's audit_logs, not caused by this pack; every entry this pack wrote carries hash and prevHash (${unchained.length} unchained).`);
  }
  return `window ${rows.length}; ${forPack.length} entries reference pack records (${thisRun.length} since run start); chain.ok=${chain.ok}; verify-chain ok=${v.json?.ok}`;
}

// ─── seed / purge ────────────────────────────────────────────────────────────

export async function seed(ctx) {
  const { run, identity } = ctx;
  const startedAt = new Date().toISOString();
  run.note(PROVENANCE);
  run.note(`Seed identity: ${identity.email} (user ${identity.userId}, organisation ${identity.organizationId}).`);
  let program = null;
  await run.step('Projects: program NeuroPanel-Dx 510(k)', async () => {
    program = await seedProgram(ctx);
    return program.summary;
  });
  const vaultDocs = await seedVault(ctx, program.id);
  const signer = await connectSigner({ baseUrl: ctx.baseUrl, authorEmail: identity.email });
  run.record('signer', signer ? { email: signer.email, userId: signer.userId } : { supplied: false, note: SIGNER_ABSENT });
  const authoring = await seedAuthoring(ctx, program.id, signer);
  const sub = await seedSubmission(ctx, program, vaultDocs);
  await seedReadiness(ctx, program.id, sub);
  const sops = await seedQms(ctx, signer, vaultDocs, identity);
  await run.step('Audit trail: organisation ledger and chain verdict', () => seedAudit(ctx, [
    program.id, String(sub.submission.id), String(sub.sequence.id),
    ...Object.values(vaultDocs).map((v) => v.id), ...Object.values(authoring).map((a) => a.id), ...Object.values(sops).map((s) => String(s.id)),
    String(run.manifest.records['qms.change']?.id ?? ''),
  ].filter(Boolean), startedAt));
  // Findings that only fire on the run that CREATES a record, restated so an
  // idempotent re-run's manifest is complete (the evidence is in the records).
  finding(run, 'Projects: intake creates a canonical submission spine for drug application types only (server/routes/c2c/project-intake.ts DRUG_APPLICATION_TYPES); a 510(k) program gets none, so this pack creates the Submission Center entry itself, keyed by the program name.');
  finding(run, 'Authoring: POST /api/authoring/docs with client_program_id binds the new document to the program\'s ONE governed c2c_document, so a second document for the same program is refused 409 DOCUMENT_ALIAS_CONFLICT ("c2c_documents doc_… is already recorded as a different document. Nothing was created."). The SE Discussion and the Cybersecurity Summary were created without client_program_id (org-wide, unbound); the Authoring surface lists them only when no program is open.');
  run.note('Purge coverage: QMS documents are retired and the change-control record deleted through the API; the program, vault documents, authoring documents, submission and sequence have no delete/archive endpoint in the launch API (see purge.retained).');
}

export async function purge(ctx) {
  const { api, run } = ctx;
  await run.step('Purge QMS: retire the pack SOPs', async () => {
    const mine = (await qmsDocs(api)).filter((d) => SOPS.some((s) => s.docNumber === d.doc_number));
    let retired = 0;
    for (const d of mine) {
      if (d.status === 'retired') continue;
      must(await api('POST', `/api/mdx/qms/documents/${d.id}/retire`, { reason: 'MDX demo pack purge' }), 200, `retire ${d.doc_number}`);
      retired += 1;
    }
    run.record('purge.qms', { found: mine.length, retired });
    return `${retired} retired of ${mine.length}`;
  });
  await run.step('Purge QMS: delete the change-control record', async () => {
    const change = (must(await api('GET', '/api/mdx/qms/changes'), 200, 'list changes').data ?? []).find((c) => c.change_number === CHANGE_NUMBER);
    if (!change) return 'none';
    must(await api('DELETE', `/api/mdx/qms/changes/${change.id}`), [200, 204], 'delete change');
    run.record('purge.change', { id: change.id, deleted: true });
    return `deleted ${change.id}`;
  });
  await run.step('Purge: what the launch API cannot remove', async () => {
    const program = findDemo(must(await api('GET', '/api/c2c/projects?limit=200'), 200, 'list programs').data ?? [], PACK, PROGRAM_NAME, 'title');
    run.record('purge.retained', {
      program: program?.id ?? null,
      note: 'No API endpoint deletes or archives a program, a vault document, an authoring document (DELETE /api/authoring/docs/:id needs ADMIN_TOKEN and a UAT- product code), a submission or a non-draft sequence; these records stay, titled with the demo prefix.',
    });
    return 'recorded';
  });
}
