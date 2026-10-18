import type { Request } from 'express';
import type { CompanyLegalDocument } from '../../../shared/company-documents';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { readCompanyLegalDocument } from '../company-documents/profile';
import { requireCurrentProgramAccess } from '../c2c/current-program-access';
import { readVaultLifecycleSource, readVaultLifecycles, vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { readVerifiedVaultBytes } from '../../routes/c2c/project-vault';
import { vaultBinaryAvailableSql } from '../document-data-disposition/eligibility';
import type { RequestSqlClient } from '../../db/requestDb';
import { assessOriginalPdfIntegrity } from '../ectd/original-pdf-integrity';
import { ReportPackageError, reportLegalRefusal, requireReportPackageSize, type ReportLegalInventoryEntry, type ReportLegalOriginal } from './report-package';

const digest = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');
function notAvailable(): never { throw new ReportPackageError(404, 'REPORT_LEGAL_DOCUMENT_NOT_FOUND', 'A selected legal document is not available. Nothing was exported.'); }

async function currentLegalSource(req: Request, registryId: string, organizationId: number, client: RequestSqlClient) {
  const admitted = await readCompanyLegalDocument(req, registryId);
  if (admitted.organizationId !== organizationId) return notAvailable();
  const { document, userId } = admitted;
  await requireCurrentProgramAccess(client, { organizationId, userId, programId: document.programId, forShare: true });
  const refusal = reportLegalRefusal(document);
  if (refusal) throw new ReportPackageError(409, 'REPORT_LEGAL_DOCUMENT_NOT_USABLE', `${refusal} Nothing was exported.`);
  const source = await readVaultLifecycleSource(client, organizationId, document.vaultDocumentId);
  if (!source || !source.current || source.programId !== document.programId || source.version !== document.version || source.contentHash !== document.contentHash) {
    throw new ReportPackageError(409, 'REPORT_LEGAL_VERSION_CHANGED', 'A selected legal version no longer matches its registered original. Nothing was exported.');
  }
  const transmitRefusal = await vaultVersionNotTransmittable(client, organizationId, document.vaultDocumentId, document.contentHash);
  if (transmitRefusal) throw new ReportPackageError(409, 'REPORT_LEGAL_DOCUMENT_NOT_USABLE', `${transmitRefusal} Nothing was exported.`);
  const lifecycle = (await readVaultLifecycles(client, organizationId, [document.vaultDocumentId])).get(document.vaultDocumentId);
  if (!lifecycle) throw new ReportPackageError(409, 'REPORT_LEGAL_APPROVAL_UNVERIFIED', 'The selected legal version’s approval record could not be retained. Nothing was exported.');
  const registration: CompanyLegalDocument = { ...document };
  delete registration.transmitRefusal;
  return { document, registration, lifecycle, fingerprint: digest({ registration, lifecycle }) };
}

export async function readReportPackageLegalOriginals(req: Request, ids: string[], organizationId: number,
  client: RequestSqlClient, options: { exportedAt: string; existingBytes: number }): Promise<ReportLegalOriginal[]> {
  const { exportedAt, existingBytes } = options;
  const originals: ReportLegalOriginal[] = [];
  let total = existingBytes;
  for (const [index, id] of ids.entries()) {
    const { document, registration, lifecycle, fingerprint } = await currentLegalSource(req, id, organizationId, client);
    const { rows } = await client.query(`SELECT d.file_name,d.file_size,d.mime_type,d.storage_version_id,d.storage_provider,d.s3_key
      FROM vault.documents d WHERE d.id=$1::uuid AND d.organization_id=$2 AND d.program_id=$3::uuid
        AND d.deleted_at IS NULL AND ${vaultBinaryAvailableSql('d')} FOR SHARE`, [document.vaultDocumentId, organizationId, document.programId]);
    const source = rows[0];
    if (rows.length !== 1 || source.mime_type !== 'application/pdf') return notAvailable();
    const claimedSize = Number(source.file_size);
    if (Number.isSafeInteger(claimedSize) && claimedSize > 0) requireReportPackageSize(total + claimedSize);
    const result = await readVerifiedVaultBytes({ storageVersionId: source.storage_version_id as string | null,
      storageProvider: source.storage_provider as string | null, storageKey: source.s3_key as string | null, organizationId }, document.contentHash, document.vaultDocumentId);
    if (!result.ok) throw new ReportPackageError(result.status, 'REPORT_LEGAL_ORIGINAL_UNREADABLE', 'The selected legal original could not be verified in its recorded store. Nothing was exported.');
    if (result.bytes.subarray(0, 5).toString('latin1') !== '%PDF-' || createHash('sha256').update(result.bytes).digest('hex') !== document.contentHash) {
      throw new ReportPackageError(409, 'REPORT_LEGAL_ORIGINAL_CHANGED', 'A selected original does not match its registered PDF bytes. Nothing was exported.');
    }
    total += result.bytes.length;
    requireReportPackageSize(total);
    const signed = await originalSigned(result.bytes);
    const inventory: ReportLegalInventoryEntry = { registryId: document.id, title: document.title, kind: document.kind,
      programId: document.programId, vaultDocumentId: document.vaultDocumentId, version: document.version,
      sourceSha256: document.contentHash, shippedSha256: document.contentHash, path: `legal/${index + 1}-${document.vaultDocumentId}.pdf`,
      byteLength: result.bytes.length, agencies: document.agencies, countries: document.countries, submissionTypes: document.submissionTypes,
      language: document.language, effectiveOn: document.effectiveOn, expiresOn: document.expiresOn,
      approval: { verdict: 'current-approved-exact-version', checkedAt: exportedAt, canonicalId: lifecycle.canonicalId, stage: lifecycle.stage,
        signatureRef: lifecycle.approval?.signatureRef ?? null, signedAt: lifecycle.approval?.signedAt ?? null, manifestation: lifecycle.approval },
      cryptographicSignatureValidation: 'not-performed-by-this-export', embeddedSignature: signed ? 'present' : 'absent',
      registration, registrationSha256: digest(registration) };
    originals.push({ document, inventory, bytes: result.bytes, fingerprint });
  }
  return originals;
}

export async function requireReportPackageLegalStillCurrent(req: Request, originals: ReportLegalOriginal[], organizationId: number, client: RequestSqlClient) {
  for (const original of originals) {
    const current = await currentLegalSource(req, original.document.id, organizationId, client);
    if (current.fingerprint !== original.fingerprint) throw new ReportPackageError(409, 'REPORT_LEGAL_CONTEXT_CHANGED', 'A selected legal version, approval or registration changed during export. Refresh before retrying. Nothing was exported.');
  }
}

async function originalSigned(bytes: Buffer): Promise<boolean> {
  try { return (await assessOriginalPdfIntegrity(bytes)).signed; }
  catch (error) { throw new ReportPackageError(422, 'REPORT_LEGAL_PDF_UNVERIFIED', error instanceof Error ? error.message : 'The selected PDF structure could not be verified. Nothing was exported.'); }
}
