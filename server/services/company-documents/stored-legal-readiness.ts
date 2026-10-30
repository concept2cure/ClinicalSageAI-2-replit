/** Saved company legal requirements bind the existing canonical release paths. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { CompanyLegalDocument } from '../../../shared/company-documents';
import { companyScopeMatches, type CompanyLegalReadinessResponse, type CompanyLegalRequirement } from '../../../shared/company-legal-workflows';
import { canonicalRegionOf, toAgency } from '../../../shared/regulatory/region-identity';
import { readVaultLifecycleSource, vaultVersionNotTransmittable } from '../vault/vault-lifecycle';
import { CompanyDocumentsError } from './validation';
import { companyLegalStoredEvidenceRefusal } from './legal-evidence';
import { assessCompanyLegalReadiness } from './legal-readiness';
import { readCompanyLegalRegistry } from './legal-registry';
import { asSettings } from '../tenant/tenant-settings-writer';

async function recordedTarget(q: RequestSqlClient, organizationId: number, sequenceId: number): Promise<CompanyLegalReadinessResponse['target']> {
  const { rows } = await q.query(`SELECT s.id AS submission_id,s.program_id::text AS program_id,s.application_type,e.region
    FROM ectd_sequences e JOIN submissions s ON s.id=e.submission_id AND s.organization_id=e.organization_id
    WHERE e.id=$1 AND e.organization_id=$2 AND s.organization_id=$2 AND e.deleted_at IS NULL AND s.deleted_at IS NULL`, [sequenceId, organizationId]);
  const row = rows[0];
  const country = canonicalRegionOf(typeof row?.region === 'string' ? row.region : null);
  if (rows.length !== 1 || !country || typeof row.program_id !== 'string' || typeof row.application_type !== 'string') {
    throw new CompanyDocumentsError(409, 'LEGAL_REQUIREMENT_TARGET_UNVERIFIED', 'The saved legal requirements cannot be evaluated until the sequence’s recorded market, project and filing type are verified.');
  }
  return { programId: row.program_id, submissionId: Number(row.submission_id), sequenceId, country, agency: toAgency(country)!, submissionType: row.application_type };
}
function applies(requirement: CompanyLegalRequirement, target: CompanyLegalReadinessResponse['target']) {
  if (requirement.sequenceId && requirement.sequenceId !== target.sequenceId) return false;
  if (requirement.programId && requirement.programId !== target.programId) return false;
  return companyScopeMatches(requirement.agencies, target.agency, 'agency') && companyScopeMatches(requirement.countries, target.country, 'country') && companyScopeMatches(requirement.submissionTypes, target.submissionType, 'submissionType');
}
async function documentVerdict(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<CompanyLegalDocument> {
  const source = await readVaultLifecycleSource(q, organizationId, document.vaultDocumentId);
  const transmitRefusal = 'The registered legal Vault version is unavailable or no longer matches its recorded identity.';
  if (source && source.programId === document.programId && source.version === document.version && source.contentHash === document.contentHash) {
    return { ...document, transmitRefusal: await vaultVersionNotTransmittable(q, organizationId, source.id, source.contentHash) };
  }
  return { ...document, transmitRefusal };
}
/** Unsaved regional suggestions do not retrospectively block existing filings.
 * Once a custodian records an applicable required/unresolved review, its exact
 * mappings, approvals, evidence and placements become binding release inputs. */
export async function assessStoredCompanyLegalRequirements(q: RequestSqlClient, input: { organizationId: number; sequenceId: number; today?: string }): Promise<CompanyLegalReadinessResponse | null> {
  const saved = await q.query('SELECT settings FROM organizations WHERE id=$1', [input.organizationId]);
  if (saved.rows.length !== 1) throw new CompanyDocumentsError(409, 'LEGAL_REQUIREMENTS_UNVERIFIED', 'Company legal requirement configuration could not be verified for this tenant.');
  const raw = asSettings(asSettings(saved.rows[0].settings).companyDocuments).legalRequirements;
  if (raw !== undefined && !Array.isArray(raw)) throw new CompanyDocumentsError(409, 'LEGAL_REQUIREMENTS_UNVERIFIED', 'The company legal requirement registry is invalid.');
  const stored = (raw ?? []) as CompanyLegalRequirement[];
  if (!stored.length) return null;
  const target = await recordedTarget(q, input.organizationId, input.sequenceId);
  const requirements = stored.filter(requirement => applies(requirement, target));
  if (!requirements.length) return null;
  const registry = await readCompanyLegalRegistry(q, input.organizationId);
  const documents = await Promise.all(registry.filter(document => document.programId === target.programId).map(document => documentVerdict(q, input.organizationId, document)));
  const evidenceRefusals: Record<string, string | null> = {};
  for (const document of documents) {
    try { evidenceRefusals[document.id] = await companyLegalStoredEvidenceRefusal(q, input.organizationId, document); }
    catch (error) { if (error instanceof CompanyDocumentsError && error.status === 409) evidenceRefusals[document.id] = error.message; else throw error; }
  }
  const { rows } = await q.query(`SELECT document_uuid::text AS document_id,document_content_sha256,section_code,lifecycle_op FROM submission_leaves
    WHERE organization_id=$1 AND sequence_id=$2 AND deleted_at IS NULL AND document_table='vault_documents'`, [input.organizationId, input.sequenceId]);
  return assessCompanyLegalReadiness({ target, documents, requirements, evidenceRefusals, today: input.today, includeRegionalSuggestions: false,
    placements: rows.map(row => ({ documentId: String(row.document_id), contentHash: String(row.document_content_sha256), sectionCode: String(row.section_code), operation: String(row.lifecycle_op) })) });
}
export function companyLegalRequirementBlockers(result: CompanyLegalReadinessResponse | null): string[] {
  if (!result) return [];
  return result.items.filter(item => !['ready', 'not_applicable'].includes(item.status)).map(item => `${item.requirement.title}: ${item.findings.join(' ')}`);
}
export async function requireStoredCompanyLegalRequirements(q: RequestSqlClient, input: { organizationId: number; sequenceId: number; today?: string }): Promise<void> {
  const result = await assessStoredCompanyLegalRequirements(q, input);
  const blockers = companyLegalRequirementBlockers(result);
  if (blockers.length) throw new CompanyDocumentsError(409, 'COMPANY_LEGAL_REQUIREMENTS_INCOMPLETE', `Saved company legal requirements prevent assembly. ${blockers.join(' ')}`);
}
