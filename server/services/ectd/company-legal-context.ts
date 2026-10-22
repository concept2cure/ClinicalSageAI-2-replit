import type { LegalDocumentContext } from '../../../shared/company-documents';
import { canonicalRegionOf, toAgency } from '../../../shared/regulatory/region-identity';
import type { RequestSqlClient } from '../../db/requestDb';

/** The sequence record names the destination; a requested export region never supplies it. */
export function companyLegalSubmissionContext(input: {
  programId?: string | null;
  region?: string | null;
  applicationType?: string | null;
}): LegalDocumentContext {
  const country = canonicalRegionOf(input.region);
  return { programId: input.programId ?? null, country: country ?? null,
    agency: country ? toAgency(country) ?? null : null, submissionType: input.applicationType ?? null };
}

/** Tenant-bound recorded target for background assemblers and release assessment. */
export async function readCompanyLegalSubmissionContext(q: RequestSqlClient, organizationId: number,
  sequenceId: number): Promise<LegalDocumentContext> {
  const result = await q.query(`SELECT s.program_id::text AS program_id,s.application_type,e.region
    FROM ectd_sequences e JOIN submissions s ON s.id=e.submission_id AND s.organization_id=e.organization_id
    WHERE e.id=$1 AND e.organization_id=$2 AND s.organization_id=$2
      AND e.deleted_at IS NULL AND s.deleted_at IS NULL`, [sequenceId, organizationId]);
  if (result.rows.length !== 1) throw new Error('The recorded submission destination could not be verified.');
  const row = result.rows[0];
  return companyLegalSubmissionContext({ programId: typeof row.program_id === 'string' ? row.program_id : null,
    applicationType: typeof row.application_type === 'string' ? row.application_type : null,
    region: typeof row.region === 'string' ? row.region : null });
}
