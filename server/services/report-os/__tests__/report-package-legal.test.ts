import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { stableStringify } from '../../../../shared/canonical-json';
import { buildReportLegalPackage } from '../report-package';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { signedPdfFixture } from '../../ectd/__tests__/support/signed-pdf-fixture';

const h = vi.hoisted(() => ({ read: vi.fn(), access: vi.fn(), source: vi.fn(), lifecycle: vi.fn(), refusal: vi.fn(), storage: vi.fn() }));
vi.mock('../../company-documents/profile', () => ({ readCompanyLegalDocument: h.read }));
vi.mock('../../c2c/current-program-access', () => ({ requireCurrentProgramAccess: h.access }));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: h.source, readVaultLifecycles: h.lifecycle, vaultVersionNotTransmittable: h.refusal }));
vi.mock('../../../routes/c2c/project-vault', () => ({ readVerifiedVaultBytes: h.storage }));

import { readReportPackageLegalOriginals, requireReportPackageLegalStillCurrent } from '../report-package-legal';

const q = { query: vi.fn() };
const req = {} as Request;
let bytes: Buffer;
let document: CompanyLegalDocument;
const approval = { canonicalId: 'canonical-legal', stage: 'approved', creatorId: 7, review: null,
  approval: { signatureRef: 'signature-8', signedAt: '2026-10-01T00:00:00Z', printedName: 'Independent approver', meaning: 'approval', signerId: 8 } };
const read = () => readReportPackageLegalOriginals(req, [document.id], 4, q, { exportedAt: '2026-10-18T00:00:00Z', existingBytes: 30 });

beforeEach(async () => {
  vi.clearAllMocks();
  bytes = await signedPdfFixture(true);
  document = { id: 'legal-1', title: 'Company signed authorization', kind: 'authorization',
    programId: '11111111-1111-4111-8111-111111111111', vaultDocumentId: '22222222-2222-4222-8222-222222222222',
    contentHash: createHash('sha256').update(bytes).digest('hex'), version: '1.0', agencies: ['FDA'], countries: ['US'],
    submissionTypes: ['ind'], language: 'en', effectiveOn: null, expiresOn: null, active: true,
    registeredAt: '2026-10-01T00:00:00Z', registeredBy: '7', transmitRefusal: null };
  h.read.mockImplementation(async () => ({ organizationId: 4, userId: 9, document }));
  h.access.mockResolvedValue(undefined);
  h.source.mockImplementation(async () => ({ id: document.vaultDocumentId, programId: document.programId,
    version: document.version, contentHash: document.contentHash, current: true }));
  h.refusal.mockResolvedValue(null);
  h.lifecycle.mockImplementation(async () => new Map([[document.vaultDocumentId, approval]]));
  q.query.mockResolvedValue({ rows: [{ mime_type: 'application/pdf', file_name: 'legal.pdf', file_size: bytes.length,
    storage_version_id: 'version-1', storage_provider: 's3', s3_key: null }] });
  h.storage.mockImplementation(async () => ({ ok: true, bytes }));
});
afterEach(() => vi.unstubAllEnvs());

describe('report legal-original admission and immutable inventory', () => {
  it('checks the actor’s current project access and records the exact original, registration and approval manifestation', async () => {
    const [original] = await read();
    expect(h.access).toHaveBeenCalledWith(q, { organizationId: 4, userId: 9, programId: document.programId, forShare: true });
    expect(original.bytes).toEqual(bytes);
    expect(original.inventory).toMatchObject({ registryId: document.id, sourceSha256: document.contentHash,
      shippedSha256: document.contentHash, embeddedSignature: 'present', language: 'en', agencies: ['FDA'], countries: ['US'],
      approval: { canonicalId: approval.canonicalId, manifestation: approval.approval }, cryptographicSignatureValidation: 'not-performed-by-this-export' });
    expect(original.inventory.registration).not.toHaveProperty('transmitRefusal');
    expect(h.refusal).toHaveBeenCalledWith(q, 4, document.vaultDocumentId, document.contentHash);
    await expect(requireReportPackageLegalStillCurrent(req, [original], 4, q)).resolves.toBeUndefined();
  });
  it('refuses inaccessible project before loading bytes', async () => {
    h.access.mockRejectedValue(new Error('Current project membership refused'));
    await expect(read()).rejects.toThrow(/membership refused/); expect(h.storage).not.toHaveBeenCalled();
  });
  it('refuses another organization before loading bytes', async () => {
    h.read.mockResolvedValue({ organizationId: 5, userId: 9, document });
    await expect(read()).rejects.toMatchObject({ status: 404 }); expect(h.storage).not.toHaveBeenCalled();
  });
  it.each([
    ['archived', { active: false }, /archived/],
    ['expired', { expiresOn: '2000-01-01' }, /expired/],
    ['not-effective', { effectiveOn: '2999-01-01' }, /not effective/],
    ['revoked', { workflow: { revokedAt: '2026-10-01T00:00:00Z' } }, /revoked/],
    ['approval-withdrawn', { transmitRefusal: 'Approval withdrawn' }, /withdrawn/],
  ] as const)('refuses %s selected metadata before storage', async (_label, patch, reason) => {
    document = { ...document, ...patch } as CompanyLegalDocument;
    await expect(read()).rejects.toThrow(reason); expect(h.storage).not.toHaveBeenCalled();
  });
  it('refuses a superseded or repointed exact Vault source', async () => {
    h.source.mockResolvedValue({ current: false });
    await expect(read()).rejects.toMatchObject({ code: 'REPORT_LEGAL_VERSION_CHANGED' }); expect(h.storage).not.toHaveBeenCalled();
  });
  it('rechecks canonical Vault approval independently of a cached library verdict', async () => {
    h.refusal.mockResolvedValue('The current Vault version is not approved');
    await expect(read()).rejects.toThrow(/not approved/); expect(h.storage).not.toHaveBeenCalled();
  });
  it('refuses an unretained approval record', async () => {
    h.lifecycle.mockResolvedValue(new Map());
    await expect(read()).rejects.toMatchObject({ code: 'REPORT_LEGAL_APPROVAL_UNVERIFIED' }); expect(h.storage).not.toHaveBeenCalled();
  });
  it('refuses lost objects and byte/hash drift', async () => {
    h.storage.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(read()).rejects.toMatchObject({ code: 'REPORT_LEGAL_ORIGINAL_UNREADABLE' });
    h.storage.mockResolvedValueOnce({ ok: true, bytes: Buffer.from('%PDF-changed') });
    await expect(read()).rejects.toMatchObject({ code: 'REPORT_LEGAL_ORIGINAL_CHANGED' });
  });
  it('fails closed on malformed embedded signatures rather than packaging an unverifiable original', async () => {
    bytes = Buffer.from('%PDF-1.7\n1 0 obj<</Type/Sig/ByteRange[0 4 8]/Contents<abcd>>>endobj\n%%EOF');
    document.contentHash = createHash('sha256').update(bytes).digest('hex');
    await expect(read()).rejects.toMatchObject({ code: 'REPORT_LEGAL_PDF_UNVERIFIED' });
  });
  it('refuses a size overflow before object storage is read', async () => {
    vi.stubEnv('GOVERNED_EXPORT_MAX_BYTES', '32');
    await expect(read()).rejects.toMatchObject({ status: 413 }); expect(h.storage).not.toHaveBeenCalled();
  });
  it('refuses metadata or approval evidence changed after the original was read', async () => {
    const originals = await read(); document = { ...document, title: 'Changed registration title' };
    await expect(requireReportPackageLegalStillCurrent(req, originals, 4, q)).rejects.toMatchObject({ code: 'REPORT_LEGAL_CONTEXT_CHANGED' });
  });
  it('refuses current project access withdrawn after rendering', async () => {
    const originals = await read(); h.access.mockRejectedValue(new Error('Access withdrawn'));
    await expect(requireReportPackageLegalStillCurrent(req, originals, 4, q)).rejects.toThrow('Access withdrawn');
  });
});


describe('report archive content and snapshot binding', () => {
  const archive = async () => buildReportLegalPackage({ exportId: 'export-id', exportedAt: '2026-10-18T00:00:00Z',
    bundleId: 'bundle-id', bundleName: 'Historical report packet', branding: { applied: false },
    reportPdf: Buffer.from('%PDF-report-fixture'), constituents: [], legalOriginals: await read() });
  it('binds full selected registration/approval metadata and member digests in canonical content evidence', async () => {
    const result = await archive(); const zip = await JSZip.loadAsync(result.bytes);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const { exportId, exportedAt, bundleId, bundleName, branding, reports, legalDocuments } = manifest;
    const hash = createHash('sha256').update(stableStringify({ exportId, exportedAt, bundleId, bundleName, branding, reports, legalDocuments })).digest('hex');
    expect(manifest.packageContentSha256).toBe(hash);
    expect(await zip.file(legalDocuments[0].path)!.async('nodebuffer')).toEqual(bytes);
    expect(legalDocuments[0].registration).toMatchObject({ registeredBy: '7', language: 'en', agencies: ['FDA'] });
    expect(legalDocuments[0].approval.manifestation).toEqual(approval.approval);
    expect(manifest.notice).toContain('no agency acceptance');
    expect(result.sha256).toBe(createHash('sha256').update(result.bytes).digest('hex'));
  });
  it('rejects an inconsistent immutable registration fingerprint', async () => {
    const originals = await read(); originals[0].inventory.registrationSha256 = 'f'.repeat(64);
    await expect(buildReportLegalPackage({ exportId: 'export-id', exportedAt: '2026-10-18T00:00:00Z', bundleId: 'bundle-id',
      bundleName: 'Reports', branding: { applied: false }, reportPdf: Buffer.from('%PDF-'), constituents: [], legalOriginals: originals }))
      .rejects.toMatchObject({ code: 'REPORT_LEGAL_ORIGINAL_CHANGED' });
  });
  it('counts proof metadata toward the governed uncompressed size limit', async () => {
    const originals = await read(); vi.stubEnv('GOVERNED_EXPORT_MAX_BYTES', String(bytes.length + 100));
    await expect(buildReportLegalPackage({ exportId: 'export-id', exportedAt: '2026-10-18T00:00:00Z', bundleId: 'bundle-id',
      bundleName: 'Reports', branding: { applied: false }, reportPdf: Buffer.from('%PDF-'), constituents: [], legalOriginals: originals }))
      .rejects.toMatchObject({ code: 'REPORT_PACKAGE_TOO_LARGE' });
  });
});
