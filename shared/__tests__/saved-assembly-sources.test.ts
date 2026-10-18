import { describe, expect, it } from 'vitest';
import { readSavedAssemblySources } from '../authoring/saved-assembly-sources';

const PROGRAM = '10000000-0000-4000-8000-000000000001';
const DOC = '20000000-0000-4000-8000-000000000002';
const EVENT = '30000000-0000-4000-8000-000000000003';
const OTHER_PROGRAM = '40000000-0000-4000-8000-000000000004';
function receipt() {
  return { version: 1, docId: DOC, programId: PROGRAM, record: {
    eventId: EVENT, recordedAt: '2026-10-18T00:00:00.000Z',
    manifest: { version: 1, programId: PROGRAM, fingerprint: 'a'.repeat(64), entries: [{
      source: { kind: 'data-room', sourceId: 41, expectedChecksum: 'b'.repeat(64) },
      title: 'Retained source', contentHash: 'b'.repeat(64), extractedTextSha256: 'c'.repeat(64),
      version: '1.0', originalFileAvailable: false, disposition: 'keep_data',
      span: { start: 0, end: 10, totalChars: 20, sha256: 'd'.repeat(64) },
    }], limitations: ['Recorded reference intent; verify scientific support separately.'] },
  } };
}

describe('saved assembly reference response boundary', () => {
  it('copies the text-free receipt without preserving extra source or audit content', () => {
    const raw = { ...receipt(), sourceChunks: ['PRIVATE EXCERPT'], auditText: 'PRIVATE AUDIT' };
    const decoded = readSavedAssemblySources(raw);
    expect(decoded).toEqual(receipt());
    expect(JSON.stringify(decoded)).not.toContain('PRIVATE');
    if (!decoded?.record) throw new Error('Expected verified response shape');
    decoded.record.manifest.entries[0].title = 'Local display edit';
    decoded.record.manifest.entries[0].span.start = 2;
    decoded.record.manifest.limitations.push('Local note');
    expect(raw.record.manifest).toEqual(receipt().record.manifest);
  });

  it('distinguishes an explicit empty record from missing or failed data', () => {
    expect(readSavedAssemblySources({ version: 1, docId: DOC, programId: PROGRAM, record: null }))
      .toEqual({ version: 1, docId: DOC, programId: PROGRAM, record: null });
    expect(readSavedAssemblySources({ version: 1, docId: DOC, programId: PROGRAM })).toBeNull();
    expect(readSavedAssemblySources({ success: false, data: null })).toBeNull();
    expect(readSavedAssemblySources({ ...receipt(), record: undefined })).toBeNull();
  });

  it.each([
    { name: 'unsupported version', value: { ...receipt(), version: 2 } },
    { name: 'missing document', value: { ...receipt(), docId: null } },
    { name: 'non-UUID project', value: { ...receipt(), programId: 'project-one' } },
    { name: 'array body', value: [receipt()] },
    { name: 'string body', value: JSON.stringify(receipt()) },
    { name: 'invalid event', value: { ...receipt(), record: { ...receipt().record, eventId: 41 } } },
  ])('refuses $name without treating it as empty history', ({ value }) => {
    expect(readSavedAssemblySources(value)).toBeNull();
  });

  it.each([
    { name: 'invalid time', value: 'not a timestamp' },
    { name: 'local date', value: '2026-10-18' },
    { name: 'normalized invalid day', value: '2026-02-30T00:00:00.000Z' },
    { name: 'ambiguous timezone', value: '2026-10-18T00:00:00' },
    { name: 'coerced time', value: 42 },
  ])('refuses $name in the saved event', ({ value }) => {
    expect(readSavedAssemblySources({ ...receipt(), record: { ...receipt().record, recordedAt: value } })).toBeNull();
  });

  it('refuses a valid manifest for a different response project', () => {
    const raw = receipt();
    raw.record.manifest.programId = OTHER_PROGRAM;
    expect(readSavedAssemblySources(raw)).toBeNull();
  });

  it('refuses malformed saved excerpts instead of dropping a source', () => {
    const raw = receipt();
    raw.record.manifest.entries[0].span.end = 8001;
    raw.record.manifest.entries[0].span.totalChars = 9000;
    expect(readSavedAssemblySources(raw)).toBeNull();
  });
});
