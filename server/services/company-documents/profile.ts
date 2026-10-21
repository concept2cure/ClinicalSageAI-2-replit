import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Request } from 'express';
import { type CompanyDocumentProfile, type CompanyDocumentsResponse, type CompanyLegalDocument } from '../../../shared/company-documents';
import { normalizeTemplateSpec } from '../../../shared/templates/template-spec';
import { normalizeCompanyScopes } from '../../../shared/company-legal-workflows';
import { getPool } from '../../db/runtime';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { governedActorId } from '../../middleware/orgMembership';
import { UploadSafetyError } from '../../middleware/uploadSafety';
import { authedOrgId, usableOrgId } from '../../utils/authedOrgId';
import { readCurrentProgramActor, getCurrentAccessibleProgramScope, requireCurrentProgramAccess, ProgramReadAccessError } from '../c2c/current-program-access';
import { readVaultLifecycleSource, vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { asSettings, writeTenantSettings } from '../tenant/tenant-settings-writer';
import { archiveSchema, assertCompanyRevision, companyLogoBytes, CompanyDocumentsError, legalRegistrationSchema, parseCompanyInput, profileUpdateSchema, validateCompanyLetterhead } from './validation';
import { companyCapabilities, hasCompanyCapability, type CompanyCapability } from './capabilities';
import { retainCompanyPresentationRevision } from './history';
import { assertLegacyBrandingDecision } from './legacy-adoption';
import { readCompanyLegalRegistry, readAccessibleCompanyLegalIds, syncCompanyLegalRegistry } from './legal-registry';
import { companyDocumentsAuditDetails } from './provenance';
import { readCompanyLegalCopySources } from './company-copy-lineage';
import { publicCompanyLegalDocument } from './public-document';

export { CompanyDocumentsError, validateCompanyLetterhead, companyLogoBytes } from './validation';
export { companyProfileHash } from './provenance';

export function profileFromSettings(settings: unknown, organizationName = ''): CompanyDocumentProfile {
  const raw = asSettings(asSettings(settings).companyDocuments);
  if (Object.prototype.hasOwnProperty.call(raw, 'legalDocuments')) {
    throw new CompanyDocumentsError(409, 'LEGAL_REGISTRY_MIGRATION_REQUIRED', 'Company legal documents must be migrated to the canonical registry before this profile can be used.');
  }
  const letterhead = normalizeTemplateSpec(raw.letterhead);
  companyLogoBytes(letterhead.brand.logo);
  return {
    version: 1,
    revision: Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : 0,
    brandingApprovalRequired: raw.brandingApprovalRequired === true,
    approvedDefaultDesignId: typeof raw.approvedDefaultDesignId === 'string' ? raw.approvedDefaultDesignId : null,
    companyName: typeof raw.companyName === 'string' ? raw.companyName : organizationName,
    address: typeof raw.address === 'string' ? raw.address : '',
    contact: typeof raw.contact === 'string' ? raw.contact : '',
    registrationDetails: typeof raw.registrationDetails === 'string' ? raw.registrationDetails : '',
    letterhead,
    importedFrom: typeof raw.importedFrom === 'string' ? raw.importedFrom : null,
    applyToReports: raw.applyToReports === true,
    applyToSubmissionCorrespondence: raw.applyToSubmissionCorrespondence === true,
    legalDocuments: [],
    legalRequirements: Array.isArray(raw.legalRequirements) ? raw.legalRequirements as CompanyDocumentProfile['legalRequirements'] : [],
    brandingAdopted: raw.brandingAdopted === true || (raw.brandingAdopted === undefined && Number(raw.revision) > 0),
  };
}

/** Existing tenant scope is required by the pool; callers never manufacture one. */
export async function loadCompanyDocumentProfile(organizationId: number, q: RequestSqlClient = getPool(), includeLegal = true): Promise<CompanyDocumentProfile> {
  if (!usableOrgId(organizationId)) throw new CompanyDocumentsError(403, 'TENANT_REQUIRED', 'An authenticated organization is required.');
  const { rows } = await q.query('SELECT name, settings FROM organizations WHERE id=$1', [organizationId]);
  if (rows.length !== 1) throw new CompanyDocumentsError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  return { ...profileFromSettings(rows[0].settings, String(rows[0].name ?? '')),
    legalDocuments: includeLegal ? await readCompanyLegalRegistry(q, organizationId) : [] };
}

export async function companyLetterheadForPurpose(organizationId: number, purpose: 'report' | 'submission', q?: RequestSqlClient): Promise<CompanyDocumentProfile | null> {
  const profile = await loadCompanyDocumentProfile(organizationId, q, false);
  return (purpose === 'report' ? profile.applyToReports : profile.applyToSubmissionCorrespondence) ? profile : null;
}

export async function context(req: Request, manage: boolean | CompanyCapability = false, forShare = false) {
  const organizationId = usableOrgId(authedOrgId(req));
  const userId = governedActorId(req);
  if (!organizationId || !userId) throw new CompanyDocumentsError(403, 'AUTH_REQUIRED', 'An authenticated organization member is required.');
  const q = requestPgClient(req);
  const actor = await readCurrentProgramActor(q, { organizationId, userId, ...(forShare ? { forShare: true } : {}) });
  const canManage = ['owner', 'admin'].includes(actor.role);
  const capabilities = await companyCapabilities(q, organizationId, userId, actor.role, forShare);
  if (manage && !(typeof manage === 'string' ? hasCompanyCapability(capabilities, manage) : canManage)) {
    throw new CompanyDocumentsError(403, 'COMPANY_PERMISSION_REQUIRED', 'Your current company-document permissions do not allow this change.');
  }
  return { organizationId, userId, q, canManage, capabilities };
}

/** Re-read the current actor before accepting a Company settings upload. */
export async function requireCompanyDocumentManager(req: Request): Promise<void> {
  await context(req, 'brand');
}

export async function companyLegalSourceVerdict(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<string | null> {
  const source = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  if (!source || source.programId !== document.programId) return 'The recorded Vault version is no longer available.';
  if (source.contentHash !== document.contentHash || source.version !== document.version) return 'The Vault version no longer matches the registered original.';
  return vaultVersionNotTransmittable(q, organizationId, source.id, source.contentHash);
}

export async function readCompanyDocumentProfile(req: Request, includeLegal = true): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req);
  const data = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q, includeLegal);
  let accessible: Set<string> | undefined;
  if (!includeLegal || data.legalDocuments.length || data.legalRequirements?.some(requirement => requirement.programId)) {
    const scope = await getCurrentAccessibleProgramScope(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId });
    const admitted = new Set(scope.programIds);
    accessible = admitted;
    data.legalDocuments = await Promise.all(data.legalDocuments.filter(document => admitted.has(document.programId)).map(async document => ({
      ...document, transmitRefusal: await companyLegalSourceVerdict(ctx.q, ctx.organizationId, document),
    })));
  }
  const visibleIds = includeLegal ? new Set(data.legalDocuments.map(document => document.id))
    : await readAccessibleCompanyLegalIds(ctx.q, ctx.organizationId, [...accessible ?? []]);
  data.legalRequirements = (data.legalRequirements ?? []).filter(requirement => !requirement.programId || accessible?.has(requirement.programId)).map(requirement => ({ ...requirement,
    legalDocumentIds: requirement.legalDocumentIds.filter(id => visibleIds.has(id)),
  }));
  data.legalDocuments = data.legalDocuments.map(publicCompanyLegalDocument);
  return { data, canManage: ctx.canManage, capabilities: ctx.capabilities, legalDocumentsIncluded: includeLegal };
}

export async function readCompanyLegalDocument(req: Request, id: string) {
  const ctx = await context(req);
  const profile = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  const stored = profile.legalDocuments.find(document => document.id === id);
  if (!stored) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found.');
  await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: stored.programId });
  const document = publicCompanyLegalDocument({ ...stored, transmitRefusal: await companyLegalSourceVerdict(ctx.q, ctx.organizationId, stored) });
  return { ...ctx, profile, document };
}

export async function writeProfile(req: Request, expectedRevision: number, reason: string,
  transform: (profile: CompanyDocumentProfile) => CompanyDocumentProfile,
  options: { capability?: CompanyCapability; beforeCommit?: (q: RequestSqlClient, before: CompanyDocumentProfile, after: CompanyDocumentProfile) => Promise<void> } = {}): Promise<CompanyDocumentsResponse> {
  const { capability = 'legal', beforeCommit } = options;
  const ctx = await context(req, capability);
  const initial = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  let before: CompanyDocumentProfile | undefined;
  let after: CompanyDocumentProfile | undefined;
  const stored = await writeTenantSettings(req, ctx.organizationId, {
    action: 'tenant_settings_changed', reason, companyDocumentsDoor: true,
    sections: () => ['companyDocuments'],
    async next(current) {
      before = { ...profileFromSettings(current, initial.companyName), legalDocuments: await readCompanyLegalRegistry(ctx.q, ctx.organizationId) };
      assertCompanyRevision(before, expectedRevision);
      after = { ...transform(globalThis.structuredClone(before)), revision: before.revision + 1 };
      const presentation: Partial<CompanyDocumentProfile> = { ...after };
      delete presentation.legalDocuments;
      return { ...current, companyDocuments: presentation };
    },
    companyDocumentsAudit() {
      if (!before || !after) throw new Error('Company registry transaction has no captured revision.');
      return companyDocumentsAuditDetails(before, after, initial.companyName);
    },
    async beforeCommit(q) {
      await context(req, capability, true);
      if (!before || !after) throw new Error('Company registry transaction has no captured revision.');
      if (Boolean(before.brandingApprovalRequired) !== Boolean(after.brandingApprovalRequired) && capability !== 'permissions') {
        throw new CompanyDocumentsError(403, 'COMPANY_POLICY_PERMISSION_REQUIRED', 'Only an owner or administrator can change the independent branding review policy.');
      }
      if (after.brandingApprovalRequired) {
        const { validateApprovedCompanyDefault } = await import('./designs');
        await validateApprovedCompanyDefault(q, ctx.organizationId, after);
      }
      await syncCompanyLegalRegistry(q, ctx.organizationId, before.legalDocuments, after.legalDocuments);
      await retainCompanyPresentationRevision(q, ctx.organizationId, before, ctx.userId, reason);
      await retainCompanyPresentationRevision(q, ctx.organizationId, after, ctx.userId, reason);
      if (beforeCommit) await beforeCommit(q, before, after);
    },
  });
  if (!stored) throw new CompanyDocumentsError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  return readCompanyDocumentProfile(req);
}

export async function updateCompanyDocumentProfile(req: Request, body: unknown): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req, 'brand');
  const input = parseCompanyInput(profileUpdateSchema, body);
  const letterhead = await validateCompanyLetterhead(input.letterhead);
  letterhead.brand.organizationName = input.companyName;
  const initial = await loadCompanyDocumentProfile(ctx.organizationId, ctx.q);
  await assertLegacyBrandingDecision(ctx.q, ctx.organizationId, initial, input.legacyDecision);
  return writeProfile(req, input.expectedRevision, input.reason, before => ({ ...before,
    companyName: input.companyName, address: input.address, contact: input.contact, registrationDetails: input.registrationDetails,
    letterhead, importedFrom: input.importedFrom, applyToReports: input.applyToReports,
    applyToSubmissionCorrespondence: input.applyToSubmissionCorrespondence,
    brandingAdopted: true,
  }), { capability: 'brand', beforeCommit: async (q, before) => { await assertLegacyBrandingDecision(q, ctx.organizationId, before, input.legacyDecision); } });
}

/** The source row stays read-locked until the registry transaction commits.
 * Registration records inventory, so an unchanged draft still needs no approval. */
async function requireRegistrationSourceUnchanged(q: RequestSqlClient, organizationId: number,
  document: CompanyLegalDocument): Promise<void> {
  const { rows } = await q.query(`SELECT mime_type FROM vault.documents
    WHERE id=$1::uuid AND program_id=$2::uuid AND organization_id=$3 AND deleted_at IS NULL FOR SHARE`,
  [document.vaultDocumentId, document.programId, organizationId]);
  const current = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  if (rows.length !== 1 || rows[0].mime_type !== 'application/pdf' || !current?.current ||
      current.id !== document.vaultDocumentId || current.programId !== document.programId ||
      current.contentHash !== document.contentHash || current.version !== document.version) {
    throw new CompanyDocumentsError(409, 'VAULT_VERSION_CHANGED', 'The Vault source changed during registration. Reload and register the exact current PDF version.');
  }
  const [sourceOriginal] = await readCompanyLegalCopySources(q, { organizationId, vaultDocumentId: document.vaultDocumentId, contentHash: document.contentHash });
  if (!isDeepStrictEqual(sourceOriginal, document.sourceOriginal)) {
    throw new CompanyDocumentsError(409, 'COMPANY_LEGAL_COPY_SOURCE_UNVERIFIED', 'The immutable copied-source provenance changed during registration. Reload and review the original before registering this copy.');
  }
}

export async function registerCompanyLegalDocument(req: Request, body: unknown): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req, 'legal');
  const input = parseCompanyInput(legalRegistrationSchema, body);
  let normalizedScopes: ReturnType<typeof normalizeCompanyScopes>;
  try { normalizedScopes = normalizeCompanyScopes(input); }
  catch (error) { throw new CompanyDocumentsError(400, 'LEGAL_SCOPE_UNKNOWN', error instanceof Error ? error.message : 'Select a recognized filing scope.'); }
  await requireCurrentProgramAccess(ctx.q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: input.programId });
  const source = await readVaultLifecycleSource(ctx.q, ctx.organizationId, input.vaultDocumentId);
  if (!source || source.programId !== input.programId) throw new CompanyDocumentsError(404, 'VAULT_DOCUMENT_NOT_FOUND', 'Vault document not found in this program.');
  const { rows } = await ctx.q.query('SELECT mime_type FROM vault.documents WHERE id=$1::uuid AND program_id=$2::uuid AND organization_id=$3 AND deleted_at IS NULL', [input.vaultDocumentId, input.programId, ctx.organizationId]);
  if (rows[0]?.mime_type !== 'application/pdf') throw new CompanyDocumentsError(400, 'PDF_REQUIRED', 'Register the original PDF; submission assembly preserves PDF bytes.');
  // Registration is an inventory decision, never an approval. A current draft
  // can be registered, reviewed through the Vault, and only then included.
  if (!source.current) throw new CompanyDocumentsError(409, 'VAULT_VERSION_SUPERSEDED', 'Register the current Vault version rather than a superseded one.');
  if (!source.version || !/^[a-f0-9]{64}$/i.test(source.contentHash)) throw new CompanyDocumentsError(409, 'VAULT_VERSION_UNVERIFIED', 'The Vault version and original content hash must be recorded.');
  const [sourceOriginal] = await readCompanyLegalCopySources(ctx.q, { organizationId: ctx.organizationId, vaultDocumentId: source.id, contentHash: source.contentHash });
  const document: CompanyLegalDocument = {
    id: `legal_${randomUUID()}`, title: input.title, kind: input.kind,
    programId: source.programId, vaultDocumentId: source.id, contentHash: source.contentHash, version: source.version,
    agencies: normalizedScopes.agencies, countries: normalizedScopes.countries, submissionTypes: normalizedScopes.submissionTypes,
    language: input.language, effectiveOn: input.effectiveOn, expiresOn: input.expiresOn,
    active: true, registeredAt: new Date().toISOString(), registeredBy: String(ctx.userId),
    ...(sourceOriginal ? { sourceOriginal } : {}),
  };
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    if (before.legalDocuments.some(entry => entry.active && entry.vaultDocumentId === document.vaultDocumentId)) throw new CompanyDocumentsError(409, 'ALREADY_REGISTERED', 'This exact Vault version is already registered.');
    return { ...before, legalDocuments: [...before.legalDocuments, document] };
  }, { beforeCommit: async q => {
    await requireCurrentProgramAccess(q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: document.programId, forShare: true });
    await requireRegistrationSourceUnchanged(q, ctx.organizationId, document);
  } });
}

export async function archiveCompanyLegalDocument(req: Request, id: string, body: unknown): Promise<CompanyDocumentsResponse> {
  const ctx = await context(req, 'legal');
  const input = parseCompanyInput(archiveSchema, body);
  await readCompanyLegalDocument(req, id);
  return writeProfile(req, input.expectedRevision, input.reason, before => {
    if (!before.legalDocuments.some(document => document.id === id)) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found.');
    return { ...before, legalDocuments: before.legalDocuments.map(document => document.id === id ? { ...document, active: false } : document) };
  }, { beforeCommit: async (q, before) => {
    const document = before.legalDocuments.find(entry => entry.id === id);
    if (!document) throw new CompanyDocumentsError(404, 'LEGAL_DOCUMENT_NOT_FOUND', 'Company document not found.');
    await requireCurrentProgramAccess(q, { organizationId: ctx.organizationId, userId: ctx.userId, programId: document.programId, forShare: true });
  } });
}

export function companyDocumentsFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof CompanyDocumentsError || error instanceof ProgramReadAccessError || error instanceof UploadSafetyError) return { status: error.status, code: error.code, message: error.message };
  return { status: 500, code: 'COMPANY_DOCUMENTS_UNAVAILABLE', message: 'Company documents could not be read or saved. Refresh to verify the current saved state.' };
}
