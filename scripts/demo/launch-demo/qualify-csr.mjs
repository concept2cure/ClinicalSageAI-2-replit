#!/usr/bin/env node
/**
 * Existing Concept2Cure CSR workflow qualification (not a second CSR module).
 *
 * An operator uses authenticated APIs to freeze an ALREADY APPROVED Vault source,
 * start REAL CSR drafting, then check the saved, human-reviewed Authoring copy.
 * The optional final export is downloaded, reopened as DOCX and checked against
 * the same currently saved sections. It never invents clinical approval,
 * bypasses a model PQ gate, or signs on behalf of a reviewer.
 *
 * Example (authorized demo account and existing IDs):
 *   DEMO_SEED_TOKEN=... node scripts/demo/launch-demo/qualify-csr.mjs \
 *     --base-url https://staging.example --organization-id 42 \
 *     --program-id <uuid> --document-id <uuid> --source-id <uuid> --freeze
 *   # After the actual CSR build and independent review, run:
 *   DEMO_SEED_TOKEN=... node scripts/demo/launch-demo/qualify-csr.mjs \
 *     --base-url https://staging.example --organization-id 42 \
 *     --program-id <uuid> --document-id <uuid> --source-id <uuid> \
 *     --job-id 123 --reviewed-document-id <uuid> --export
 *
 * --start-draft explicitly starts ONE build; it never silently retries a job.
 * --export writes only to local output-dir (not the repository).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const PLACEHOLDER = /\[[^[\]]*[A-Za-z][^[\]]*\]/;
const digest = value => createHash('sha256').update(value).digest('hex');
const refuse = message => { throw new Error(message); };
const exactly = (rows, predicate, label) => {
  if (!Array.isArray(rows)) refuse(label + ' list was unreadable.');
  const found = rows.filter(predicate);
  if (found.length !== 1) refuse(label + ': expected exactly one recorded match, found ' + found.length + '. Reconcile the records.');
  return found[0];
};
const requiredUuid = (value, name) => {
  if (!UUID.test(String(value ?? ''))) refuse(name + ' must be an existing UUID.');
  return String(value).toLowerCase();
};
const requiredId = (value, name) => {
  if (!/^[1-9]\d*$/.test(String(value ?? '')) || !Number.isSafeInteger(Number(value))) refuse(name + ' must be a saved positive integer.');
  return Number(value);
};

/** A source is admitted only when its CURRENT, platform-approved Vault version is exact. */
export function qualifySource(list, sourceId) {
  requiredUuid(sourceId, 'source-id');
  if (list?.format !== 'concept2cure.csr-source.v1' || !Array.isArray(list.sources) ||
      list.limitReached !== false) refuse('The CSR clinical source list is incomplete; do not freeze.');
  const row = exactly(list.sources, value => String(value.documentId).toLowerCase() === String(sourceId).toLowerCase(),
    'Approved clinical source');
  if (row.approved !== true || !SHA.test(String(row.sha256 ?? '')) || !row.version) {
    refuse('The exact CSR clinical source is not approved with a readable version and SHA-256.');
  }
  return row;
}

/** A server-side frozen-source receipt must bind the actual document and source hash. */
export function qualifyFrozen(data, source) {
  const entries = data?.studyData;
  const matches = Array.isArray(entries) ? entries.filter(entry =>
    Array.isArray(entry.sources) && entry.sources.some(s =>
      s.documentId === source.documentId && s.sha256 === source.sha256)) : null;
  const entry = exactly(matches, () => true, 'Frozen study data');
  if (!UUID.test(String(entry.studyDataId ?? '')) || !entry.createdAt ||
      entry.sources.length !== 1 || entry.sources[0].sourceApproval !== 'canonical-lifecycle' ||
      !entry.sources[0].studyInfo || !entry.sources[0].studyId) {
    refuse('Frozen study data has incomplete identity, authority or provenance.');
  }
  return entry;
}

/** A completed queue status without real persisted model prose is NOT an AnA drafting proof. */
export function qualifyDraft(status, body) {
  if (status?.status !== 'complete' || !Array.isArray(body?.sections) || body.sections.length === 0) {
    refuse('No completed, readable CSR build with saved sections is present.');
  }
  const drafted = body.sections.filter(s => s.aiGenerated === true && typeof s.model === 'string' &&
    s.model.trim() && !/demo.?mode/i.test(s.model) &&
    typeof s.content === 'string' && s.content.trim() && !PLACEHOLDER.test(s.content) &&
    typeof s.contentHash === 'string' && digest(s.content) === s.contentHash);
  if (!drafted.length) refuse('The CSR build has no hash-verified section authored by a real model; template text is not AnA drafting.');
  if (body.sections.some(s => typeof s.content !== 'string' || !s.content.trim() ||
      !SHA.test(String(s.contentHash ?? '')) || digest(s.content) !== s.contentHash ||
      PLACEHOLDER.test(s.content))) {
    refuse('One or more saved CSR build sections are blank, placeholders or hash-inconsistent.');
  }
  return { modelSections: drafted.length, savedSections: body.sections.length,
    models: [...new Set(drafted.map(s => s.model))] };
}

/** Independent peer review is an actual server record, never a task-card status. */
export function qualifyHumanReview(detail, reviews, sections, programId, jobId) {
  const d = detail?.document;
  if (detail?.success !== true || !d || d.readScope !== 'document' ||
      String(d.client_program_id).toLowerCase() !== String(programId).toLowerCase()) {
    refuse('The final CSR document cannot be read in its recorded project.');
  }
  const source = d.provenance?.importSource;
  if (source?.kind !== 'csr' || String(source.id) !== String(jobId)) {
    refuse('The final Authoring document has no verified import from the selected CSR build.');
  }
  if (!['APPROVED', 'FROZEN'].includes(String(d.status ?? '').toUpperCase()) || !d.approved_at) {
    refuse('The final CSR is not a recorded, approved Authoring document.');
  }
  if (sections?.success !== true || sections.readScope !== 'document' ||
      !Array.isArray(sections.sections) || sections.sections.length === 0) {
    refuse('The saved full CSR sections could not be reopened.');
  }
  if (sections.sections.some(s => typeof s.content !== 'string' || !s.content.trim() ||
      PLACEHOLDER.test(s.content))) {
    refuse('The approved CSR still has blank or source-data placeholder sections.');
  }
  if (reviews?.success !== true || reviews.canApprove !== true ||
      !Array.isArray(reviews.reviews) || reviews.reviews.length === 0 ||
      reviews.reviews.some(r => r.standing !== 'current' || r.review_status !== 'approved' ||
        !r.reviewed_at || String(r.reviewer_id) === String(d.created_by))) {
    refuse('Independent current scientific peer-review approval is not verified for this document snapshot.');
  }
  return { documentId: d.id, version: d.version, status: d.status,
    reviewedBy: reviews.reviews.map(r => String(r.reviewer_id)), sections: sections.sections.length };
}

const entities = text => text.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const normalized = text => entities(String(text)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** A generated file must reopen and contain distinctive words from this saved version. */
export function qualifyDocxXml(xml, savedSections, expectedText = '') {
  if (typeof xml !== 'string' || !xml.includes('<w:document')) refuse('The exported DOCX has no Word document body.');
  // Word frequently splits text across XML runs; compare normalized characters
  // rather than assuming an entire paragraph is emitted as one <w:t> node.
  const wordText = normalized([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(m => m[1]).join(' '));
  const compact = value => normalized(value).replace(/[^\p{L}\p{N}]/gu, '');
  const wordChars = compact(wordText);
  const candidates = savedSections.filter(s => typeof s.content === 'string' &&
    normalized(s.content).length >= 100 && !PLACEHOLDER.test(s.content));
  if (!candidates.length) refuse('No substantial saved CSR section is available for export-content comparison.');
  const missing = candidates.filter(s => !wordChars.includes(compact(s.content).slice(0, 100)));
  if (missing.length) {
    refuse('The reopened Word file is missing saved CSR text for ' + missing.length +
      ' section(s): ' + missing.map(s => s.code ?? s.sectionNumber ?? s.id ?? 'unknown').join(', ') + '.');
  }
  if (expectedText) {
    const excerpt = compact(expectedText);
    if (excerpt.length < 25) refuse('An edited-text comparison must contain at least 25 alphanumeric characters.');
    if (!savedSections.some(s => compact(s.content).includes(excerpt))) {
      refuse('The specified edited excerpt is not in the currently saved CSR; verify editor Save before export.');
    }
    if (!wordChars.includes(excerpt)) refuse('The exported Word file does not preserve the saved edited excerpt.');
  }
  return { compared: candidates.length, matchingSections: candidates.length,
    editedTextVerified: expectedText ? true : 'not_supplied', documentTextLength: wordText.length };
}

/** Exact auth session, live APIs, and explicit human-review records; no simulated service doubles. */
export async function qualifyLive({ api, downloadDocx, options }) {
  const { programId, documentId, sourceId, jobId, reviewedDocumentId, freeze, startDraft, exportFile, expectedText } = options;
  const get = async path => {
    const r = await api('GET', path);
    if (r.status !== 200 || !r.json) refuse('GET ' + path + ': HTTP ' + r.status + ' ' + String(r.text ?? '').slice(0, 250));
    return r.json;
  };
  const post = async (path, body, expected) => {
    const r = await api('POST', path, body);
    if (r.status !== expected || !r.json) refuse('POST ' + path + ': HTTP ' + r.status + ' ' + String(r.text ?? '').slice(0, 350));
    return r.json;
  };
  const params = '?programId=' + encodeURIComponent(programId);
  const stages = {};
  const report = { verdict: 'NOT_QUALIFIED', stages, projectId: programId, documentId,
    assessedAt: new Date().toISOString(), completedByHuman: false };
  let currentStage = 'source';
  try {
  const source = qualifySource(await get('/api/submission-orchestrator/csr/sources' + params), sourceId);
  stages.source = { passed: true, documentId: source.documentId, sha256: source.sha256, version: source.version, platformApproved: true };
  currentStage = 'workingDocument';
  const draftDoc = await get('/api/authoring/docs/' + encodeURIComponent(documentId) + params);
  if (draftDoc.success !== true || String(draftDoc.document?.client_program_id).toLowerCase() !== programId ||
      draftDoc.document?.readScope !== 'document') refuse('The working document is not the full document in the correct project.');
  currentStage = 'freeze';
  let studyData = await get('/api/submission-orchestrator/csr/study-data' + params + '&documentId=' + documentId);
  const already = studyData.studyData?.filter(x => x.sources?.some(s => s.documentId === source.documentId && s.sha256 === source.sha256)) ?? [];
  if (!already.length && freeze) {
    const preview = await post('/api/submission-orchestrator/csr/source-preview',
      { programId, documentId: source.documentId, expectedSha256: source.sha256 }, 200);
    if (preview.approved !== true || preview.source?.sha256 !== source.sha256 || !preview.tables) {
      refuse('The exact approved source could not produce a complete table preview. Nothing was frozen.');
    }
    await post('/api/submission-orchestrator/csr/study-data', { programId, documentId,
      source: { documentId: source.documentId, expectedSha256: source.sha256 } }, 201);
    studyData = await get('/api/submission-orchestrator/csr/study-data' + params + '&documentId=' + documentId);
  }
  const frozen = qualifyFrozen(studyData, source);
  stages.freeze = { passed: true, studyDataId: frozen.studyDataId, exactSourceSha256: source.sha256 };
  currentStage = 'retainedTables';
  const retained = await get('/api/submission-orchestrator/runs/' + frozen.studyDataId +
    '/clinical-tables' + params);
  if (retained.runId !== frozen.studyDataId || retained.programId !== programId || retained.historical !== true ||
      !Array.isArray(retained.studies) || retained.studies.length !== 1 ||
      retained.studies[0].source?.sha256 !== source.sha256 || !retained.studies[0].tables) {
    refuse('The editor cannot reopen frozen source tables with the same receipt.');
  }
  stages.retainedTables = { passed: true, studyId: frozen.sources[0].studyId };
  currentStage = 'draft';
  const jobsPath = '/api/csr/jobs' + params + '&runId=' + frozen.studyDataId;
  let jobs = await get(jobsPath);
  if (!Array.isArray(jobs.jobs)) refuse('CSR job history is unreadable.');
  let chosen = jobId;
  if (startDraft && !chosen) {
    if (jobs.jobs.length) refuse('A build already exists for these tables; choose its exact job ID before another paid build.');
    const created = await post('/api/csr/jobs', { programId, studyInfo: frozen.sources[0].studyInfo,
      evidenceSource: { programId, runId: frozen.studyDataId, studyId: frozen.sources[0].studyId } }, 202);
    chosen = requiredId(created.jobId, 'created job');
    stages.draft = { passed: false, jobId: chosen, status: 'queued', reason: 'A queued build is not saved AnA drafting.' };
    report.jobId = chosen; return report;
  }
  if (!chosen) {
    const complete = jobs.jobs.filter(j => j.status === 'complete');
    chosen = requiredId(exactly(complete, () => true, 'Completed CSR build').jobId, 'job-id');
  }
  const linked = exactly(jobs.jobs, j => j.jobId === chosen, 'Selected CSR build');
  if (linked.status !== 'complete') refuse('CSR build ' + chosen + ' is ' + linked.status + ', not complete.');
  const verified = qualifyDraft(await get('/api/csr/jobs/' + chosen),
    await get('/api/csr/jobs/' + chosen + '/sections'));
  stages.draft = { passed: true, jobId: chosen, ...verified };
  report.jobId = chosen;
  currentStage = 'review';
  if (!reviewedDocumentId) refuse('An exact imported and independently approved CSR document ID is required for human review and export qualification.');
  const finalParams = '?programId=' + encodeURIComponent(programId);
  const detail = await get('/api/authoring/docs/' + reviewedDocumentId + finalParams);
  const sections = await get('/api/authoring/docs/' + reviewedDocumentId + '/sections' + finalParams);
  const reviews = await get('/api/authoring/documents/' + reviewedDocumentId + '/reviews');
  stages.review = { passed: true, ...qualifyHumanReview(detail, reviews, sections, programId, chosen) };
  report.completedByHuman = true;
  currentStage = 'export';
  if (!exportFile) refuse('Export and reopen have not been exercised. Run with --export in the same environment.');
  const bytes = await downloadDocx(reviewedDocumentId);
  if (!Buffer.isBuffer(bytes) || bytes.length < 2000) refuse('The DOCX export returned no substantial file.');
  const JSZip = (await import('jszip')).default;
  const reopened = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const doc = reopened.file('word/document.xml');
  if (!doc) refuse('The downloaded DOCX cannot reopen its Word document.xml.');
  const compare = qualifyDocxXml(await doc.async('string'), sections.sections, expectedText);
  stages.export = { passed: true, sha256: digest(bytes), size: bytes.length, ...compare };
  report.exportBytes = bytes; // discarded before receipt serialization; caller may write exact file locally
  report.verdict = 'QUALIFIED_API_PATH_ONLY_BROWSER_REQUIRED';
  return report;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    stages[currentStage] = { passed: false, reason: error.message };
    error.partialReport = { ...report, blocker: error.message, failedStage: currentStage };
    throw error;
  }
}

const flag = (args, option) => args.includes('--' + option);
const option = (args, name) => {
  const pos = args.indexOf('--' + name);
  return pos < 0 ? undefined : args[pos + 1];
};
export async function main(args = process.argv.slice(2)) {
  const programId = requiredUuid(option(args, 'program-id'), 'program-id');
  const documentId = requiredUuid(option(args, 'document-id'), 'document-id');
  const sourceId = requiredUuid(option(args, 'source-id'), 'source-id');
  const reviewedDocumentId = option(args, 'reviewed-document-id')
    ? requiredUuid(option(args, 'reviewed-document-id'), 'reviewed-document-id') : undefined;
  const organizationId = requiredId(option(args, 'organization-id') || process.env.DEMO_EXPECTED_ORGANIZATION_ID, 'organization-id');
  const baseUrl = option(args, 'base-url') || process.env.DEMO_BASE_URL;
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) refuse('An actual target --base-url is required.');
  if (!process.env.DEMO_SEED_TOKEN) refuse('An authorized DEMO_SEED_TOKEN is required; this check cannot use anonymous/demo authentication.');
  const { connect } = await import('./lib.mjs');
  const connection = await connect({ baseUrl, token: process.env.DEMO_SEED_TOKEN,
    expectedOrganizationId: organizationId });
  const expectedName = option(args, 'organization-name');
  if (!expectedName || expectedName.trim() !== connection.identity.organizationName.trim()) {
    refuse('The exact organization name does not match the authenticated tenant. --organization-name is required.');
  }
  const outputDir = resolve(option(args, 'output-dir') || '/tmp/concept2cure-csr-acceptance');
  mkdirSync(outputDir, { recursive: true });
  const excerptFile = option(args, 'expected-text-file');
  const expectedText = excerptFile ? readFileSync(resolve(excerptFile), 'utf8').trim() : '';
  const options = { programId, documentId, sourceId, reviewedDocumentId, expectedText,
    jobId: option(args, 'job-id') ? requiredId(option(args, 'job-id'), 'job-id') : undefined,
    freeze: flag(args, 'freeze'), startDraft: flag(args, 'start-draft'), exportFile: flag(args, 'export') };
  let report;
  try {
    report = await qualifyLive({ api: connection.api, options,
      downloadDocx: async id => {
        const response = await fetch(connection.baseUrl + '/api/authoring/docs/' + id + '/export?fmt=docx', {
          method: 'POST', headers: { Authorization: 'Bearer ' + process.env.DEMO_SEED_TOKEN,
            Origin: connection.baseUrl, 'Content-Type': 'application/json',
            Accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
          body: JSON.stringify({ format: 'docx' }),
        });
        if (!response.ok || !(response.headers.get('content-type') ?? '').includes('officedocument')) {
          refuse('Controlled DOCX export failed HTTP ' + response.status + ': ' + (await response.text()).slice(0, 250));
        }
        return Buffer.from(await response.arrayBuffer());
      } });
  } catch (error) {
    report = error?.partialReport ?? { verdict: 'NOT_QUALIFIED', assessedAt: new Date().toISOString(),
      projectId: programId, documentId, blocker: error instanceof Error ? error.message : String(error) };
    report.browserQualification = 'NOT_EXECUTED';
  }
  if (report.exportBytes) {
    const bytes = report.exportBytes; delete report.exportBytes;
    writeFileSync(join(outputDir, 'csr-export-reopened.docx'), bytes);
  }
  report.browserQualification = 'NOT_EXECUTED';
  writeFileSync(join(outputDir, 'csr-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict.startsWith('QUALIFIED') ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
