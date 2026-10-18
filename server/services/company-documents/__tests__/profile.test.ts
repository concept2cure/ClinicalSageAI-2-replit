/** The profile composes canonical current membership, program admission, Vault
 * approval and the atomic settings writer. These doubles exercise that
 * composition without replacing the profile's validation or mutation logic. */
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '../../../../shared/company-documents';
const { structuredClone } = globalThis;

const mocks = vi.hoisted(() => ({
  query: vi.fn(), poolQuery: vi.fn(), requestClient: vi.fn(), actor: vi.fn(), scope: vi.fn(),
  access: vi.fn(), source: vi.fn(), verdict: vi.fn(), write: vi.fn(), scan: vi.fn(), registryRead: vi.fn(), registryIds: vi.fn(), registrySync: vi.fn(), retain: vi.fn(),
  defaultApproval: vi.fn(), copySources: vi.fn(),
}));
vi.mock('../../../db/runtime', () => ({ getPool: () => ({ query: mocks.poolQuery }) }));
vi.mock('../../../db/requestDb', () => ({ requestPgClient: mocks.requestClient }));
vi.mock('../../c2c/current-program-access', () => ({
  readCurrentProgramActor: mocks.actor, getCurrentAccessibleProgramScope: mocks.scope,
  requireCurrentProgramAccess: mocks.access,
  ProgramReadAccessError: class ProgramReadAccessError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: mocks.source, vaultVersionNotTransmittable: mocks.verdict }));
vi.mock('../../tenant/tenant-settings-writer', () => ({
  asSettings: (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : {},
  writeTenantSettings: mocks.write,
}));
vi.mock('../legal-registry', () => ({ readCompanyLegalRegistry: mocks.registryRead, readAccessibleCompanyLegalIds: mocks.registryIds, syncCompanyLegalRegistry: mocks.registrySync }));
vi.mock('../history', () => ({ retainCompanyPresentationRevision: mocks.retain }));
vi.mock('../designs', () => ({ validateApprovedCompanyDefault: mocks.defaultApproval }));
vi.mock('../company-copy-lineage', () => ({ readCompanyLegalCopySources: mocks.copySources }));
vi.mock('../../../middleware/uploadSafety', () => ({
  assertUploadSafe: mocks.scan,
  UploadSafetyError: class UploadSafetyError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));

import {
  archiveCompanyLegalDocument, companyProfileHash, companyLetterheadForPurpose, readCompanyDocumentProfile, readCompanyLegalDocument,
  registerCompanyLegalDocument, updateCompanyDocumentProfile, writeProfile,
} from '../profile';
import { ProgramReadAccessError } from '../../c2c/current-program-access';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PRIVATE_PROGRAM = '33333333-3333-4333-8333-333333333333';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const HASH = 'b'.repeat(64);
const q = { query: mocks.query };
const req = {
  user: { id: 3, organizationId: 7, role: 'admin' }, userId: 3, organizationId: 7,
  role: 'admin', userRole: 'admin', dbClient: q,
} as unknown as Request;
let settings: Record<string, unknown>;
let registry: CompanyLegalDocument[];

function initialProfile(): CompanyDocumentProfile {
  return {
    version: 1, revision: 4, companyName: 'Sponsor', address: 'Saved address', contact: 'Saved contact',
    registrationDetails: '', letterhead: structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null,
    applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [],
  };
}
function update(overrides: Record<string, unknown> = {}) {
  return {
    expectedRevision: 4, reason: 'Update company identity', companyName: 'Updated sponsor',
    address: 'New address', contact: 'New contact', registrationDetails: 'Company 42',
    letterhead: structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null,
    applyToReports: true, applyToSubmissionCorrespondence: true, ...overrides,
  };
}
function registration(overrides: Record<string, unknown> = {}) {
  return {
    expectedRevision: 4, reason: 'Register reviewed authorization', title: 'Authorization', kind: 'authorization',
    programId: PROGRAM, vaultDocumentId: DOCUMENT, agencies: ['FDA'], countries: ['US'],
    submissionTypes: ['IND'], language: 'en', effectiveOn: '2026-01-01', expiresOn: null, ...overrides,
  };
}
function entry(overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument {
  return {
    id: 'legal_original', title: 'Original legal document', kind: 'authorization', programId: PROGRAM,
    vaultDocumentId: DOCUMENT, contentHash: HASH, version: '2', agencies: [], countries: [], submissionTypes: [],
    language: 'en', effectiveOn: null, expiresOn: null, active: true,
    registeredAt: '2026-01-01T00:00:00.000Z', registeredBy: '2', ...overrides,
  };
}
function savedProfile(): CompanyDocumentProfile {
  return new Proxy(settings.companyDocuments as CompanyDocumentProfile, {
    get(target, key) { return key === 'legalDocuments' ? registry : Reflect.get(target, key); },
    set(target, key, value) { if (key === 'legalDocuments') registry = value; else Reflect.set(target, key, value); return true; },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  const { legalDocuments, ...presentation } = initialProfile();
  registry = legalDocuments;
  settings = { security: { mfaRequired: true }, unrelated: { preserved: 'yes' }, companyDocuments: presentation };
  mocks.registryRead.mockImplementation(async () => structuredClone(registry));
  mocks.registryIds.mockImplementation(async () => new Set(registry.filter(document => document.programId === PROGRAM).map(document => document.id)));
  mocks.registrySync.mockImplementation(async (_q, _org, _before, after) => { registry = structuredClone(after); });
  mocks.retain.mockResolvedValue(undefined);
  mocks.copySources.mockResolvedValue([]);
  mocks.defaultApproval.mockResolvedValue(undefined);
  mocks.requestClient.mockReturnValue(q);
  mocks.actor.mockResolvedValue({ userId: 3, role: 'admin' });
  mocks.scope.mockResolvedValue({ programIds: [PROGRAM], actor: { userId: 3, role: 'admin' } });
  mocks.access.mockResolvedValue({ programId: PROGRAM, projectId: 10, actor: { userId: 3, role: 'admin' } });
  mocks.source.mockResolvedValue({ id: DOCUMENT, programId: PROGRAM, contentHash: HASH, version: '2', current: true });
  mocks.verdict.mockResolvedValue(null);
  mocks.scan.mockResolvedValue(undefined);
  mocks.poolQuery.mockRejectedValue(new Error('The shared pool must not be used by request operations.'));
  mocks.query.mockImplementation(async (sql: string) => {
    if (/SELECT name, settings FROM organizations/.test(sql)) return { rows: [{ name: 'Organization name', settings: structuredClone(settings) }] };
    if (/SELECT mime_type FROM vault\.documents/.test(sql)) return { rows: [{ mime_type: 'application/pdf' }] };
    if (/SELECT manage_brand,manage_legal FROM company_document_grants/.test(sql)) return { rows: [] };
    throw new Error(`Unexpected profile query: ${sql}`);
  });
  mocks.write.mockImplementation(async (_req: Request, _organizationId: number, change: {
    next: (current: Record<string, unknown>, tier: string) => Promise<Record<string, unknown>>;
    beforeCommit: (q: unknown) => Promise<void>;
  }) => {
    const previous = structuredClone(registry);
    try {
      const next = await change.next(structuredClone(settings), 'standard');
      await change.beforeCommit(q);
      settings = structuredClone(next);
      return structuredClone(settings);
    } catch (error) { registry = previous; throw error; }
  });
});

describe('independently reviewed default branding policy', () => {
  it('refuses an unreviewed default edit before committing any company or legal changes', async () => {
    savedProfile().brandingApprovalRequired = true;
    savedProfile().approvedDefaultDesignId = '44444444-4444-4444-8444-444444444444';
    const before = structuredClone(settings);
    mocks.defaultApproval.mockRejectedValueOnce(new Error('The default differs from its independently reviewed presentation'));
    await expect(updateCompanyDocumentProfile(req, update())).rejects.toThrow('independently reviewed');
    expect(mocks.defaultApproval).toHaveBeenCalledWith(q, 7, expect.objectContaining({
      brandingApprovalRequired: true, approvedDefaultDesignId: '44444444-4444-4444-8444-444444444444', companyName: 'Updated sponsor',
    }));
    expect(settings).toEqual(before);
    expect(mocks.registrySync).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
  });
  it('allows flag changes only after the canonical current approval has been reverified', async () => {
    savedProfile().brandingApprovalRequired = true;
    savedProfile().approvedDefaultDesignId = '44444444-4444-4444-8444-444444444444';
    await writeProfile(req, 4, 'Enable reports using reviewed stationery', current => ({ ...current, applyToReports: true }), { capability: 'brand' });
    expect(mocks.defaultApproval).toHaveBeenCalledWith(q, 7, expect.objectContaining({ companyName: 'Sponsor', applyToReports: true }));
    expect(savedProfile()).toMatchObject({ brandingApprovalRequired: true, applyToReports: true, revision: 5 });
  });
  it('does not let an internal brand transform disable the owner approval policy', async () => {
    savedProfile().brandingApprovalRequired = true;
    const before = structuredClone(settings);
    await expect(writeProfile(req, 4, 'Attempt to disable independent branding review', current => ({ ...current,
      brandingApprovalRequired: false,
    }), { capability: 'brand' })).rejects.toMatchObject({ status: 403, code: 'COMPANY_POLICY_PERMISSION_REQUIRED' });
    expect(settings).toEqual(before);
    expect(mocks.registrySync).not.toHaveBeenCalled();
  });
  it('refuses forged approval and policy fields through the public profile input', async () => {
    await expect(updateCompanyDocumentProfile(req, update({ brandingApprovalRequired: false,
      approvedDefaultDesignId: '44444444-4444-4444-8444-444444444444',
    }))).rejects.toMatchObject({ status: 400, code: 'INVALID_COMPANY_DOCUMENTS' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

describe('current organization authority and atomic profile changes', () => {
  it('explicitly omits legal inventory without approval N+1 and preserves only admitted requirement references', async () => {
    registry = [entry(), entry({ id: 'legal_private', programId: PRIVATE_PROGRAM })];
    const requirement = { id: 'required', title: 'Authorization', source: 'customer' as const, regionalCode: null, kind: 'authorization' as const, agencies: [], countries: [], submissionTypes: [], language: null, sectionCode: null, applicability: 'required' as const, rationale: 'Reviewed customer need', legalDocumentIds: ['legal_original','legal_private'], reviewedBy: '3', reviewedAt: '2026-10-18' };
    savedProfile().legalRequirements = [requirement, { ...requirement, id: 'private', title: 'Private filing need', programId: PRIVATE_PROGRAM }];
    const result = await readCompanyDocumentProfile(req, false);
    expect(result.legalDocumentsIncluded).toBe(false);
    expect(result.data.legalDocuments).toEqual([]);
    expect(result.data.legalRequirements).toEqual([{ ...requirement, legalDocumentIds: ['legal_original'] }]);
    expect(mocks.registryRead).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.verdict).not.toHaveBeenCalled();
  });

  it('reads the saved submission correspondence preference on its supplied scoped connection', async () => {
    expect(await companyLetterheadForPurpose(7, 'submission', q)).toBeNull();
    savedProfile().applyToSubmissionCorrespondence = true;
    expect(await companyLetterheadForPurpose(7, 'submission', q)).toMatchObject({ companyName: 'Sponsor', revision: 4 });
    savedProfile().applyToSubmissionCorrespondence = false;
    expect(await companyLetterheadForPurpose(7, 'submission', q)).toBeNull();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
  it('refuses a current viewer despite stale admin claims on every request role field', async () => {
    mocks.actor.mockResolvedValue({ userId: 3, role: 'viewer' });
    await expect(updateCompanyDocumentProfile(req, update())).rejects.toMatchObject({ status: 403, code: 'COMPANY_PERMISSION_REQUIRED' });
    expect(mocks.actor).toHaveBeenCalledWith(q, { organizationId: 7, userId: 3 });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(savedProfile().revision).toBe(4);
  });

  it('propagates revoked membership before reading organization settings', async () => {
    mocks.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Membership was removed.'));
    await expect(readCompanyDocumentProfile(req)).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('returns reader capability from current membership, preserving authenticated tenant and connection', async () => {
    mocks.actor.mockResolvedValue({ userId: 3, role: 'viewer' });
    const result = await readCompanyDocumentProfile(req);
    expect(result.canManage).toBe(false);
    expect(result.data.companyName).toBe('Sponsor');
    expect(mocks.query).toHaveBeenCalledWith('SELECT name, settings FROM organizations WHERE id=$1', [7]);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('checks the revision against settings held by the writer and preserves all data on conflict', async () => {
    const before = structuredClone(settings);
    await expect(updateCompanyDocumentProfile(req, update({ expectedRevision: 3 }))).rejects.toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    expect(settings).toEqual(before);
  });

  it('writes through the canonical reasoned writer, increments the revision and preserves unrelated settings', async () => {
    savedProfile().legalDocuments = [entry()];
    const result = await updateCompanyDocumentProfile(req, update());
    expect(mocks.write).toHaveBeenCalledWith(req, 7, expect.objectContaining({
      action: 'tenant_settings_changed', reason: 'Update company identity', companyDocumentsDoor: true,
      next: expect.any(Function), sections: expect.any(Function),
    }));
    const change = mocks.write.mock.calls[0][2];
    expect(change.sections()).toEqual(['companyDocuments']);
    expect(result.data).toMatchObject({ revision: 5, companyName: 'Updated sponsor', address: 'New address' });
    expect(result.data.letterhead.brand.organizationName).toBe('Updated sponsor');
    expect(savedProfile().legalDocuments).toEqual([entry()]);
    expect(settings.companyDocuments).not.toHaveProperty('legalDocuments');
    expect(mocks.registrySync).toHaveBeenCalledWith(q, 7, [entry()], [entry()]);
    expect(settings.security).toEqual({ mfaRequired: true });
    expect(settings.unrelated).toEqual({ preserved: 'yes' });
  });

  it.each([
    { legalDocuments: [entry({ contentHash: 'f'.repeat(64) })] }, { organizationId: 999 }, { revision: 99 },
  ])('refuses protected fields injected into profile updates: %j', async extra => {
    await expect(updateCompanyDocumentProfile(req, update(extra))).rejects.toMatchObject({ status: 400, code: 'INVALID_COMPANY_DOCUMENTS' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

});

describe('company letterhead input validation', () => {
  it('refuses an oversized page-number format before persisting the letterhead', async () => {
    await expect(updateCompanyDocumentProfile(req, update({
      letterhead: { ...DEFAULT_TEMPLATE_SPEC, footer: { pageNumberFormat: 'P'.repeat(301) } },
    }))).rejects.toMatchObject({ status: 400, code: 'LETTERHEAD_TEXT_TOO_LONG' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    { mimeType: 'image/svg+xml', dataBase64: Buffer.from('<svg onload="alert(1)"/>').toString('base64') },
    { mimeType: 'image/png', dataBase64: '!!!not-base64!!!' },
    { mimeType: 'image/png', dataBase64: Buffer.from('GIF89a-not-a-png').toString('base64') },
    { mimeType: 'image/png', dataBase64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
  ])('refuses unsafe or oversized logo bytes before writing', async logo => {
    const letterhead = { ...structuredClone(DEFAULT_TEMPLATE_SPEC), brand: { logo: { ...logo, placement: 'header' } } };
    await expect(updateCompanyDocumentProfile(req, update({ letterhead }))).rejects.toMatchObject({ status: 400 });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('passes valid logo bytes through canonical upload safety before saving', async () => {
    const dataBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const letterhead = { ...structuredClone(DEFAULT_TEMPLATE_SPEC), brand: { logo: { mimeType: 'image/png', dataBase64, placement: 'header' } } };
    await updateCompanyDocumentProfile(req, update({ letterhead }));
    expect(mocks.scan).toHaveBeenCalledWith(Buffer.from(dataBase64, 'base64'), 'image/png', 'company-logo.png');
    expect(savedProfile().letterhead.brand.logo?.dataBase64).toBe(dataBase64);
  });

  it('preserves the old profile when canonical upload safety refuses otherwise valid logo bytes', async () => {
    const dataBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const letterhead = { ...structuredClone(DEFAULT_TEMPLATE_SPEC), brand: { logo: { mimeType: 'image/png', dataBase64, placement: 'header' } } };
    const refusal = new Error('Upload safety rejected this image');
    mocks.scan.mockRejectedValue(refusal);
    await expect(updateCompanyDocumentProfile(req, update({ letterhead }))).rejects.toBe(refusal);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(savedProfile().companyName).toBe('Sponsor');
  });
});

describe('canonical registry cutover composes atomic profile revisions', () => {
  it('has no settings-array retention ceiling and saves the new pointer only in the canonical registry', async () => {
    registry = Array.from({ length: 501 }, (_, index) => entry({ id: `legal_archived_${index}`, active: false }));
    const result = await registerCompanyLegalDocument(req, registration());
    expect(result.data.legalDocuments).toHaveLength(502);
    expect(registry).toHaveLength(502);
    expect(settings.companyDocuments).not.toHaveProperty('legalDocuments');
  });

  it('uses registry state read under the writer lock rather than an earlier unlocked profile', async () => {
    mocks.registryRead.mockResolvedValueOnce([]).mockResolvedValueOnce([entry()]);
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ code: 'ALREADY_REGISTERED' });
    expect(mocks.registrySync).not.toHaveBeenCalled();
    expect(savedProfile().revision).toBe(4);
  });

  it('rolls back the registry and profile revision when retained history refuses the mutation', async () => {
    mocks.retain.mockRejectedValue(new Error('Retained history unavailable'));
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toThrow('Retained history unavailable');
    expect(mocks.registrySync).toHaveBeenCalledOnce();
    expect(registry).toEqual([]);
    expect(savedProfile().revision).toBe(4);
  });

  it('refuses a lingering legacy array rather than serving it as a second canonical registry', async () => {
    (settings.companyDocuments as Record<string, unknown>).legalDocuments = [entry()];
    await expect(readCompanyDocumentProfile(req)).rejects.toMatchObject({ code: 'LEGAL_REGISTRY_MIGRATION_REQUIRED' });
  });

});

describe('legal document registry preserves canonical Vault identity', () => {
  it.each([
    { effectiveOn: '2026-02-30' }, { expiresOn: '2026-13-01' },
    { effectiveOn: '2026-10-17', expiresOn: '2026-10-16' },
  ])('refuses invalid or inverted effective/expiry dates %j', async overrides => {
    await expect(registerCompanyLegalDocument(req, registration(overrides))).rejects.toMatchObject({ status: 400, code: 'INVALID_COMPANY_DOCUMENTS' });
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('requires current program access before reading the source', async () => {
    mocks.access.mockRejectedValue(new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.'));
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(mocks.access).toHaveBeenCalledWith(q, { organizationId: 7, userId: 3, programId: PROGRAM });
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([null, { id: DOCUMENT, programId: PRIVATE_PROGRAM, contentHash: HASH, version: '2' }])('refuses a missing, foreign or wrong-program Vault source', async source => {
    mocks.source.mockResolvedValue(source);
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 404, code: 'VAULT_DOCUMENT_NOT_FOUND' });
    expect(mocks.source).toHaveBeenCalledWith(q, 7, DOCUMENT);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('refuses superseded Vault versions even when their original bytes are still present', async () => {
    mocks.source.mockResolvedValue({ id: DOCUMENT, programId: PROGRAM, contentHash: HASH, version: '2', current: false });
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 409, code: 'VAULT_VERSION_SUPERSEDED' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('registers a current draft as inventory while retaining the actual Vault refusal to transmit it', async () => {
    mocks.verdict.mockResolvedValue('This version is not currently approved');
    const result = await registerCompanyLegalDocument(req, registration());
    expect(result.data.legalDocuments[0]).toMatchObject({
      contentHash: HASH, version: '2', transmitRefusal: 'This version is not currently approved',
    });
    expect(mocks.verdict).toHaveBeenCalledWith(q, 7, DOCUMENT, HASH);
    expect(savedProfile().legalDocuments[0]).not.toHaveProperty('transmitRefusal');
  });

  it('requires original PDF bytes for submission placement', async () => {
    const original = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation((sql: string, params?: unknown[]) => /SELECT mime_type/.test(sql)
      ? Promise.resolve({ rows: [{ mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] }) : original(sql, params));
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 400, code: 'PDF_REQUIRED' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([{ contentHash: 'unverified' }, { version: '' }])('refuses missing immutable identity %j', async overrides => {
    mocks.source.mockResolvedValue({ id: DOCUMENT, programId: PROGRAM, contentHash: HASH, version: '2', current: true, ...overrides });
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 409, code: 'VAULT_VERSION_UNVERIFIED' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([{ contentHash: 'f'.repeat(64) }, { registeredBy: '999' }, { version: '999' }, { active: true }, { approved: true }, { sourceOriginal: { registryId: 'forged' } }])('rejects caller-supplied governance identity %j', async overrides => {
    await expect(registerCompanyLegalDocument(req, registration(overrides))).rejects.toMatchObject({ status: 400, code: 'INVALID_COMPANY_DOCUMENTS' });
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('derives version, digest and registrant from the verified source without rewriting original content', async () => {
    const result = await registerCompanyLegalDocument(req, registration({ agencies: ['FDA', 'FDA'] }));
    expect(result.data.revision).toBe(5);
    expect(result.data.legalDocuments).toHaveLength(1);
    expect(result.data.legalDocuments[0]).toMatchObject({
      id: expect.stringMatching(/^legal_/), registeredBy: '3', registeredAt: expect.any(String), active: true,
      vaultDocumentId: DOCUMENT, contentHash: HASH, version: '2', programId: PROGRAM, agencies: ['FDA'], transmitRefusal: null,
    });
    expect(mocks.query.mock.calls.every(([sql]) => /^SELECT /.test(sql))).toBe(true);
    expect(savedProfile().legalDocuments[0]).not.toHaveProperty('transmitRefusal');
  });

  it('refuses duplicate active registration without incrementing the revision', async () => {
    savedProfile().legalDocuments = [entry()];
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 409, code: 'ALREADY_REGISTERED' });
    expect(savedProfile().revision).toBe(4);
    expect(savedProfile().legalDocuments).toHaveLength(1);
  });

  it('filters inaccessible program entries before reading their Vault approval', async () => {
    savedProfile().legalDocuments = [entry(), entry({ id: 'legal_private', programId: PRIVATE_PROGRAM, vaultDocumentId: '44444444-4444-4444-8444-444444444444' })];
    const result = await readCompanyDocumentProfile(req);
    expect(result.data.legalDocuments.map(document => document.id)).toEqual(['legal_original']);
    expect(mocks.source).toHaveBeenCalledTimes(1);
    expect(mocks.source).toHaveBeenCalledWith(q, 7, DOCUMENT);
  });

  it('marks a source digest change as a read-time refusal while preserving the registered digest', async () => {
    savedProfile().legalDocuments = [entry()];
    mocks.source.mockResolvedValue({ id: DOCUMENT, programId: PROGRAM, contentHash: 'c'.repeat(64), version: '2' });
    const result = await readCompanyDocumentProfile(req);
    expect(result.data.legalDocuments[0]).toMatchObject({ contentHash: HASH, transmitRefusal: expect.stringContaining('no longer matches') });
    expect(mocks.verdict).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('archives metadata while retaining the exact original Vault version and digest', async () => {
    savedProfile().legalDocuments = [entry()];
    await archiveCompanyLegalDocument(req, 'legal_original', { expectedRevision: 4, reason: 'Superseded authorization' });
    expect(savedProfile().revision).toBe(5);
    expect(savedProfile().legalDocuments).toEqual([entry({ active: false })]);
    expect(mocks.access).toHaveBeenCalledWith(q, { organizationId: 7, userId: 3, programId: PROGRAM });
    expect(mocks.query.mock.calls.every(([sql]) => /^SELECT /.test(sql))).toBe(true);
  });
});

describe('legal registry authority and source races before commit', () => {
  it('keeps private copy ancestry out of public profile and document reads while preserving the canonical row', async () => {
    const sourceOriginal = { registryId: 'private_ancestor_registry', vaultDocumentId: PRIVATE_PROGRAM, programId: PRIVATE_PROGRAM, version: '9', contentHash: 'c'.repeat(64) };
    registry = [entry({ sourceOriginal })];
    const full = await readCompanyDocumentProfile(req);
    const single = await readCompanyLegalDocument(req, 'legal_original');
    expect(full.data.legalDocuments[0]).not.toHaveProperty('sourceOriginal');
    expect(single.document).not.toHaveProperty('sourceOriginal');
    expect(JSON.stringify(full)).not.toContain('private_ancestor_registry');
    expect(registry[0].sourceOriginal).toEqual(sourceOriginal);
  });

  it('derives copied-original identity only from canonical immutable ingest provenance', async () => {
    const sourceOriginal = { registryId: 'legal_source', vaultDocumentId: PRIVATE_PROGRAM, programId: PROGRAM, version: '1', contentHash: HASH };
    mocks.copySources.mockResolvedValue([sourceOriginal]);
    const result = await registerCompanyLegalDocument(req, registration());
    expect(result.data.legalDocuments[0]).not.toHaveProperty('sourceOriginal');
    expect(registry[0].sourceOriginal).toEqual(sourceOriginal);
    expect(mocks.copySources).toHaveBeenCalledTimes(2);
    expect(mocks.copySources).toHaveBeenLastCalledWith(q, { organizationId: 7, vaultDocumentId: DOCUMENT, contentHash: HASH });
  });

  it('rolls back copied registration if canonical original provenance changes before commit', async () => {
    const sourceOriginal = { registryId: 'legal_source', vaultDocumentId: PRIVATE_PROGRAM, programId: PROGRAM, version: '1', contentHash: HASH };
    mocks.copySources.mockResolvedValueOnce([sourceOriginal]).mockResolvedValueOnce([{ ...sourceOriginal, registryId: 'legal_other' }]);
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ code: 'COMPANY_LEGAL_COPY_SOURCE_UNVERIFIED' });
    expect(registry).toEqual([]);
    expect(savedProfile().revision).toBe(4);
    expect(mocks.verdict).not.toHaveBeenCalled();
  });

  it.each(['registration', 'archive'] as const)('rolls back %s if project access is revoked after initial admission', async operation => {
    if (operation === 'archive') registry = [entry()];
    const previous = structuredClone(registry);
    mocks.access.mockResolvedValueOnce({ programId: PROGRAM, projectId: 10 })
      .mockRejectedValueOnce(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Project access was revoked.'));
    const result = operation === 'registration' ? registerCompanyLegalDocument(req, registration())
      : archiveCompanyLegalDocument(req, 'legal_original', { expectedRevision: 4, reason: 'Archive superseded authorization' });
    await expect(result).rejects.toMatchObject({ status: 403, code: 'PROJECT_PERMISSION_DENIED' });
    expect(mocks.access).toHaveBeenLastCalledWith(q, { organizationId: 7, userId: 3, programId: PROGRAM, forShare: true });
    expect(registry).toEqual(previous);
    expect(savedProfile().revision).toBe(4);
  });

  it.each([null, { current: false }, { contentHash: 'f'.repeat(64) }, { version: '3' }, { programId: PRIVATE_PROGRAM }])('rolls back registration when the admitted Vault source changes before commit: %j', async change => {
    const original = { id: DOCUMENT, programId: PROGRAM, contentHash: HASH, version: '2', current: true };
    mocks.source.mockResolvedValueOnce(original).mockResolvedValueOnce(change === null ? null : { ...original, ...change });
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ status: 409, code: 'VAULT_VERSION_CHANGED' });
    expect(registry).toEqual([]);
    expect(savedProfile().revision).toBe(4);
    expect(mocks.verdict).not.toHaveBeenCalled();
  });

  it('rolls back when the source MIME type changes after the PDF was admitted', async () => {
    const original = mocks.query.getMockImplementation()!;
    let reads = 0;
    mocks.query.mockImplementation((sql: string, params?: unknown[]) => /SELECT mime_type/.test(sql)
      ? Promise.resolve({ rows: [{ mime_type: ++reads === 1 ? 'application/pdf' : 'application/msword' }] }) : original(sql, params));
    await expect(registerCompanyLegalDocument(req, registration())).rejects.toMatchObject({ code: 'VAULT_VERSION_CHANGED' });
    expect(registry).toEqual([]);
    expect(savedProfile().revision).toBe(4);
  });
});

describe('branding export provenance', () => {
  it('hashes deterministically and changes when the saved identity or letterhead revision changes', () => {
    const original = initialProfile();
    const digest = companyProfileHash(original);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(companyProfileHash(structuredClone(original))).toBe(digest);
    expect(companyProfileHash({ ...original, companyName: 'Changed sponsor' })).not.toBe(digest);
    expect(companyProfileHash({ ...original, revision: 5 })).not.toBe(digest);
    expect(companyProfileHash({ ...original, letterhead: { ...original.letterhead, header: { text: 'Changed header' } } })).not.toBe(digest);
  });
});
