import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { type CompanyDocumentProfile, type CompanyDocumentsResponse, type CompanyLegalDocument } from '../../../shared/company-documents';
import { normalizeTemplateSpec } from '../../../shared/templates/template-spec';
import { getPool } from '../../db/runtime';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { governedActorId } from '../../middleware/orgMembership';
import { UploadSafetyError } from '../../middleware/uploadSafety';
import { authedOrgId, usableOrgId } from '../../utils/authedOrgId';
import { readCurrentProgramActor, getCurrentAccessibleProgramScope, requireCurrentProgramAccess, ProgramReadAccessError } from '../c2c/current-program-access';
import { readVaultLifecycleSource, vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { asSettings, writeTenantSettings } from '../tenant/tenant-settings-writer';
import { archiveSchema, assertCompanyRevision, companyLogoBytes, CompanyDocumentsError, legalRegistrationSchema, parseCompanyInput, profileUpdateSchema, validateCompanyLetterhead } from './validation';

export { CompanyDocumentsError, validateCompanyLetterhead, companyLogoBytes } from './validation';
export { companyProfileHash } from './provenance';

function profileFromSettings(settings: unknown, organizationName = ''): CompanyDocumentProfile {
  const raw = asSettings(asSettings(settings).companyDocuments);
  const letterhead = normalizeTemplateSpec(raw.letterhead);
  companyLogoBytes(letterhead.brand.logo);
  return {
    version: 1,
    revision: Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
    companyName: typeof raw.companyName === 'string' ? raw.companyName : organizationName,
    address: typeof raw.address === 'string' ? raw.address : '',
    contact: typeof raw.contact === 'string' ? raw.contact : '',
    registrationDetails: typeof raw.registrationDetails === 'string' ? raw.registrationDetails : '',
    letterhead,
    importedFrom: typeof raw.importedFrom === 'string' ? raw.importedFrom : null,
    applyToReports: raw.applyToReports === true,
    applyToSubmissionCorrespondence: raw.applyToSubmissionCorrespondence === true,
    legalDocuments: Array.isArray(raw.legalDocuments) ? raw.legalDocuments as CompanyLegalDocument[] : [],
  };
}

/** Existing tenant scope is required by the pool; callers never manufacture one. */
export async function loadCompanyDocumentProfile(organizationId: number, q: RequestSqlClient = getPool()): Promise<CompanyDocumentProfile> {
  if (!usableOrgId(organizationId)) throw new CompanyDocumentsError(403, 'TENANT_REQUIRED', 'An authenticated organization is required.');
  const { rows } = await q.query('SELECT name, settings FROM organizations WHERE id=$1', [organizationId]);
  if (rows.length !== 1) throw new CompanyDocumentsError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  return profileFromSettings(rows[0].settings, String(rows[0].name ?? ''));
}

export async function companyLetterheadForPurpose(organizationId: number, purpose: 'report' | 'submission', q?: RequestSqlClient): Promise<CompanyDocumentProfile | null> {
  const profile = await loadCompanyDocumentProfile(organizationId, q);
  return (purpose === 'report' ? profile.applyToReports : profile.applyToSubmissionCorrespondence) ? profile : null;
}

async function context(req: Request, manage = false) {
  const organizationId = usableOrgId(authedOrgId(req));
  const userId = governedActorId(req);
  if (!organizationId || !userId) throw new CompanyDocumentsError(403, 'AUTH_REQUIRED', 'An authenticated organization member is required.');
  const q = requestPgClient(req);
  const actor = await readCurrentProgramActor(q, { organizationId, userId });
  const canManage = ['owner', 'admin'].includes(actor.role);
  if (manage && !canManage) throw new CompanyDocumentsError(403, 'ADMIN_REQUIRED', 'An organization owner or administrator must make this change.');
  return { organizationId, userId, q, canManage };
}

async function sourceVerdict(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<string | null> {
  const source = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  if (!source || source.programId !== document.programId) return 'The recorded Vault version is no longer available.';
  if (source.contentHash !== document.contentHash || source.version !== document.version) return 'The Vault version no longer matches the registered original.';
  return vaultVersionNotTransmittable(q, organizationId, source.id, source.contentHash);
}

export async function readCompanyDocumentProfile(req: Request): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req);
  const data = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  if (data.legalDocuments.length) {
    const scope = await getCurrentAccessibleProgramScope(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId });
    const accessible = new Set(scope.programIds);
    data.legalDocuments = await Promise.all(data.legalDocuments.filter(document => accessible.has(document.programId)).map(async document => ({
      ...document, transmitRefusal: await sourceVerdict(ctx.q, ctx.organizationId, document),
    })));
  }
  return { data, canManage: ctx.canManage };
}

export async function readCompanyLegalDocument(req: Request, id: string) {
  const ctx = await context(req);
  const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  const stored = profile.legalDocuments.find(document => document.id === id);
  if (!stored) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found.');
  await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: stored.programId });
  const document = { ...stored, transmitRefusal: await sourceVerdict(ctx.q, ctx.organizationId, stored) };
  return { ...ctx, profile, document };
}

async function writeProfile(req: Request, expectedRevision: number, reason: string,
  transform: (profile: CompanyDocumentProfile) => CompanyDocumentProfile): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req, true);
  const initial = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  const stored = await writeTenantSettings(req, ctx.organizationId, {
    action: 'tenant_settings_changed', reason, companyDocumentsDoor: true,
    sections: () => ['companyDocuments'],
    next(current) {
      const before = profileFromSettings(current, initial.companyName);
      assertCompanyRevision(before, expectedRevision);
      const after = transform(before);
      return { ...current, companyDocuments: { ...after, revision: before.revision + 1 } };
    },
  });
  if (!stored) throw new CompanyDocumentsError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  return readCompanyDocumentProfile(req);
}

export async function updateCompanyDocumentProfile(req: Request, body: unknown): Promise<CompanyDocumentsResponse> {
  await context(req, true);
  const input = parseCompanyInput(profileUpdateSchema, body);
  const letterhead = await validateCompanyLetterhead(input.letterhead);
  letterhead.brand.organizationName = input.companyName;
  return writeProfile(req, input.expectedRevision, input.reason, before => ({ ...before,
    companyName: input.companyName, address: input.address, contact: input.contact, registrationDetails: input.registrationDetails,
    letterhead, importedFrom: input.importedFrom, applyToReports: input.applyToReports,
    applyToSubmissionCorrespondence: input.applyToSubmissionCorrespondence,
  }));
}

export async function registerCompanyLegalDocument(req: Request, body: unknown): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req, true);
  const input = parseCompanyInput(legalRegistrationSchema, body);
  await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: input.programId });
  const source = await readVaultLifecycleSource(ctx.q, ctx.organizationId, input.vaultDocumentId);
  if (!source || source.programId !== input.programId) throw new CompanyDocumentsError(404, 'VAULT_DOCUMENT_NOT_FOUND', 'Vault document not found in this program.');
  const { rows } = await ctx.q.query('SELECT mime_type FROM vault.documents WHERE id=$1::uuid AND program_id=$2::uuid AND organization_id=$3 AND deleted_at IS NULL', [input.vaultDocumentId, input.programId, ctx.organizationId]);
  if (rows[0]?.mime_type !== 'application/pdf') throw new CompanyDocumentsError(400, 'PDF_REQUIRED', 'Register the original PDF; submission assembly preserves PDF bytes.');
  // Registration is an inventory decision, never an approval. A current draft
  // can be registered, reviewed through the Vault, and only then included.
  if (!source.current) throw new CompanyDocumentsError(409, 'VAULT_VERSION_SUPERSEDED', 'Register the current Vault version rather than a superseded one.');
  if (!source.version || !/^[a-f0-9]{64}$/i.test(source.contentHash)) throw new CompanyDocumentsError(409, 'VAULT_VERSION_UNVERIFIED', 'The Vault version and original content hash must be recorded.');
  const document: CompanyLegalDocument = {
    id: `legal_${randomUUID()}`, title: input.title, kind: input.kind,
    programId: source.programId, vaultDocumentId: source.id, contentHash: source.contentHash, version: source.version,
    agencies: [...new Set(input.agencies)], countries: [...new Set(input.countries)], submissionTypes: [...new Set(input.submissionTypes)],
    language: input.language, effectiveOn: input.effectiveOn, expiresOn: input.expiresOn,
    active: true, registeredAt: new Date().toISOString(), registeredBy: String(ctx.userId),
  };
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    if (before.legalDocuments.some(entry => entry.active && entry.vaultDocumentId === document.vaultDocumentId)) throw new CompanyDocumentsError(409, 'ALREADY_REGISTERED', 'This exact Vault version is already registered.');
    if (before.legalDocuments.length >= 500) throw new CompanyDocumentsError(409, 'LIBRARY_LIMIT', 'The company library has reached its 500-entry retention limit, including archived entries. Contact support before adding more documents.');
    return { ...before, legalDocuments: [...before.legalDocuments, document] };
  });
}

export async function archiveCompanyLegalDocument(req: Request, id: string, body: unknown): Promise<CompanyDocumentsResponse> {
  await context(req, true);
  const input = parseCompanyInput(archiveSchema, body);
  await readCompanyLegalDocument(req, id);
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    if (!before.legalDocuments.some(document => document.id === id)) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found.');
    return { ...before, legalDocuments: before.legalDocuments.map(document => document.id === id ? { ...document, active: false } : document) };
  });
}

export function companyDocumentsFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof CompanyDocumentsError || error instanceof ProgramReadAccessError || error instanceof UploadSafetyError) return { status: error.status, code: error.code, message: error.message };
  return { status: 500, code: 'COMPANY_DOCUMENTS_UNAVAILABLE', message: 'Company documents could not be read or saved. Refresh to verify the current saved state.' };
}
