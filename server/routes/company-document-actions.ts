/** Explicit reuse of original company legal files; approval never travels with a copy. */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireEditorAccess } from '../middleware/orgMembership';
import { requireRole } from '../middleware/auth';
import { governedReason } from './governed-reason';
import type { RequestSqlClient } from '../db/requestDb';
import { companyLegalDocumentRefusal, type CompanyLegalDocument } from '../../shared/company-documents';
import { canonicalRegionOf, toAgency } from '../../shared/regulatory/region-identity';
import { readCompanyLegalDocument, registerCompanyLegalDocument, loadCompanyDocumentProfile,
  companyDocumentsFailure, CompanyDocumentsError } from '../services/company-documents/profile';
import { requireCurrentProgramAccess } from '../services/c2c/current-program-access';
import { requireCurrentVaultProgramWrite } from '../services/vault/vault-write-authority';
import { readVaultLifecycleSource, vaultVersionNotTransmittable } from '../services/vault/vault-lifecycle';
import { readVerifiedVaultBytes } from './c2c/project-vault';
import { ingestVaultDocument, type VaultIngestResult } from '../services/vault/vault-ingest.service';
import { readSubmissionSequenceForRequest, requireSubmissionReadStillCurrent } from '../services/submission-service/submission-request-read';
import { upsertLeaf, SUBMISSION_ERROR_STATUS, SubmissionError } from '../services/submission-service/submission-service';

const router = Router();
const copySchema = z.object({ programId: z.string().uuid(), expectedRevision: z.number().int().min(0), reason: governedReason }).strict();
const placeSchema = z.object({ sequenceId: z.number().int().positive(), sectionCode: z.string().trim().min(1).max(64), reason: governedReason }).strict();

/** Dates are checked even when a library entry has unrestricted agency scope. */
function basicRefusal(document: Parameters<typeof companyLegalDocumentRefusal>[0]) {
  return companyLegalDocumentRefusal(document, {
    agency: document.agencies[0], country: document.countries[0], submissionType: document.submissionTypes[0],
  });
}

/** Read and verify the original once, before handing its exact bytes to ingest. */
async function originalLegalPdf(document: CompanyLegalDocument, organizationId: number, q: RequestSqlClient) {
  const sourceRows = await q.query(`SELECT file_name,mime_type,storage_version_id,storage_provider,s3_key
    FROM vault.documents WHERE id=$1::uuid AND organization_id=$2 AND program_id=$3::uuid AND deleted_at IS NULL`,
  [document.vaultDocumentId, organizationId, document.programId]);
  const source = sourceRows.rows[0];
  if (!source || source.mime_type !== 'application/pdf') throw new CompanyDocumentsError(404, 'PDF_NOT_FOUND', 'The original legal PDF could not be read.');
  const original = await readVerifiedVaultBytes({
    storageVersionId: source.storage_version_id as string | null, storageProvider: source.storage_provider as string | null,
    storageKey: source.s3_key as string | null, organizationId,
  }, document.contentHash, document.vaultDocumentId);
  if (!original.ok) throw new CompanyDocumentsError(original.status, original.error, original.message ?? 'The original legal file could not be verified.');
  if (original.bytes.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(original.bytes).digest('hex') !== document.contentHash) {
    throw new CompanyDocumentsError(409, 'LEGAL_FILE_CHANGED', 'The original legal PDF no longer matches its registered bytes.');
  }
  return { bytes: original.bytes, fileName: String(source.file_name || 'company-legal-document.pdf') };
}

/** A copy can commit even if its separate library registration is refused. */
async function registerCopiedDocument(req: Request, source: CompanyLegalDocument,
  target: Extract<VaultIngestResult, { ok: true }>['document'], expectedRevision: number, reason: string) {
  try {
    const library = await registerCompanyLegalDocument(req, { expectedRevision, reason,
      title: source.title, kind: source.kind, programId: target.programId, vaultDocumentId: target.id,
      agencies: source.agencies, countries: source.countries, submissionTypes: source.submissionTypes,
      language: source.language, effectiveOn: source.effectiveOn, expiresOn: source.expiresOn });
    return { document: target, library, reviewRequired: true,
      message: 'The original bytes were copied and registered. Review and approve this program’s copy in the Vault before filing it.' };
  } catch {
    return { document: target, registered: false, reviewRequired: true,
      message: 'The original bytes were copied into the Vault, but library registration was not confirmed. Review and register the new version there before filing.' };
  }
}
router.post('/legal-documents/:id/copy-to-program', requireEditorAccess, async (req, res) => {
  const parsed = copySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_COPY', message: parsed.error.issues[0]?.message });
  try {
    const { document, profile, organizationId, userId, q, canManage } = await readCompanyLegalDocument(req, String(req.params.id));
    if (!canManage) throw new CompanyDocumentsError(403, 'ADMIN_REQUIRED', 'An administrator must register a company legal copy.');
    if (profile.revision !== parsed.data.expectedRevision) throw new CompanyDocumentsError(409, 'COMPANY_DOCUMENTS_CONFLICT', 'The company library changed. Reload it before copying.');
    const refusal = basicRefusal(document);
    if (refusal) throw new CompanyDocumentsError(409, 'LEGAL_DOCUMENT_NOT_USABLE', refusal);
    if (document.programId === parsed.data.programId) throw new CompanyDocumentsError(409, 'ALREADY_IN_PROGRAM', 'This version is already in the target program.');
    await requireCurrentVaultProgramWrite(q, { organizationId, userId, programId: parsed.data.programId });
    const original = await originalLegalPdf(document, organizationId, q);
    const outcome = await ingestVaultDocument({ organizationId, userId, programId: parsed.data.programId,
      documentCode: `COMPANY-${document.vaultDocumentId.slice(0, 8)}-${document.contentHash.slice(0, 12)}`,
      documentTitle: document.title, documentType: 'OTHER', fileBuffer: original.bytes,
      fileName: original.fileName, mimeType: 'application/pdf',
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
      companyLegalSource: { registryId: document.id, vaultDocumentId: document.vaultDocumentId, contentHash: document.contentHash, reason: parsed.data.reason },
      assertSourceAccess: async (client) => {
        await requireCurrentProgramAccess(client, { organizationId, userId, programId: document.programId, forShare: true });
        const currentProfile = await loadCompanyDocumentProfile(organizationId, client);
        const registered = currentProfile.legalDocuments.find(item => item.id === document.id && item.active);
        if (!registered || registered.contentHash !== document.contentHash) throw new CompanyDocumentsError(409, 'LEGAL_SOURCE_CHANGED', 'The source library entry changed before copying.');
        const current = await readVaultLifecycleSource(client, organizationId, document.vaultDocumentId);
        const verdict = current && current.current && current.contentHash === document.contentHash
          ? await vaultVersionNotTransmittable(client, organizationId, document.vaultDocumentId, document.contentHash) : 'The source version changed.';
        if (verdict || basicRefusal({ ...registered, transmitRefusal: verdict })) throw new CompanyDocumentsError(409, 'LEGAL_SOURCE_CHANGED', verdict ?? 'The source legal document is no longer usable.');
      },
    });
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.code, message: outcome.message });
    return res.status(201).json(await registerCopiedDocument(req, document, outcome.document, profile.revision, parsed.data.reason));
  } catch (error) {
    const failure = companyDocumentsFailure(error);
    return res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
});

router.post('/legal-documents/:id/place', requireRole('regulatory-author'), async (req, res) => {
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_PLACEMENT', message: parsed.error.issues[0]?.message });
  try {
    const { document, organizationId, userId, q } = await readCompanyLegalDocument(req, String(req.params.id));
    const target = await readSubmissionSequenceForRequest(q, { organizationId, userId }, parsed.data.sequenceId);
    const country = canonicalRegionOf(target.sequenceRegion);
    if (!country) throw new CompanyDocumentsError(422, 'MARKET_UNKNOWN', 'The filing market must be identified before selecting company legal documents.');
    const refusal = companyLegalDocumentRefusal(document, { programId: target.programId, agency: toAgency(country), country, submissionType: target.applicationType });
    if (refusal) throw new CompanyDocumentsError(409, 'LEGAL_DOCUMENT_NOT_APPLICABLE', refusal);
    await requireSubmissionReadStillCurrent(q, target);
    const leaf = await upsertLeaf({ sequenceId: target.sequenceId, sectionCode: parsed.data.sectionCode, title: document.title,
      lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: document.vaultDocumentId, reason: parsed.data.reason }, { organizationId, userId });
    return res.json(leaf);
  } catch (error) {
    if (error instanceof SubmissionError) {
      return res.status(SUBMISSION_ERROR_STATUS[error.code]).json({ error: error.code, message: error.message });
    }
    const failure = companyDocumentsFailure(error);
    return res.status(failure.status).json({ error: failure.code, message: failure.message });
  }
});

export default router;
