/**
 * launch-demo/packs/lumen-csr.mjs — LMN-201's Phase 2 clinical study report, ready to open (2026-11-10, the founder:
 * "a full account built out … specifically CSR report for their phase 2 study results").
 *
 * The Lumen pack already files the SYNTHETIC LMN-201-like Part B CSR source in LMN-201's Vault (lumen.mjs
 * ensureCsrSource). A person then had to send it for review, have two others sign it, create the CSR document and
 * freeze its study data before anything could be shown. This does those steps through the routes the screens use:
 *
 *   Vault review and approval   POST /api/regulatory/documents, …/advance, …/sign   (lumen-vault.mjs ensureStage)
 *   The CSR document            POST /api/authoring/docs, from the catalog's "GLOBAL · Clinical Study Report (CSR)"
 *   Its study data, frozen      POST /api/submission-orchestrator/csr/study-data    (editor/StudyDataSource.tsx)
 *
 * It stops there. The build is AnA drafting with the deployment's model key, which the presenter starts; nothing
 * here drafts, reviews or signs the report. Without a reviewer and an approver (OQ_SIGNER_*, OQ_APPROVER_*) the
 * source stays unapproved and nothing is frozen, and the steps say so. Every step finds what an earlier run made.
 */
import { must } from '../lib.mjs';
import { asArray } from './biotech-shared.mjs';
import { CSR_SOURCE_TITLE, T } from './lumen-content.mjs';
import { ensureStage, signingPeople } from './lumen-vault.mjs';

const SOURCE_TITLE = CSR_SOURCE_TITLE;
const CSR_TITLE = T('LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC');
const CSR_TEMPLATE = 'GLOBAL · Clinical Study Report (CSR)';
const CSR = '/api/submission-orchestrator/csr';

/** The project's clinical sources as the editor's picker lists them; a list the server could not complete is not empty. */
async function clinicalSource(api, program) {
  const j = must(await api('GET', `${CSR}/sources?programId=${encodeURIComponent(program.id)}`), 200, 'list the clinical sources');
  if (!Array.isArray(j.sources)) throw new Error('the clinical source list was incomplete');
  return j.sources.find((s) => s.documentTitle === SOURCE_TITLE) ?? null;
}

async function ensureSourceApproved(ctx, program, people) {
  let source = null;
  await ctx.run.step('CSR: the synthetic clinical source reviewed and approved in the Vault', async () => {
    source = await clinicalSource(ctx.api, program);
    if (!source) return 'not executed: the synthetic CSR source is not in this project\'s Vault';
    if (source.approved) { ctx.tally.found('csr-source-approval'); return `approved already (v${source.version})`; }
    if (!people) return 'not executed: review and approval need a reviewer and an approver (OQ_SIGNER_*, OQ_APPROVER_*)';
    const done = await ensureStage(ctx, program, { stage: 'approved', code: 'the CSR source', key: 'csrSource' }, source.documentId, people);
    source = await clinicalSource(ctx.api, program);
    if (!source?.approved) throw new Error('the CSR source was signed but the clinical source list does not show it approved');
    return done;
  });
  return source;
}

async function ensureCsrDocument({ api, run, tally }, program) {
  let documentId = null;
  await run.step('CSR: the clinical study report document in the one editor', async () => {
    const docs = asArray(must(await api('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(program.id)}`), 200, 'list the project\'s documents'), 'documents', 'data', 'rows');
    const same = docs.filter((d) => d.title === CSR_TITLE);
    if (same.length > 1) throw new Error(`Two documents are titled "${CSR_TITLE}"; reconcile them before seeding.`);
    if (same[0]) { documentId = same[0].id; tally.found('csr-document'); return `found ${documentId}`; }
    const catalog = must(await api('GET', '/api/authoring/templates'), 200, 'read the document catalog');
    const template = asArray(catalog, 'templates', 'data').find((t) => t.title === CSR_TEMPLATE);
    if (!template) throw new Error(`the document catalog has no "${CSR_TEMPLATE}"`);
    const made = must(await api('POST', '/api/authoring/docs', {
      title: CSR_TITLE, module: template.module, template_id: template.id, client_program_id: program.id,
    }), [200, 201], 'create the CSR document');
    documentId = made.document?.id ?? null;
    if (!documentId) throw new Error(`the CSR document was not recorded: ${JSON.stringify(made).slice(0, 300)}`);
    tally.created('csr-document');
    return `created ${documentId} from "${CSR_TEMPLATE}" (${template.sectionCount ?? '?'} sections)`;
  });
  return documentId;
}

/** Whether one of the document's frozen study data was frozen from the source with these bytes. */
export function studyDataFrom(studyData, sha256) {
  return studyData.some((frozen) => Array.isArray(frozen?.sources) && frozen.sources.some((s) => s?.sha256 === sha256));
}

async function ensureStudyData({ api, run, tally }, program, documentId, source) {
  await run.step('CSR: the study data frozen in the document', async () => {
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

/** program: { id } of LMN-201. ctx: { api, run, tally, identity, signer?, approver? }. */
export async function ensureLumenCsr(ctx, program) {
  const people = signingPeople(ctx);
  const source = await ensureSourceApproved(ctx, program, people);
  const documentId = await ensureCsrDocument(ctx, program);
  await ensureStudyData(ctx, program, documentId, source);
  ctx.run.record('lumenCsr', { documentId, title: CSR_TITLE, sourceDocumentId: source?.documentId ?? null });
  ctx.run.note('The LMN-201 CSR is prepared up to its build: the source is approved, the document exists and its study data is frozen. Drafting is AnA with a model key, started by the presenter.');
}
