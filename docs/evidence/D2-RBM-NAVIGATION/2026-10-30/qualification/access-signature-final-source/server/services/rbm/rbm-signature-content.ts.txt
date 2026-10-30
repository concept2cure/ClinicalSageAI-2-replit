/** Immutable version content shared by RBM signing and signature re-derivation. */
import type { SignatureDbClient } from '../part11/signature-persistence';

export const RBM_ASSESSMENT_SIGNATURE_RECIPE = 'rbm-assessment/v1' as const;
export const RBM_PLAN_SIGNATURE_RECIPE = 'rbm-monitoring-plan/v1' as const;

/** Approval stamps are ceremony evidence, not a change to the approved content. */
function contentMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  return Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    key !== 'approvalReason' && key !== 'twoPersonRule'));
}

function versionedProject(row: Record<string, unknown> | undefined): row is Record<string, unknown> {
  return Boolean(row && typeof row.program_id === 'string' && row.program_id.length > 0
    && Number.isSafeInteger(row.version) && Number(row.version) > 0);
}

/** A linked factor from a different project is a repair case, never omitted from a signed register. */
async function coherentFactors(client: SignatureDbClient, id: number, orgId: number, programId: unknown) {
  const invalid = await client.query(`SELECT 1 FROM rbm_risk_items
    WHERE organization_id=$1 AND assessment_id=$2 AND deleted_at IS NULL
      AND program_id IS DISTINCT FROM $3::uuid LIMIT 1`, [orgId, id, programId]);
  return invalid.rows.length === 0;
}

export async function readRbmAssessmentSignatureContent(client: SignatureDbClient, id: number, orgId: number) {
  const row = (await client.query(`SELECT id,organization_id,program_id,title,framework,overall_risk,
    version,created_by,metadata FROM rbm_risk_assessments
    WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows[0];
  if (!versionedProject(row) || !await coherentFactors(client, id, orgId, row.program_id)) return null;
  const factors = (await client.query(`SELECT id,organization_id,program_id,assessment_id,ref_code,category,
    ctq_factor,risk_description,likelihood,impact,detectability,risk_score,is_critical,mitigation,
    residual_likelihood,residual_impact,residual_score,status,assigned_to,metadata
    FROM rbm_risk_items WHERE organization_id=$1 AND assessment_id=$2 AND program_id=$3
      AND deleted_at IS NULL ORDER BY id`, [orgId, id, row.program_id])).rows;
  return { recipe: RBM_ASSESSMENT_SIGNATURE_RECIPE, target: `rbm-assessment:${id}`,
    assessment: { ...row, metadata: contentMetadata(row.metadata) }, factors };
}

/** The retained source version is named; replacing the current assessment does not change this plan. */
async function retainedAssessment(client: SignatureDbClient, row: Record<string, unknown>, orgId: number) {
  if (row.assessment_id == null) return { assessment: null };
  const assessment = (await client.query(`SELECT id,organization_id,program_id,version
    FROM rbm_risk_assessments WHERE id=$1 AND organization_id=$2 AND program_id=$3
      AND deleted_at IS NULL`, [row.assessment_id, orgId, row.program_id])).rows[0];
  return versionedProject(assessment) ? { assessment } : null;
}

export async function readRbmPlanSignatureContent(client: SignatureDbClient, id: number, orgId: number) {
  const row = (await client.query(`SELECT id,organization_id,program_id,assessment_id,title,strategy,
    version,created_by,metadata FROM rbm_monitoring_plans
    WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows[0];
  if (!versionedProject(row)) return null;
  const source = await retainedAssessment(client, row, orgId);
  if (!source) return null;
  // Actions are execution history: completed work and carried-forward open work remain mutable.
  return { recipe: RBM_PLAN_SIGNATURE_RECIPE, target: `rbm-monitoring-plan:${id}`,
    plan: { ...row, metadata: contentMetadata(row.metadata) }, ...source };
}
