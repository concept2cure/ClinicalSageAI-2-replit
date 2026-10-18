import { createHash } from 'node:crypto';
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import { stableStringify } from '../../../shared/canonical-json';
import type { RequestSqlClient } from '../../db/requestDb';
import { CompanyDocumentsError } from './validation';

const DEFAULT_VARIANT = '00000000-0000-0000-0000-000000000000';

/** Presentation only: historical library ACLs must never leak through a proof. */
export function companyPresentationSnapshot(profile: CompanyDocumentProfile): CompanyDocumentProfile {
  return {
    version: 1, revision: profile.revision, companyName: profile.companyName,
    address: profile.address, contact: profile.contact, registrationDetails: profile.registrationDetails,
    letterhead: profile.letterhead, importedFrom: profile.importedFrom,
    applyToReports: profile.applyToReports,
    applyToSubmissionCorrespondence: profile.applyToSubmissionCorrespondence,
    brandingAdopted: profile.brandingAdopted === true, legalDocuments: [],
    ...(profile.variantId ? { variantId: profile.variantId } : {}),
  };
}
function digest(profile: CompanyDocumentProfile) {
  return createHash('sha256').update(stableStringify(companyPresentationSnapshot(profile))).digest('hex');
}
export async function retainCompanyPresentationRevision(q: RequestSqlClient, organizationId: number,
  profile: CompanyDocumentProfile, userId: number, reason: string): Promise<void> {
  return retainPresentation(q, { organizationId, profile, userId, reason, variantId: DEFAULT_VARIANT });
}
export async function retainCompanyVariantPresentation(q: RequestSqlClient, input: {
  organizationId: number; profile: CompanyDocumentProfile; userId: number; reason: string; variantId: string;
}): Promise<void> {
  if (input.variantId === DEFAULT_VARIANT) throw new CompanyDocumentsError(400, 'VARIANT_REQUIRED', 'A named stationery variant is required.');
  return retainPresentation(q, { ...input, profile: { ...input.profile, variantId: input.variantId } });
}
async function retainPresentation(q: RequestSqlClient, input: {
  organizationId: number; profile: CompanyDocumentProfile; userId: number; reason: string; variantId: string;
}) {
  const { organizationId, profile, userId, reason, variantId } = input;
  await q.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE', [organizationId]);
  const snapshot = companyPresentationSnapshot(profile);
  const sha256 = digest(snapshot);
  await q.query(`INSERT INTO company_document_revisions
    (organization_id,revision,profile,sha256,created_by,reason,variant_id)
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT (organization_id,revision,variant_id) DO NOTHING`,
  [organizationId, profile.revision, JSON.stringify(snapshot), sha256, userId, reason, variantId]);
  const { rows } = await q.query('SELECT sha256 FROM company_document_revisions WHERE organization_id=$1 AND revision=$2 AND variant_id=$3', [organizationId, profile.revision, variantId]);
  if (rows.length !== 1 || rows[0].sha256 !== sha256) {
    throw new CompanyDocumentsError(409, 'COMPANY_REVISION_CHANGED', 'This company revision differs from its retained proof. Reload the profile before continuing.');
  }
}
export async function readCompanyPresentationRevision(q: RequestSqlClient, organizationId: number,
  revision: number, variantId = DEFAULT_VARIANT): Promise<CompanyDocumentProfile> {
  const { rows } = await q.query('SELECT profile,sha256 FROM company_document_revisions WHERE organization_id=$1 AND revision=$2 AND variant_id=$3', [organizationId, revision, variantId]);
  if (rows.length !== 1) throw new CompanyDocumentsError(404, 'COMPANY_REVISION_NOT_FOUND', 'The retained company presentation revision was not found.');
  const snapshot = rows[0].profile as CompanyDocumentProfile;
  if (snapshot.revision !== revision || (snapshot.variantId ?? DEFAULT_VARIANT) !== variantId || digest(snapshot) !== rows[0].sha256) {
    throw new CompanyDocumentsError(409, 'COMPANY_REVISION_UNVERIFIED', 'The retained company presentation proof does not match its checksum.');
  }
  return companyPresentationSnapshot(snapshot);
}
