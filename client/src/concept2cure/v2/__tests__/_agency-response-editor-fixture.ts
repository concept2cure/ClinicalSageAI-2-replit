/** Exact saved-editor preview used by the response approval UI regression. */
const EDITOR_DOC = '30000000-0000-4000-8000-000000000001';
const EDITOR_SECTION = '40000000-0000-4000-8000-000000000001';
export const EDITOR_VERSION = { documentId: EDITOR_DOC, sectionId: EDITOR_SECTION,
  expectedSha256: 'a'.repeat(64), expectedUpdatedAt: '2026-10-26T10:00:00.000Z' };
export function editorRead() {
  return { success: true, data: { programId: '20000000-0000-4000-8000-000000000001', currentRevision: 2,
    source: { kind: 'agency-response', eventId: 'ace_1', questionId: 7 }, copies: [{
      documentId: EDITOR_DOC, sectionId: EDITOR_SECTION, sha256: EDITOR_VERSION.expectedSha256,
      updatedAt: EDITOR_VERSION.expectedUpdatedAt, sourceRevision: 2, ready: true, refusal: null,
      text: 'Keep this exact response text.' }] } };
}
