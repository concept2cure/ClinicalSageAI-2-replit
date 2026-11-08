import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnADraft, checkAnAAccept } from './qualify-ana-editor.mjs';
const sectionId = '11111111-2222-4333-8444-555555555555';
const docId = '11111111-2222-4333-8444-666666666666';
const candidateId = '11111111-2222-4333-8444-777777777777';
const content = 'The trial disposition and efficacy denominators must be reconciled to the source tables before this Clinical Study Report section can be approved.';
const valid = { success: true, source: 'model', draft: {
  content, draftId: candidateId, metadata: {
    model: 'anthropic-approved-model-after-pq', provider: 'anthropic',
    retrievalStatus: 'ok', sourcesRetrieved: 3,
  }, turnRecord: { status: 'recorded', id: 'turn-123' },
} };
test('a real source-grounded AnA draft must have model, candidate, and audit turn', () => {
  assert.equal(checkAnADraft(valid).draftId, candidateId);
  assert.equal(checkAnADraft(valid).sourceCount, 3);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft,
    draftId: '11111111-2222-4333-777777777777' } }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, source: 'template' }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft, draftId: undefined } }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft,
    metadata: { ...valid.draft.metadata, model: 'demo-mode' } } }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft,
    metadata: { ...valid.draft.metadata, retrievalStatus: 'failed' } } }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft,
    metadata: { ...valid.draft.metadata, sourcesRetrieved: 0 } } }), /did not produce/);
  assert.throws(() => checkAnADraft({ ...valid, draft: { ...valid.draft,
    turnRecord: { status: 'not_recorded' } } }), /did not produce/);
});
test('AnA governed accept must reopen exact document, section and human-accepted content', () => {
  const saved = { success: true, section: { id: sectionId, doc_id: docId, content },
    attribution: { sourceSpans: 3 } };
  const reread = { success: true, readScope: 'document',
    sections: [{ id: sectionId, doc_id: docId, content }] };
  const verdict = checkAnAAccept(saved, reread, docId, sectionId, content);
  assert.equal(verdict.saved, true);
  assert.equal(verdict.attributedSourceSpans, 3);
  assert.throws(() => checkAnAAccept({ ...saved, section: { ...saved.section,
    content: 'some other text' } }, reread, docId, sectionId, content), /did not return/);
  assert.throws(() => checkAnAAccept(saved, { ...reread, readScope: 'sections' },
    docId, sectionId, content), /could not reread/);
  assert.throws(() => checkAnAAccept(saved, { ...reread, sections: [] },
    docId, sectionId, content), /did not reopen identically/);
  assert.throws(() => checkAnAAccept(saved, { ...reread, sections: [{
    ...reread.sections[0], doc_id: '11111111-2222-4333-8444-999999999999',
  }] }, docId, sectionId, content), /did not reopen identically/);
});
