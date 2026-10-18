import type { CompanyLegalDocument } from '../../../shared/company-documents';
import type { CompanyLegalEvidenceRef } from '../../../shared/company-legal-workflows';
import type { RequestSqlClient } from '../../db/requestDb';
import { requireCurrentProgramAccess } from '../c2c/current-program-access';
import { readVaultLifecycleSource, vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { CompanyDocumentsError } from './validation';

async function readEvidenceVersion(q: RequestSqlClient, organizationId: number, programId: string, vaultId: string): Promise<CompanyLegalEvidenceRef> {
  const source = await readVaultLifecycleSource(q, organizationId, vaultId);
  if (!source || source.programId !== programId || !source.current || !source.version || !/^[a-f0-9]{64}$/i.test(source.contentHash)) {
    throw new CompanyDocumentsError(409, 'LEGAL_EVIDENCE_UNAVAILABLE', 'Use a current, verified Vault evidence version in the same program as this legal document.');
  }
  const refusal = await vaultVersionNotTransmittable(q, organizationId, source.id, source.contentHash);
  if (refusal) throw new CompanyDocumentsError(409, 'LEGAL_EVIDENCE_UNAPPROVED', `The linked evidence must be reviewed and approved in the Vault. ${refusal}`);
  return { vaultDocumentId: source.id, programId: source.programId, version: source.version, contentHash: source.contentHash };
}
export async function resolveCompanyLegalEvidence(q: RequestSqlClient, actor: { organizationId: number; userId: number }, programId: string, vaultId: string): Promise<CompanyLegalEvidenceRef> {
  await requireCurrentProgramAccess(q, { ...actor, programId, forShare: true });
  return readEvidenceVersion(q, actor.organizationId, programId, vaultId);
}
function evidenceRefs(document: CompanyLegalDocument) {
  const workflow = document.workflow;
  return [...(workflow?.authority?.evidence ?? []), ...(workflow?.signatureEvidence ? [workflow.signatureEvidence.evidence] : []),
    ...(workflow?.certifiedTranslationEvidence ? [workflow.certifiedTranslationEvidence] : [])];
}
/** Canonical sequence gates already admit the tenant/filing; this never admits an HTTP user. */
export async function companyLegalStoredEvidenceRefusal(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<string | null> {
  for (const ref of evidenceRefs(document)) {
    const source = await readEvidenceVersion(q, organizationId, document.programId, ref.vaultDocumentId);
    if (ref.programId !== document.programId || ref.contentHash !== source.contentHash || ref.version !== source.version) return 'A supporting legal-review evidence version no longer matches the recorded hash and version.';
  }
  return null;
}
/** A stored review never substitutes for the evidence's current exact Vault identity. */
export async function companyLegalEvidenceRefusal(q: RequestSqlClient, actor: { organizationId: number; userId: number }, document: CompanyLegalDocument): Promise<string | null> {
  for (const ref of evidenceRefs(document)) {
    const source = await resolveCompanyLegalEvidence(q, actor, document.programId, ref.vaultDocumentId);
    if (ref.programId !== document.programId || ref.contentHash !== source.contentHash || ref.version !== source.version) return 'A supporting legal-review evidence version no longer matches the recorded hash and version.';
  }
  return null;
}
