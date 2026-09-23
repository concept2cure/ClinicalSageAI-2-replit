/**
 * launch-demo/packs/biotech-authoring.mjs — Authoring for the biotech demo:
 * three documents with real sections; comments resolved on one, a review
 * request and workflow on another, one left in draft with an open comment; the
 * Protocol Synopsis frozen and e-signed by the second signer (OQ-003's sequence:
 * resolve comments → freeze → e-sign with meaning + intent).
 */
import { must } from '../lib.mjs';
import { AUTHORING_DOCS, STUDY, T, findDemoByTitle } from './biotech-content.mjs';
import { NOT_EXECUTED_NO_SIGNER, asArray, uuidRe } from './biotech-shared.mjs';

/** Create the document, falling back to an unbound one when the program's governed document is already aliased. */
async function createDoc({ api, run }, program, spec) {
  let r = await api('POST', '/api/authoring/docs', { title: T(spec.name), module: spec.module, client_program_id: program.id });
  if (r.status === 409 && r.json?.error === 'DOCUMENT_ALIAS_CONFLICT') {
    // One governed c2c_document per program, and the first program-bound
    // authoring document already aliases it (authoring.router.ts
    // resolveGovernedDocument → DocumentAliasConflictError). A second bound
    // document is refused, so this one is created org-wide (unbound) and the
    // refusal is recorded as a finding — not hidden.
    run.note(`Authoring: POST /api/authoring/docs with client_program_id for "${spec.name}" was refused 409 DOCUMENT_ALIAS_CONFLICT (${r.json?.message}); the product binds exactly one authoring document to a program's governed filing document, so this document was created unbound (no client_program_id).`);
    r = await api('POST', '/api/authoring/docs', { title: T(spec.name), module: spec.module });
  }
  const j = must(r, [200, 201], `create authoring doc ${spec.key}`);
  const d = j.document ?? j.data ?? j;
  const id = d?.id ?? d?.docId ?? j.docId ?? j.doc_id;
  if (!uuidRe.test(String(id))) throw new Error(`create authoring doc ${spec.key}: no UUID id in ${JSON.stringify(j).slice(0, 200)}`);
  return { doc: { id, title: T(spec.name), status: d.status ?? 'DRAFT' }, governance: j.governance ?? null };
}

/** The document and its sections (a frozen document refuses edits, so only what is missing is added). */
async function ensureDocAndSections(ctx, program, spec, docRec) {
  const { api, tally } = ctx;
  // GET /api/authoring/docs has no per-program filter the shell uses (its program
  // parameter is `programId`); the surface lists by status. Match on title.
  const list = must(await api('GET', '/api/authoring/docs?status=all&limit=500'), 200, 'list authoring docs');
  let doc = findDemoByTitle(list.documents ?? [], spec.name);
  let created = false;
  let governance = null;
  if (doc) tally.found('authoring-document');
  else {
    ({ doc, governance } = await createDoc(ctx, program, spec));
    tally.created('authoring-document');
    created = true;
  }
  Object.assign(docRec, { id: doc.id, status: doc.status ?? null, created, governance });
  const have = must(await api('GET', `/api/authoring/docs/${doc.id}/sections`), 200, `sections ${spec.key}`).sections ?? [];
  let added = 0;
  for (const [i, s] of spec.sections.entries()) {
    if (have.some((x) => x.code === s.code)) {
      tally.found('authoring-section');
      continue;
    }
    must(await api('POST', '/api/authoring/sections', { doc_id: doc.id, code: s.code, title: s.title, content: s.content, order_index: i }), [200, 201], `create section ${spec.key} ${s.code}`);
    tally.created('authoring-section');
    added += 1;
  }
  const after = must(await api('GET', `/api/authoring/docs/${doc.id}/sections`), 200, `sections ${spec.key}`);
  docRec.sections = (after.sections ?? []).map((x) => ({ id: x.id, code: x.code, title: x.title }));
  return `${created ? 'created' : 'found'} ${doc.id}; sections ${docRec.sections.length} (${added} added)`;
}

/** One comment: found or posted, then resolved when the story resolves it. */
async function ensureComment({ api, tally }, docRec, existingRows, c) {
  const section = docRec.sections.find((s) => s.code === c.sectionCode);
  if (!section) throw new Error(`comment target section ${c.sectionCode} missing on ${docRec.key}`);
  let row = existingRows.find((x) => String(x.body ?? x.comment ?? '') === c.body) || null;
  if (row) tally.found('authoring-comment');
  else {
    const j = must(await api('POST', `/api/authoring/sections/${section.id}/comment`, { body: c.body, doc_id: docRec.id }), [200, 201], `comment ${docRec.key} ${c.sectionCode}`);
    row = j.comment ?? null;
    if (!row?.id) throw new Error(`comment ${docRec.key}: no comment id in ${JSON.stringify(j).slice(0, 200)}`);
    tally.created('authoring-comment');
  }
  if (c.resolution && row.status !== 'resolved') {
    const j = must(await api('PATCH', `/api/authoring/comments/${row.id}`, { status: 'resolved', resolution_note: c.resolution }), 200, `resolve comment ${row.id}`);
    if (j.comment?.status !== 'resolved') throw new Error(`resolve comment ${row.id}: status ${j.comment?.status}`);
    row = j.comment;
    tally.created('authoring-comment-resolution');
  } else if (c.resolution) tally.found('authoring-comment-resolution');
  return { id: row.id, sectionCode: c.sectionCode, status: row.status, resolvedBy: row.resolved_by ?? null };
}

async function ensureComments(ctx, spec, docRec) {
  const existing = must(await ctx.api('GET', `/api/authoring/documents/${docRec.id}/comments`), 200, `comments ${spec.key}`);
  const rows = asArray(existing, 'comments', 'data');
  const results = [];
  for (const c of spec.comments) results.push(await ensureComment(ctx, docRec, rows, c));
  docRec.comments = results;
  return results.map((r) => `${String(r.id).slice(0, 8)}:${r.status}`).join(', ');
}

/** The reviewer is the second signer when supplied, otherwise the author's own identity. */
function reviewerFor({ me, signer }) {
  return signer
    ? { id: Number(signer.session.user.id), name: signer.session.user.displayName ?? signer.email, email: signer.email }
    : { id: Number(me.id), name: me.displayName ?? me.email, email: me.email };
}

async function ensureReview(ctx, spec, docRec) {
  const { api, tally } = ctx;
  const reviewer = reviewerFor(ctx);
  const rows = asArray(must(await api('GET', `/api/authoring/documents/${docRec.id}/reviews`), 200, `reviews ${spec.key}`), 'reviews', 'data');
  let pending = rows.find((x) => x.reviewer_email === reviewer.email) || null;
  if (pending) tally.found('authoring-review-request');
  else {
    const j = must(await api('POST', `/api/authoring/documents/${docRec.id}/request-review`, { reviewers: [reviewer] }), [200, 201], `request-review ${spec.key}`);
    pending = (j.reviews ?? []).find((x) => x.reviewer_email === reviewer.email) || null;
    if (!pending) throw new Error(`request-review ${spec.key}: reviewer not recorded — ${JSON.stringify(j).slice(0, 200)}`);
    tally.created('authoring-review-request');
  }
  docRec.review = { reviewer: reviewer.email, status: pending.review_status ?? pending.status ?? null };
  if (spec.role !== 'in-review') return `reviewer ${reviewer.email} (${docRec.review.status})`;
  const wf = must(await api('GET', `/api/authoring/docs/${docRec.id}/workflow`), 200, `workflow ${spec.key}`);
  if (/PENDING|APPROVED/.test(JSON.stringify(wf))) tally.found('authoring-workflow');
  else {
    must(await api('POST', `/api/authoring/docs/${docRec.id}/submit`, { workflow_steps: [{ role: 'QA', approver_email: reviewer.email }] }), [200, 201], `submit ${spec.key}`);
    tally.created('authoring-workflow');
  }
  docRec.workflow = must(await api('GET', `/api/authoring/docs/${docRec.id}/workflow`), 200, `workflow ${spec.key}`);
  return `reviewer ${reviewer.email} (${docRec.review.status}); workflow ${JSON.stringify(docRec.workflow).slice(0, 80)}`;
}

async function ensureFreeze({ api, tally }, spec, docRec) {
  const f = await api('GET', `/api/authoring/docs/${docRec.id}/frozen`);
  if (f.status === 200 && /content_hash|contentHash/.test(JSON.stringify(f.json ?? ''))) tally.found('authoring-freeze');
  else {
    must(await api('POST', `/api/authoring/docs/${docRec.id}/freeze`, {
      reason: `Protocol Synopsis ${STUDY} settled: reviewer comments resolved; frozen as v1.0 for the IND (demo seed).`,
      version: '1.0',
    }), 200, `freeze ${spec.key}`);
    tally.created('authoring-freeze');
  }
  const frozen = must(await api('GET', `/api/authoring/docs/${docRec.id}/frozen`), 200, `frozen ${spec.key}`);
  const fr = frozen.frozen ?? frozen.data ?? frozen;
  docRec.frozen = { version: fr.version ?? fr.freeze_version ?? '1.0', contentHash: fr.content_hash ?? fr.contentHash ?? null, frozenAt: fr.frozen_at ?? fr.frozenAt ?? null };
  return `frozen v${docRec.frozen.version} ${String(docRec.frozen.contentHash ?? '').slice(0, 12)}…`;
}

async function ensureSignature({ api, run, tally, signer }, spec, docRec) {
  const rows = must(await api('GET', `/api/authoring/docs/${docRec.id}/signatures`), 200, `signatures ${spec.key}`).signatures ?? [];
  if (!signer) {
    const existing = rows[0] ?? null;
    docRec.signature = existing ? { id: existing.id, signer: existing.signer_email, meaning: existing.meaning } : NOT_EXECUTED_NO_SIGNER;
    run.note(`Authoring e-signature on ${spec.name}: ${NOT_EXECUTED_NO_SIGNER}`);
    return existing ? `found signature ${existing.id} by ${existing.signer_email}` : NOT_EXECUTED_NO_SIGNER;
  }
  const mine = rows.find((s) => s.signer_email === signer.email) || null;
  if (mine) {
    tally.found('authoring-signature');
    docRec.signature = { id: mine.id, signer: mine.signer_email, meaning: mine.meaning, coveredContentHash: mine.covered_content_hash };
    return `found signature ${mine.id} by ${mine.signer_email} (${mine.meaning})`;
  }
  // The platform's signing ceremony: the signer's own password, re-verified by
  // the server (the separate authoring PIN was retired 2026-09-23).
  must(await signer.api('POST', `/api/authoring/docs/${docRec.id}/e-sign`, {
    password: signer.password,
    meaning: 'REVIEWER',
    intent: `Reviewed Protocol Synopsis ${STUDY} v1.0 against Protocol v1.0 and SAP v1.0; content is consistent and settled for the IND (demo seed, second signer).`,
  }), 200, `e-sign ${spec.key}`);
  const after = must(await api('GET', `/api/authoring/docs/${docRec.id}/signatures`), 200, `signatures ${spec.key}`);
  const sig = (after.signatures ?? []).find((s) => s.signer_email === signer.email);
  if (!sig || !/^password/.test(String(sig.method)) || !sig.covered_content_hash) throw new Error(`e-sign ${spec.key}: signature not stored as expected — ${JSON.stringify(after).slice(0, 300)}`);
  tally.created('authoring-signature');
  docRec.signature = { id: sig.id, signer: sig.signer_email, meaning: sig.meaning, coveredFreezeVersion: sig.covered_freeze_version, coveredContentHash: sig.covered_content_hash };
  return `signed by ${sig.signer_email} (${sig.meaning}) covering freeze v${sig.covered_freeze_version}`;
}

async function ensureAuthoringDoc(ctx, program, spec) {
  const { run } = ctx;
  const docRec = { key: spec.key, title: T(spec.name), module: spec.module, role: spec.role };
  await run.step(`Authoring: ${spec.name}`, () => ensureDocAndSections(ctx, program, spec, docRec));
  if (spec.comments.length) await run.step(`Authoring: comments on ${spec.name}`, () => ensureComments(ctx, spec, docRec));
  if (spec.role === 'frozen-signed' || spec.role === 'in-review') {
    await run.step(`Authoring: review request on ${spec.name}`, () => ensureReview(ctx, spec, docRec));
  }
  if (spec.role === 'frozen-signed') {
    await run.step(`Authoring: freeze ${spec.name} v1.0`, () => ensureFreeze(ctx, spec, docRec));
    await run.step(`Authoring: e-signature by the second signer on ${spec.name}`, () => ensureSignature(ctx, spec, docRec));
  }
  return docRec;
}

export async function ensureAuthoring(ctx, program) {
  const out = [];
  ctx.run.record('authoring.documents', out);
  for (const spec of AUTHORING_DOCS) out.push(await ensureAuthoringDoc(ctx, program, spec));
  return out;
}
