import { describe, expect, it } from 'vitest';
import { readResponseEditor } from '../surfaces/agencyResponseEditorState';
const copy = { documentId: '30000000-0000-4000-8000-000000000001', sectionId: '40000000-0000-4000-8000-000000000001',
  sha256: 'a'.repeat(64), updatedAt: '2026-10-26T10:00:00.000Z', sourceRevision: 2, ready: true, refusal: null, text: 'Saved answer.' };
const data = { programId: '20000000-0000-4000-8000-000000000001', currentRevision: 2,
  source: { kind: 'agency-response', eventId: 'ace_1', questionId: 7 }, copies: [copy] };
const read = (value: unknown) => readResponseEditor(value, 'ace_1', 7);
describe('saved response preview boundary', () => {
  it('accepts the exact current question preview and an honestly stale copy', () => {
    expect(read({ success: true, data })).toEqual(data);
    const stale = { ...data, copies: [{ ...copy, sourceRevision: 1, ready: false, text: null, refusal: 'Preview the current source.' }] };
    expect(read({ success: true, data: stale })).toEqual(stale);
  });
  it.each([
    { ...data, programId: 'not-a-program' },
    { ...data, source: { ...data.source, eventId: 'ace_other' } },
    { ...data, source: { ...data.source, questionId: 8 } },
    { ...data, source: { ...data.source, kind: 'protocol' } },
    { ...data, currentRevision: 2.5 },
    { ...data, copies: [{ ...copy, documentId: 'another-document' }] },
    { ...data, copies: [{ ...copy, sha256: 'unknown' }] },
    { ...data, copies: [{ ...copy, updatedAt: 'not-a-timestamp' }] },
    { ...data, copies: [{ ...copy, sourceRevision: 1 }] },
    { ...data, copies: [{ ...copy, text: null }] },
    { ...data, copies: [{ ...copy, ready: false, refusal: 'Stale', text: 'Leaked stale preview' }] },
    { ...data, copies: [copy, copy] },
  ])('refuses an unverified or mismatched source preview %#', invalid => {
    expect(read({ success: true, data: invalid })).toBeNull();
  });
  it('does not turn an unsuccessful envelope into an authority to write', () => {
    expect(read({ success: false, data })).toBeNull();
  });
});
