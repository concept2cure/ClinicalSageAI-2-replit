import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ read: vi.fn(), authorize: vi.fn() }));
vi.mock('../../qms/project-evidence', () => ({ readQualityProjectEvidence: h.read, authorizeQualityEvidenceSnapshot: h.authorize }));
vi.mock('../../../db', () => ({ pool: {} }));
import { createNativeRecordAdmission } from '../record-source';
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
