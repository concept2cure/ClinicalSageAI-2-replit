/** Explicit synthetic DTOs for the existing artifact working-copy contract. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROGRAM, AT, actor, access, json, origins, scopeDocs } from './browser-fixtures.mjs';

export const SELECTOR = { kind: 'artifact', artifactId: 'CER-synthetic-retained-44', version: 3 };
export const SAVED_DOC = 'dddddddd-0000-4000-8000-000000000901';
export const SAVED_SECTION = 'aaaaaaaa-0000-4000-8000-000000000901';
export const SAVED_TEXT = 'Evidence from the saved artifact.';
export const CURRENT_HEAD_WARNING = 'This is a current saved-text snapshot, not historical-version proof. Its exact current source is rechecked when creating or releasing this copy.';
export const DRIFT_MESSAGE = 'The saved workflow source changed. Preview it again. Nothing was imported.';
const warnings = ['This is an independent unbound working draft. Source completion, approval and signatures are not transferred.', CURRENT_HEAD_WARNING];
const raw = `# Retained CER\n\n${SAVED_TEXT}`, rawSha = createHash('sha256').update(raw).digest('hex');
const fingerprint = '6'.repeat(64), reason = 'Review retained artifact as an independent working draft.';
const origin = { kind: 'artifact', id: SELECTOR.artifactId, programId: PROGRAM, title: 'Retained CER artifact',
  documentType: null, sectionCode: null, fingerprint, selection: SELECTOR, gaps: [], version: String(SELECTOR.version),
  conversion: 'artifact-snapshot', sourceScope: { level: 'program', programId: PROGRAM, projectId: 42 },
  association: { mode: 'recorded', reason: null },
  sectionOrigins: [{ code: 'artifact.content', sourceRowId: 'concept2cure_artifacts:734', contentSha256: rawSha,
    originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }],
  artifactSource: { artifactId: SELECTOR.artifactId, version: SELECTOR.version, contentSha256: rawSha,
    verificationBasis: 'current-head-snapshot', hashScheme: 'raw-sha256', recordedContentHash: rawSha,
    updatedAt: AT, type: 'CER', category: 'device', status: 'draft', ctdSection: null,
    metadata: { source: 'synthetic retained author text' }, citations: [], machineLineage: [], provenanceEvents: [] },
};
const section = { id: SAVED_SECTION, doc_id: SAVED_DOC, tenant_id: Number(actor.organizationId), code: 'artifact.content',
  title: origin.title, content: `<h1>Retained CER</h1><p>${SAVED_TEXT}</p>`, order_index: 1, track_changes: false,
  comment_count: 0, revision_count: 1, citation_count: 0, updated_at: AT };
const doc = { id: SAVED_DOC, title: 'Retained CER artifact working copy', tenant_id: Number(actor.organizationId),
  client_program_id: PROGRAM, program_id: PROGRAM, module: null, product_code: null, c2c_document_id: null,
  template_id: null, status: 'DRAFT', created_by: actor.id, section_count: 1, updated_at: AT,
  sourceMetadataState: 'available', provenance: { source: 'import', importSource: { ...origin, warnings, reason } } };
const preview = { preview: true, origin, fingerprint,
  sections: [{ code: section.code, title: section.title, contentSha256: rawSha }], gaps: [], warnings,
  target: { programId: PROGRAM, projectId: 42 }, association: { mode: 'recorded', required: false, reasonRequired: false,
    sourceProgramId: PROGRAM, sourceProjectId: 42, targetProgramId: PROGRAM } };

async function write(route, state) {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (!state.artifactMode || request.method() !== 'POST' || path !== '/api/authoring/import/source') return false;
  const body = request.postDataJSON();
  try {
    assert.equal(body.programId, PROGRAM);
    assert.deepEqual(body.source, SELECTOR);
    if (body.previewOnly === true) {
      state.simulatedWrites.push({ phase: 'preview', method: 'POST', path, body, explicitlySimulated: true, productionWriteExecuted: false });
      await route.fulfill(json({ success: true, data: preview }));
    } else {
      assert.ok(body.previewOnly === undefined || body.previewOnly === false);
      assert.equal(body.expectedFingerprint, fingerprint);
      assert.equal(body.reason, reason);
      state.simulatedWrites.push({ phase: 'create', method: 'POST', path, body, explicitlySimulated: true, productionWriteExecuted: false });
      if (state.artifactMode === 'drift') await route.fulfill(json({ success: false, error: { code: 'SOURCE_CHANGED', message: DRIFT_MESSAGE } }, 409));
      else {
        state.artifactCreated = true;
        await route.fulfill(json({ success: true, data: { doc, sections: [section], origin, warnings, reused: false } }, 201));
      }
    }
  } catch (error) {
    state.unexpected.push({ method: 'POST', path, reason: error.message });
    await route.fulfill(json({ success: false, error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: error.message } }, 422));
  }
  return true;
}
function read(path, url, state) {
  if (!state.artifactCreated) return null;
  if (path === '/api/authoring/docs' && url.searchParams.get('programId') === PROGRAM) return json({ success: true, documents: [...scopeDocs(PROGRAM), doc] });
  const fixed = new Map([
    [`/api/authoring/docs/${SAVED_DOC}`, { success: true, document: doc, access }],
    [`/api/authoring/docs/${SAVED_DOC}/sections`, { success: true, sections: [section], readScope: 'document',
      structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: [SAVED_SECTION] } }],
    [`/api/authoring/docs/${SAVED_DOC}/citations`, []],
    [`/api/authoring/documents/${SAVED_DOC}/comments`, { success: true, comments: [] }],
    [`/api/authoring/documents/${SAVED_DOC}/reviews`, { success: true, reviews: [] }],
    [`/api/authoring/docs/${SAVED_DOC}/audit`, { success: true, events: [] }],
    [`/api/realtime-collab/locks/${SAVED_DOC}`, { success: true, data: [] }],
    [`/api/authoring/sections/${SAVED_SECTION}/sources`, { success: true, sources: [] }],
    [`/api/authoring/sections/${SAVED_SECTION}/history`, { success: true, revisions: [] }],
    [`/api/authoring/guidance/${SAVED_SECTION}`, { success: true, guidance: [], template_guidance: [] }],
  ]);
  if (fixed.has(path)) return json(fixed.get(path));
  return path === '/api/data-origins/document' && url.searchParams.get('documentId') === SAVED_SECTION ? origins(section) : null;
}
export const artifactAdapter = { write, read };
