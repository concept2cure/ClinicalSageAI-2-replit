import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ read: vi.fn(), authorize: vi.fn(), connect: vi.fn(), warn: vi.fn() }));
vi.mock('../../qms/project-evidence', () => ({ readQualityProjectEvidence: h.read, authorizeQualityEvidenceSnapshot: h.authorize }));
vi.mock('../../../db', () => ({ pool: { connect: h.connect } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
import { createNativeRecordAdmission, syncQualityProjectSources } from '../record-source';
const record = { key: 'quality:qms_documents:9:working', title: 'SOP-9', text: 'SOP-9 draft. Not approved.', version: '2',
  sourceScope: 'project', native: { kind: 'qms_documents', id: '9', authoringDocumentId: '11111111-1111-4111-8111-111111111119' }, lifecycle: 'draft' };
const input = { organizationId: 7, userId: 11 };
const row = () => ({ id: 9, client_program_id: '11111111-1111-4111-8111-111111111111', is_current: true,
  checksum: createHash('sha256').update(record.text).digest('hex'), native_text: record.text,
  provenance: { origin: 'native_record_snapshot', recordSnapshot: { version: 1, renderer: 'quality-evidence:v1', workArea: 'quality',
    key: record.key, sourceScope: record.sourceScope, native: record.native, lifecycle: record.lifecycle } } });
const q = { query: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); h.read.mockResolvedValue([record]); h.authorize.mockResolvedValue(undefined); q.query.mockResolvedValue({ rows: [{ native_text: record.text }] }); });
describe('native source parent and freshness admission', () => {
  it('batches current native reads within one actor invocation through the canonical admitted collector', async () => {
    const admit = createNativeRecordAdmission(q, input);
    await admit(row()); await admit(row());
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(q.query).toHaveBeenCalledWith(expect.stringContaining('SELECT extracted_text AS native_text'), expect.arrayContaining([9, 7, row().client_program_id]));
    expect(h.read).toHaveBeenCalledWith(q, { ...input, programId: row().client_program_id });
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it('refuses stale native selections even before a catalogue refresh supersedes the capture', async () => {
    h.read.mockResolvedValue([{ ...record, text: 'SOP-9 retired.' }]);
    await expect(createNativeRecordAdmission(q, input)(row())).rejects.toMatchObject({ status: 409, code: 'NATIVE_SOURCE_CHANGED' });
  });
  it('refuses altered retained text even when the native record and recorded checksum still agree', async () => {
    q.query.mockResolvedValue({ rows: [{ native_text: 'Invented approval' }] });
    await expect(createNativeRecordAdmission(q, input)(row())).rejects.toMatchObject({ status: 409 });
  });
  it('does not turn failed verification into an empty successful source set', async () => {
    h.read.mockRejectedValue(new Error('database unavailable'));
    await expect(createNativeRecordAdmission(q, input)(row())).rejects.toMatchObject({ status: 503 });
  });
  it('retains historical text after change while requiring current exact-parent permission', async () => {
    h.read.mockResolvedValue([]);
    await expect(createNativeRecordAdmission(q, input)({ ...row(), is_current: false })).resolves.toBeUndefined();
    h.authorize.mockRejectedValue({ status: 403, code: 'QMS_DOCUMENT_VIEW_DENIED', message: 'Access denied' });
    await expect(createNativeRecordAdmission(q, input)({ ...row(), is_current: false })).rejects.toMatchObject({ status: 403 });
  });
});

/* Walked 2026-11-12 (w41): a project's sources read answered 503 once while its author was saving a Quality document,
   and the server log held nothing but the 503: the projection turned whatever went wrong into "could not be verified"
   and discarded it. The refusal is right (no partial catalogue); the cause is now logged, without the row's values. */
describe('the Quality projection says in the log why it was unavailable', () => {
  it('logs the cause of a failed projection with the project and the error code, and still answers 503', async () => {
    const deadlock = Object.assign(new Error('deadlock detected'), { code: '40P01', detail: 'Process 1 waits for ShareLock on transaction 2; values (secret)' });
    const client = { query: vi.fn(async (sql: string) => { if (/^BEGIN|^ROLLBACK/.test(sql)) return { rows: [] }; throw deadlock; }), release: vi.fn() };
    h.connect.mockResolvedValue(client);
    const program = '11111111-1111-4111-8111-111111111111';
    await expect(syncQualityProjectSources({ organizationId: 7, programId: program, userId: 11 }))
      .rejects.toMatchObject({ status: 503, code: 'QUALITY_SOURCE_PROJECTION_UNAVAILABLE' });
    expect(h.warn).toHaveBeenCalledTimes(1);
    const [message, context] = h.warn.mock.calls[0];
    expect(message).toMatch(/Quality source projection/);
    expect(context).toEqual({ organizationId: 7, programId: program, code: '40P01', error: 'deadlock detected' });
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain('secret');
    expect(client.release).toHaveBeenCalled();
  });
});

