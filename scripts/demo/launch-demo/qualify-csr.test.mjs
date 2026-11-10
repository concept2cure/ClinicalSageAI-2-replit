import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  qualifySource, qualifyFrozen, qualifyDraft, qualifyHumanReview, qualifyDocxXml, qualifyLive,
} from './qualify-csr.mjs';

const programId = '11111111-2222-4333-8444-555555555555';
const documentId = '11111111-2222-4333-8444-666666666666';
const reviewedDocumentId = '11111111-2222-4333-8444-777777777777';
const sourceId = '11111111-2222-4333-8444-888888888888';
const studyDataId = '11111111-2222-4333-8444-999999999999';
const sha = 'a'.repeat(64);
const source = { documentId: sourceId, sha256: sha, version: '2', approved: true };
const receipt = { ...source, approved: undefined, sourceApproval: 'canonical-lifecycle', studyId: 'FICT-201',
  studyInfo: { protocolNumber: 'FICT-201' } };
const sourceList = { format: 'concept2cure.csr-source.v1', sources: [source], limitReached: false };
const frozenData = { studyData: [{ studyDataId, createdAt: '2026-11-03T00:00:00Z', sources: [receipt] }] };
const text = 'In the source-linked analysis population, the recorded primary comparison is described without invented effect estimates. ' +
  'This narrative is a fictional demonstration section pending independent medical and statistical review.';
const hash = createHash('sha256').update(text).digest('hex');
const sections = { sections: [{ sectionNumber: '11.4.1', aiGenerated: true, model: 'claude-opus-5-5',
  content: text, contentHash: hash }] };
const finalSections = { success: true, readScope: 'document', sections: [
  { code: '11.4.1', content: '<p>' + text + '</p>' },
] };
const detail = { success: true, document: { id: reviewedDocumentId, client_program_id: programId,
  created_by: '5', readScope: 'document', status: 'APPROVED', approved_at: '2026-11-03T08:00:00Z',
  provenance: { importSource: { kind: 'csr', id: '51' } }, version: 3 } };
const reviews = { success: true, canApprove: true, reviews: [{ standing: 'current',
  review_status: 'approved', reviewer_id: '9', reviewed_at: '2026-11-03T07:30:00Z' }] };
const wordXml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>' +
  text.replaceAll('&', '&amp;') + '</w:t></w:r></w:p></w:body></w:document>';

test('approved source is unique and requires complete, exact Vault metadata', () => {
  assert.equal(qualifySource(sourceList, sourceId).sha256, sha);
  const shortenedId = '11111111-2222-4333-888888888888';
  assert.throws(() => qualifySource({ ...sourceList, sources: [{ ...source, documentId: shortenedId }] }, shortenedId), /existing UUID/);
  assert.throws(() => qualifySource({ ...sourceList, limitReached: true }, sourceId), /incomplete/);
  assert.throws(() => qualifySource({ ...sourceList, sources: [{ ...source, approved: false }] }, sourceId), /not approved/);
  assert.throws(() => qualifySource({ ...sourceList, sources: [source, source] }, sourceId), /expected exactly one/);
  assert.throws(() => qualifySource({ ...sourceList, sources: [] }, sourceId), /expected exactly one/);
});

test('frozen study-data identity and its exact approved source hash must reopen', () => {
  assert.equal(qualifyFrozen(frozenData, source).studyDataId, studyDataId);
  assert.throws(() => qualifyFrozen({ studyData: [] }, source), /expected exactly one/);
  assert.throws(() => qualifyFrozen({ studyData: [frozenData.studyData[0], frozenData.studyData[0]] }, source),
    /expected exactly one/);
  assert.throws(() => qualifyFrozen({ studyData: [{ ...frozenData.studyData[0],
    sources: [{ ...receipt, sha256: 'b'.repeat(64) }] }] }, source), /expected exactly one/);
});

test('real, hash-verified model drafting is distinguishable from templates, failures and demo mode', () => {
  assert.equal(qualifyDraft({ status: 'complete' }, sections).modelSections, 1);
  assert.throws(() => qualifyDraft({ status: 'failed' }, sections), /No completed/);
  assert.throws(() => qualifyDraft({ status: 'complete' },
    { sections: [{ ...sections.sections[0], model: 'demo-mode' }] }), /no hash-verified/);
  assert.throws(() => qualifyDraft({ status: 'complete' },
    { sections: [{ ...sections.sections[0], content: 'Changed content' }] }), /no hash-verified/);
  assert.throws(() => qualifyDraft({ status: 'complete' },
    { sections: [{ ...sections.sections[0], content: '[DATA TO BE INSERTED]' }] }), /no hash-verified/);
  assert.throws(() => qualifyDraft({ status: 'complete' },
    { sections: [{ ...sections.sections[0], aiGenerated: false }] }), /no hash-verified/);
});

test('independent current review must approve the exact imported CSR, not a Tasking card', () => {
  assert.equal(qualifyHumanReview(detail, reviews, finalSections, programId, 51).status, 'APPROVED');
  assert.throws(() => qualifyHumanReview(detail, reviews, finalSections, programId, 50), /no verified import/);
  assert.throws(() => qualifyHumanReview(detail, { ...reviews, reviews: [{ ...reviews.reviews[0],
    reviewer_id: '5' }] }, finalSections, programId, 51), /Independent current/);
  assert.throws(() => qualifyHumanReview(detail, { ...reviews, reviews: [{ ...reviews.reviews[0],
    standing: 'stale' }] }, finalSections, programId, 51), /Independent current/);
  assert.throws(() => qualifyHumanReview({ ...detail, document: { ...detail.document, status: 'DRAFT' } },
    reviews, finalSections, programId, 51), /not a recorded, approved/);
  assert.throws(() => qualifyHumanReview(detail, reviews,
    { ...finalSections, sections: [{ content: '[DATA TO BE INSERTED]' }] }, programId, 51), /placeholder/);
});

test('the reopened DOCX must contain actual saved prose from the approved version', () => {
  assert.equal(qualifyDocxXml(wordXml, finalSections.sections).matchingSections, 1);
  assert.throws(() => qualifyDocxXml('<w:document/>', finalSections.sections), /missing saved CSR text/);
  assert.throws(() => qualifyDocxXml('not a Word document', finalSections.sections), /no Word document/);
  assert.throws(() => qualifyDocxXml(wordXml, [{ content: '[DATA TO BE INSERTED]' }]), /No substantial/);
  assert.equal(qualifyDocxXml(wordXml, finalSections.sections, text.slice(0, 100)).editedTextVerified, true);
  assert.throws(() => qualifyDocxXml(wordXml, finalSections.sections, 'Unrecorded fabricated edited wording in the document.'),
    /not in the currently saved CSR/);
  const absent = 'Another very long unique CSR source section was entered and saved in the governed editor but not exported.';
  assert.throws(() => qualifyDocxXml(wordXml, [...finalSections.sections, { code: '12.3', content: absent }]),
    /missing saved CSR text for 1 section/);
});

test('the real API path does not create a model build unless explicitly requested', async () => {
  const requests = [];
  const api = async (method, path) => {
    requests.push(method + ' ' + path);
    if (path.startsWith('/api/submission-orchestrator/csr/sources?')) return { status: 200, json: sourceList };
    if (path.startsWith('/api/authoring/docs/' + documentId)) return { status: 200, json: { success: true,
      document: { client_program_id: programId, readScope: 'document' } } };
    if (path.startsWith('/api/submission-orchestrator/csr/study-data?')) return { status: 200, json: frozenData };
    if (path.startsWith('/api/submission-orchestrator/runs/' + studyDataId)) return { status: 200, json: {
      runId: studyDataId, programId, historical: true, studies: [{ source: receipt, tables: { disposition: {} } }] } };
    if (path.startsWith('/api/csr/jobs?')) return { status: 200, json: { jobs: [] } };
    throw Error('Unexpected ' + method + ' ' + path);
  };
  await assert.rejects(qualifyLive({ api, options: { programId, documentId, sourceId }, downloadDocx: () => {
    throw Error('Export should never be attempted');
  } }), /expected exactly one/);
  assert.equal(requests.some(r => r.startsWith('POST ')), false);
});

test('explicit build request starts one existing API job, but never reports completed drafting', async () => {
  let posts = 0;
  const api = async (method, path, body) => {
    if (method === 'POST' && path === '/api/csr/jobs') {
      posts++;
      assert.equal(body.evidenceSource.runId, studyDataId);
      return { status: 202, json: { jobId: 51, status: 'queued' } };
    }
    if (path.startsWith('/api/submission-orchestrator/csr/sources?')) return { status: 200, json: sourceList };
    if (path.startsWith('/api/authoring/docs/' + documentId)) return { status: 200, json: { success: true,
      document: { client_program_id: programId, readScope: 'document' } } };
    if (path.startsWith('/api/submission-orchestrator/csr/study-data?')) return { status: 200, json: frozenData };
    if (path.startsWith('/api/submission-orchestrator/runs/' + studyDataId)) return { status: 200, json: {
      runId: studyDataId, programId, historical: true, studies: [{ source: receipt, tables: { disposition: {} } }] } };
    if (path.startsWith('/api/csr/jobs?')) return { status: 200, json: { jobs: [] } };
    throw Error('Unexpected ' + method + ' ' + path);
  };
  const report = await qualifyLive({ api,
    options: { programId, documentId, sourceId, startDraft: true }, downloadDocx: () => {
      throw Error('A queued job cannot export');
    } });
  assert.equal(posts, 1);
  assert.equal(report.verdict, 'NOT_QUALIFIED');
  assert.equal(report.jobId, 51);
  assert.equal(report.stages.draft.status, 'queued');
  assert.equal(report.stages.freeze.passed, true);
});
