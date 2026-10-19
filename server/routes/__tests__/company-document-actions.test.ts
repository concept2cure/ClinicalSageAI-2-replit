import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { CompanyDocumentsError } from '../../services/company-documents/validation';

const m = vi.hoisted(() => ({ read: vi.fn(), register: vi.fn(), load: vi.fn(), access: vi.fn(), write: vi.fn(),
  bytes: vi.fn(), ingest: vi.fn(), source: vi.fn(), verdict: vi.fn(), sequence: vi.fn(), recheck: vi.fn(), leaf: vi.fn(), q: { query: vi.fn() } }));
vi.mock('../../middleware/orgMembership', () => ({ requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../middleware/auth', () => ({ requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../services/company-documents/profile', async () => {
  const { CompanyDocumentsError } = await import('../../services/company-documents/validation');
  return { CompanyDocumentsError, readCompanyLegalDocument: m.read, registerCompanyLegalDocument: m.register,
    loadCompanyDocumentProfile: m.load, companyDocumentsFailure: (error: any) => ({ status: error.status ?? 500, code: error.code ?? 'FAILED', message: error.message }) };
});
vi.mock('../../services/c2c/current-program-access', () => ({ requireCurrentProgramAccess: m.access }));
vi.mock('../../services/vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: m.write }));
vi.mock('../../services/vault/vault-lifecycle', () => ({ readVaultLifecycleSource: m.source, vaultVersionNotTransmittable: m.verdict }));
vi.mock('../c2c/project-vault', () => ({ readVerifiedVaultBytes: m.bytes }));
vi.mock('../../services/vault/vault-ingest.service', () => ({ ingestVaultDocument: m.ingest }));
vi.mock('../../services/submission-service/submission-request-read', () => ({ readSubmissionSequenceForRequest: m.sequence, requireSubmissionReadStillCurrent: m.recheck }));
vi.mock('../../services/submission-service/submission-service', () => {
  class SubmissionError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  }
  return { SubmissionError, upsertLeaf: m.leaf, SUBMISSION_ERROR_STATUS: { INVALID_STATE: 409 } };
});
import { SubmissionError } from '../../services/submission-service/submission-service';
import actions from '../company-document-actions';

const original = Buffer.from('%PDF-1.7\noriginal signed company legal bytes');
const hash = createHash('sha256').update(original).digest('hex');
const sourceProgram = '11111111-1111-4111-8111-111111111111';
const targetProgram = '22222222-2222-4222-8222-222222222222';
const sourceVersion = '33333333-3333-4333-8333-333333333333';
const document = { id: 'legal-one', title: 'Authorization', kind: 'authorization', programId: sourceProgram,
  vaultDocumentId: sourceVersion, contentHash: hash, version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'],
  language: 'en', effectiveOn: null, expiresOn: '2999-01-01', active: true, transmitRefusal: null };
const profile = { revision: 7, legalDocuments: [document] };
const app = express().use(express.json()).use('/company', actions);

beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue({ document: { ...document }, profile, organizationId: 41, userId: 9, q: m.q, canManage: true });
  m.q.query.mockResolvedValue({ rows: [{ file_name: 'authorization.pdf', mime_type: 'application/pdf', storage_version_id: 'stored-original', storage_provider: 'local', s3_key: null }] });
  m.bytes.mockResolvedValue({ ok: true, bytes: original });
  m.ingest.mockResolvedValue({ ok: true, document: { id: '44444444-4444-4444-8444-444444444444', programId: targetProgram, contentHash: hash } });
  m.register.mockResolvedValue({ data: { ...profile, revision: 8 }, canManage: true });
  m.load.mockResolvedValue(profile);
  m.source.mockResolvedValue({ current: true, contentHash: hash });
  m.verdict.mockResolvedValue(null);
  m.sequence.mockResolvedValue({ sequenceId: 4, programId: sourceProgram, applicationType: 'ind', sequenceRegion: 'fda' });
  m.leaf.mockResolvedValue({ id: 17, sectionCode: 'm1.4.1', title: document.title, auditTrail: { persisted: true } });
});

describe('company legal controlled copies', () => {
  const body = { programId: targetProgram, expectedRevision: 7, reason: 'Reuse for the new clinical program' };
  it('passes identical verified bytes to canonical ingest and retains scopes and expiry without transferring approval', async () => {
    const response = await request(app).post('/company/legal-documents/legal-one/copy-to-program').send(body);
    expect(response.status).toBe(201);
    expect(response.body.reviewRequired).toBe(true);
    expect(m.ingest.mock.calls[0][0].fileBuffer).toEqual(original);
    expect(m.ingest.mock.calls[0][0].companyLegalSource).toEqual(expect.objectContaining({ registryId: document.id, vaultDocumentId: sourceVersion, contentHash: hash, reason: body.reason }));
    expect(m.register).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: targetProgram,
      vaultDocumentId: '44444444-4444-4444-8444-444444444444', expiresOn: document.expiresOn, agencies: ['FDA'] }));
  });
  it.each([
    [{ canManage: false }, 403], [{ profile: { ...profile, revision: 8 } }, 409],
    [{ document: { ...document, expiresOn: '2000-01-01' } }, 409],
    [{ document: { ...document, transmitRefusal: 'not reviewed' } }, 409],
  ])('refuses unauthorized, stale, expired or unapproved source before ingest', async (patch, status) => {
    m.read.mockResolvedValue({ document, profile, organizationId: 41, userId: 9, q: m.q, canManage: true, ...patch });
    expect((await request(app).post('/company/legal-documents/legal-one/copy-to-program').send(body)).status).toBe(status);
    expect(m.ingest).not.toHaveBeenCalled();
  });
  it('refuses a source whose stored bytes do not match its registered hash', async () => {
    m.bytes.mockResolvedValue({ ok: true, bytes: Buffer.from('%PDF-altered') });
    expect((await request(app).post('/company/legal-documents/legal-one/copy-to-program').send(body)).status).toBe(409);
    expect(m.ingest).not.toHaveBeenCalled();
  });
  it('reports a committed Vault copy honestly if library registration subsequently fails', async () => {
    m.register.mockRejectedValue(new Error('audit unavailable'));
    const response = await request(app).post('/company/legal-documents/legal-one/copy-to-program').send(body);
    expect(response.status).toBe(201);
    expect(response.body.registered).toBe(false);
    expect(response.body.reviewRequired).toBe(true);
    expect(response.body.document.id).toBeTruthy();
  });
  it('rechecks source access and approval inside canonical ingest before commit', async () => {
    m.ingest.mockImplementationOnce(async args => {
      m.verdict.mockResolvedValue('superseded');
      await args.assertSourceAccess(m.q, 'commit');
      throw new Error('unreachable');
    });
    expect((await request(app).post('/company/legal-documents/legal-one/copy-to-program').send(body)).status).toBe(409);
    expect(m.register).not.toHaveBeenCalled();
  });
});

describe('company legal placement', () => {
  const body = { sequenceId: 4, sectionCode: 'm1.4.1', reason: 'Include the current signed authorization' };
  it('uses the admitted sequence and immutable original Vault pointer', async () => {
    const response = await request(app).post('/company/legal-documents/legal-one/place').send(body);
    expect(response.status).toBe(200);
    expect(m.leaf).toHaveBeenCalledWith(expect.objectContaining({ documentTable: 'vault_documents', documentUuid: sourceVersion, sequenceId: 4 }), { organizationId: 41, userId: 9 });
    expect(m.recheck).toHaveBeenCalled();
  });
  it.each([
    [{ sequenceRegion: 'ema' }, /agency/], [{ programId: targetProgram }, /Copy/], [{ applicationType: 'nda' }, /submission type/],
  ])('rejects the actual target when the registered legal scope does not match', async (patch, reason) => {
    m.sequence.mockResolvedValue({ sequenceId: 4, programId: sourceProgram, applicationType: 'ind', sequenceRegion: 'fda', ...patch });
    const response = await request(app).post('/company/legal-documents/legal-one/place').send(body);
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(reason as RegExp);
    expect(m.leaf).not.toHaveBeenCalled();
  });
  it('does not accept client-supplied tenant or approval overrides', async () => {
    const response = await request(app).post('/company/legal-documents/legal-one/place').send({ ...body, organizationId: 999, approved: true });
    expect(response.status).toBe(400);
    expect(m.leaf).not.toHaveBeenCalled();
  });
  it('does not place a source whose access cannot be verified', async () => {
    m.read.mockRejectedValue(new CompanyDocumentsError(403, 'FORBIDDEN', 'Source project is private.'));
    expect((await request(app).post('/company/legal-documents/legal-one/place').send(body)).status).toBe(403);
    expect(m.leaf).not.toHaveBeenCalled();
  });
  it('retains the actionable canonical placement refusal when the sequence becomes locked', async () => {
    m.leaf.mockRejectedValueOnce(new SubmissionError('INVALID_STATE', 'Sequence is frozen; its leaves are immutable.'));
    const response = await request(app).post('/company/legal-documents/legal-one/place').send(body);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'INVALID_STATE', message: 'Sequence is frozen; its leaves are immutable.' });
  });
});
