/**
 * launch-demo/packs/lumen-csr.mjs — three completed synthetic clinical study reports in the Lumen account.
 *
 * 2026-11-10 (the founder: "a full account built out … specifically CSR report for their phase 2 study results"):
 * LMN-201's Phase 2 CSR, prepared up to its build. 2026-11-12 (the founder: "more completed full CSR report faux
 * examples in the demo environment that can be run from my code space and connected to one demo access users"):
 * three reports, each written in full, in the Lumen account the Codespace seeds on start and the demo access users
 * open (the Lumen lead, reviewer and approver):
 *
 *   LMN-201  Phase 2 Part B, recurrent C. difficile
 *   LMN-801  Phase 1 multiple ascending dose, weight
 *   LMN-301  Phase 2a human viral challenge, intranasal
 *
 * Each is written in full (all 119 ICH E3 sections) and sent for review to the Lumen reviewer. The seed stops
 * there on purpose. A CSR is approved only after a reviewer has mapped each quantitative claim in its saved text to
 * a cell of the tables built from its frozen study data (CSR_SCIENTIFIC_REVIEW_REQUIRED,
 * server/services/authoring/csr-scientific-review.ts). That check is a person's: a seed that wrote the claim map
 * would be the control answering itself. The presenter does it live, signed in through Demo access as the reviewer
 * ("Check the evidence", CsrEvidenceReview.tsx); no model is needed, as the tables come from the frozen study data.
 *
 * For each study, through the routes the screens use:
 *
 *   Its synthetic source in the project's Vault   POST /api/vault/ingest (LMN-201's is filed by lumen.mjs)
 *   Source review and approval                    POST /api/regulatory/documents, …/advance, …/sign (lumen-vault.mjs)
 *   The CSR document                              POST /api/authoring/docs, from "GLOBAL · Clinical Study Report (CSR)"
 *   Its study data, frozen                        POST /api/submission-orchestrator/csr/study-data
 *   Every section's text                          PATCH /api/authoring/sections/:id (lumen-csr-text.mjs)
 *   Sent for review to the Lumen reviewer         POST /api/authoring/documents/:id/request-review
 *
 * The text is the demo seed's, written as the demo lead, with every number computed from the study's source; no
 * model drafts it (lumen-csr-text.mjs). A section that already has text is left as it is, so a person's edits survive
 * a re-run. Without a reviewer and an approver (OQ_SIGNER_*, OQ_APPROVER_*) the sources stay unapproved, no study
 * data is frozen and nothing is sent for review, and the steps say so. Every step finds what an earlier run made.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { must } from '../lib.mjs';
import { asArray } from './biotech-shared.mjs';
import { CSR_SOURCE_FILE, CSR_SOURCE_TITLE, T } from './lumen-content.mjs';
import { ensureStage, signingPeople } from './lumen-vault.mjs';
import { LUMEN_CSR_STUDIES, generateSource, sourceBytes } from './lumen-csr-studies.mjs';
import { csrSectionContent } from './lumen-csr-text.mjs';

const CSR_TEMPLATE = 'GLOBAL · Clinical Study Report (CSR)';
const CSR = '/api/submission-orchestrator/csr';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** The source file and title for a study: the kit's file for LMN-201, a generated one for the others. */
export function studySource(study) {
  if (study.sourceFromKit) {
    const bytes = fs.readFileSync(CSR_SOURCE_FILE);
    return { title: CSR_SOURCE_TITLE, bytes, source: JSON.parse(bytes.toString('utf8')), fileName: null, code: null };
  }
  const source = generateSource(study);
  return { title: T(study.sourceTitle), bytes: sourceBytes(source), source, fileName: study.sourceCode, code: study.sourceCode };
}

/** The project's clinical sources as the editor's picker lists them; a list the server could not complete is not empty. */
async function clinicalSource(api, program, title) {
  const j = must(await api('GET', `${CSR}/sources?programId=${encodeURIComponent(program.id)}`), 200, 'list the clinical sources');
  if (!Array.isArray(j.sources)) throw new Error('the clinical source list was incomplete');
  return j.sources.find((s) => s.documentTitle === title) ?? null;
}

/** A generated study's source, filed in its project's Vault (LMN-201's is filed by lumen.mjs ensureCsrSource). */
async function ensureSourceFiled({ api, run, tally }, program, study, src) {
  if (study.sourceFromKit) return;
  await run.step(`CSR ${study.shortName}: the synthetic source in the Vault`, async () => {
    const search = must(await api('GET', `/api/c2c/project-vault/${program.id}/search?q=${encodeURIComponent('CSR source')}&limit=50`), 200, 'vault search');
    const hit = (search.data?.results ?? []).find((x) => x.title === src.title);
    if (hit) { tally.found('csr-source-file'); return `found ${hit.id}`; }
    const form = new FormData();
    form.append('file', new Blob([src.bytes], { type: 'application/json' }), src.fileName);
    form.append('programId', program.id);
    form.append('documentCode', src.code);
    form.append('documentTitle', src.title);
    form.append('documentType', 'OTHER');
    const res = await api('POST', '/api/vault/ingest', form);
    if (res.status !== 201) throw new Error(`the Vault refused the ${study.shortName} source (HTTP ${res.status}: ${String(res.text).slice(0, 200)})`);
    tally.created('csr-source-file');
    return `ingested ${res.json.document.id} (sha256 ${sha256(src.bytes).slice(0, 12)}…)`;
  });
}

async function ensureSourceApproved(ctx, program, study, src, people) {
  let source = null;
  await ctx.run.step(`CSR ${study.shortName}: the synthetic clinical source reviewed and approved in the Vault`, async () => {
    source = await clinicalSource(ctx.api, program, src.title);
    if (!source) return 'not executed: the synthetic CSR source is not in this project\'s Vault';
    if (source.approved) { ctx.tally.found('csr-source-approval'); return `approved already (v${source.version})`; }
    if (!people) return 'not executed: review and approval need a reviewer and an approver (OQ_SIGNER_*, OQ_APPROVER_*)';
    const done = await ensureStage(ctx, program, { stage: 'approved', code: `the ${study.shortName} CSR source`, key: `csrSource-${study.key}` }, source.documentId, people);
    source = await clinicalSource(ctx.api, program, src.title);
    if (!source?.approved) throw new Error('the CSR source was signed but the clinical source list does not show it approved');
    return done;
  });
  return source;
}

async function ensureCsrDocument({ api, run, tally }, program, study) {
  const title = T(study.reportTitle);
  let documentId = null;
  await run.step(`CSR ${study.shortName}: the clinical study report document in the one editor`, async () => {
    const docs = asArray(must(await api('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(program.id)}`), 200, 'list the project\'s documents'), 'documents', 'data', 'rows');
    const same = docs.filter((d) => d.title === title);
    if (same.length > 1) throw new Error(`Two documents are titled "${title}"; reconcile them before seeding.`);
    if (same[0]) { documentId = same[0].id; tally.found('csr-document'); return `found ${documentId}`; }
    const catalog = must(await api('GET', '/api/authoring/templates'), 200, 'read the document catalog');
    const template = asArray(catalog, 'templates', 'data').find((t) => t.title === CSR_TEMPLATE);
    if (!template) throw new Error(`the document catalog has no "${CSR_TEMPLATE}"`);
    const made = must(await api('POST', '/api/authoring/docs', {
      title, module: template.module, template_id: template.id, client_program_id: program.id,
    }), [200, 201], 'create the CSR document');
    documentId = made.document?.id ?? null;
    if (!documentId) throw new Error(`the CSR document was not recorded: ${JSON.stringify(made).slice(0, 300)}`);
    tally.created('csr-document');
    return `created ${documentId} from "${CSR_TEMPLATE}" (${template.sectionCount ?? '?'} sections)`;
  });
  return documentId;
}

/** Whether one of the document's frozen study data was frozen from the source with these bytes. */
export function studyDataFrom(studyData, sha) {
  return studyData.some((frozen) => Array.isArray(frozen?.sources) && frozen.sources.some((s) => s?.sha256 === sha));
}

async function ensureStudyData({ api, run, tally }, program, study, documentId, source) {
  await run.step(`CSR ${study.shortName}: the study data frozen in the document`, async () => {
    if (!documentId) return 'not executed: there is no CSR document';
    const read = must(await api('GET', `${CSR}/study-data?programId=${encodeURIComponent(program.id)}&documentId=${encodeURIComponent(documentId)}`), 200, 'read the document\'s study data');
    if (!Array.isArray(read.studyData)) throw new Error('the document\'s study data could not be read; this is not an empty list');
    // Frozen from THIS source, by its bytes: a document that froze an earlier source (the kit's v1, before 2026-11-10)
    // freezes this one as its newer study data, as "Freeze newer study data" does on the screen.
    if (source && studyDataFrom(read.studyData, source.sha256)) { tally.found('csr-study-data'); return `frozen already (${read.studyData.length})`; }
    if (!source?.approved) return 'not executed: the clinical source is not approved, and only an approved version is frozen';
    const frozen = must(await api('POST', `${CSR}/study-data`, {
      programId: program.id, documentId, source: { documentId: source.documentId, expectedSha256: source.sha256 },
    }), [200, 201], 'freeze the study data');
    tally.created('csr-study-data');
    return `frozen ${frozen.studyDataId ?? ''} from the approved source v${source.version}`.replace('  ', ' ');
  });
}

/** A section with nothing in it but markup or whitespace. */
export const isEmptySection = (html) => !String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

/** Every empty section written from the study's source; a section with text (a person's) is left. */
async function ensureSections({ api, run, tally }, study, documentId, src) {
  await run.step(`CSR ${study.shortName}: every section written from the study's synthetic data`, async () => {
    if (!documentId) return 'not executed: there is no CSR document';
    const sections = must(await api('GET', `/api/authoring/docs/${documentId}/sections`), 200, 'read the CSR sections').sections ?? [];
    if (!sections.length) throw new Error('the CSR document has no sections');
    const write = csrSectionContent(study, src.source);
    let written = 0;
    let kept = 0;
    for (const s of sections) {
      if (!isEmptySection(s.content)) { kept += 1; continue; }
      const res = await api('PATCH', `/api/authoring/sections/${s.id}`, {
        content: write(s.code, s.title),
        changeReason: `Demo seed: section ${s.code} written from the ${study.shortName} synthetic source frozen into this report.`,
      });
      if (res.status === 409 || res.status === 423) return `the document refuses edits (HTTP ${res.status}: ${String(res.text).slice(0, 160)}); ${written} written before that`;
      must(res, 200, `write section ${s.code}`);
      written += 1;
    }
    if (written) tally.created('csr-sections', written); else tally.found('csr-sections');
    return `${written} written, ${kept} already had text (of ${sections.length})`;
  });
}

/* ── Sent for review ───────────────────────────────────────────────────────────────────────────────────────────── */

const personOf = (who) => ({ id: Number(who.userId ?? who.session?.user?.id), name: who.session?.user?.displayName ?? who.email, email: who.email });

async function ensureReviewRequested({ api, run, tally }, study, documentId, people) {
  await run.step(`CSR ${study.shortName}: sent for review`, async () => {
    if (!documentId) return 'not executed: there is no CSR document';
    if (!people) return 'not executed: review needs a reviewer (OQ_SIGNER_*)';
    const reviewer = personOf(people.signer);
    const rows = asArray(must(await api('GET', `/api/authoring/documents/${documentId}/reviews`), 200, 'read the reviews'), 'reviews', 'data');
    if (rows.some((r) => r.reviewer_email === reviewer.email)) { tally.found('csr-review-request'); return `review with ${reviewer.email} already requested`; }
    const res = await api('POST', `/api/authoring/documents/${documentId}/request-review`, {
      reviewers: [reviewer], route: { reviewDueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) },
      reason: `Demo: the ${study.shortName} CSR is written in full from its frozen study data; send it for medical and statistical review.`,
    });
    if (res.status === 409) return `not requested: ${String(res.text).slice(0, 200)}`;
    must(res, [200, 201], 'request the review');
    tally.created('csr-review-request');
    return `review requested from ${reviewer.email}`;
  });
}

/** projects: the Lumen projects by code. ctx: { api, run, tally, identity, signer?, approver? }. */
export async function ensureLumenCsr(ctx, projects) {
  const people = signingPeople(ctx);
  const records = [];
  for (const study of LUMEN_CSR_STUDIES) {
    const program = projects[study.projectCode];
    if (!program) { ctx.run.note(`CSR ${study.shortName}: project ${study.projectCode} is missing; nothing was written.`); continue; }
    const src = studySource(study);
    await ensureSourceFiled(ctx, program, study, src);
    const source = await ensureSourceApproved(ctx, program, study, src, people);
    const documentId = await ensureCsrDocument(ctx, program, study);
    await ensureStudyData(ctx, program, study, documentId, source);
    await ensureSections(ctx, study, documentId, src);
    await ensureReviewRequested(ctx, study, documentId, people);
    records.push({ study: study.key, project: study.projectCode, documentId, title: T(study.reportTitle), sourceDocumentId: source?.documentId ?? null });
  }
  ctx.run.record('lumenCsr', records);
  ctx.run.note('Three synthetic CSRs are written in full and sent for review (LMN-201 Phase 2, LMN-801 Phase 1, LMN-301 Phase 2a): every number is computed from each study\'s synthetic source, frozen into the report as its study data. Approval waits for the reviewer\'s evidence check, which a person does (sign in as the Lumen reviewer).');
}
