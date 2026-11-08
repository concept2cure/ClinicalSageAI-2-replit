/** Fixed native-register reads split from project-evidence. Only values are bound;
 * table names, joins and scope predicates are complete literal statements. */
export interface QualityQueryValues {
  organizationId: number;
  programId: string | null;
  workspaceId: number | null;
  documentIds: number[];
  trainingVersions: string;
  changeIds: string[];
  roleIds: string[];
  planIds: string[];
  limit: number;
}
interface QuerySpec {
  sql: string;
  bind: Array<keyof QualityQueryValues>;
  programRequired?: boolean;
}
const QUERIES: Readonly<Record<string, QuerySpec>> = {
  qms_change_controls: {
    sql: `SELECT t.* FROM qms_change_controls t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND (t.program_id IS NULL OR ($2::uuid IS NOT NULL AND t.program_id=$2::uuid)) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'programId', 'limit'],
  },
  qms_nonconforming_products: {
    sql: `SELECT t.* FROM qms_nonconforming_products t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND (t.program_id IS NULL OR ($2::uuid IS NOT NULL AND t.program_id=$2::uuid)) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'programId', 'limit'],
  },
  capa_records: {
    sql: `SELECT t.* FROM capa_records t JOIN regulatory_programs p ON p.id::text=t.program_id
      WHERE p.organization_id=$1 AND p.deleted_at IS NULL AND t.program_id=$2 ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'programId', 'limit'], programRequired: true,
  },
  capa_actions: {
    sql: `SELECT t.* FROM capa_actions t JOIN capa_records c ON c.id=t.capa_id JOIN regulatory_programs p ON p.id::text=c.program_id
      WHERE p.organization_id=$1 AND p.deleted_at IS NULL AND c.program_id=$2 ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'programId', 'limit'], programRequired: true,
  },
  qms_suppliers: {
    sql: `SELECT t.* FROM qms_suppliers t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL ORDER BY t.id LIMIT $2`,
    bind: ['organizationId', 'limit'],
  },
  qc_deviations: {
    sql: `SELECT t.* FROM qc_deviations t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND ((to_jsonb(t)->>'client_workspace_id') IS NULL OR ($2::int IS NOT NULL AND (to_jsonb(t)->>'client_workspace_id')::int=$2::int)) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'workspaceId', 'limit'],
  },
  qms_internal_audits: {
    sql: `SELECT t.* FROM qms_internal_audits t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL ORDER BY t.id LIMIT $2`,
    bind: ['organizationId', 'limit'],
  },
  qms_management_reviews: {
    sql: `SELECT t.* FROM qms_management_reviews t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL ORDER BY t.id LIMIT $2`,
    bind: ['organizationId', 'limit'],
  },
  qms_training_records: {
    sql: `SELECT t.* FROM qms_training_records t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS v(document_id int,version text)
        WHERE v.document_id=t.document_id AND v.version=t.document_version) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'trainingVersions', 'limit'],
  },
  qms_training_assignments: {
    sql: `SELECT t.* FROM qms_training_assignments t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.document_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'documentIds', 'limit'],
  },
  qms_job_roles: {
    sql: `SELECT t.* FROM qms_job_roles t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL ORDER BY t.id LIMIT $2`,
    bind: ['organizationId', 'limit'],
  },
  qms_job_role_members: {
    sql: `SELECT t.* FROM qms_job_role_members t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.job_role_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'roleIds', 'limit'],
  },
  quality_management_plans: {
    sql: `SELECT t.* FROM quality_management_plans t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND ((to_jsonb(t)->>'client_workspace_id') IS NULL OR ($2::int IS NOT NULL AND (to_jsonb(t)->>'client_workspace_id')::int=$2::int)) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'workspaceId', 'limit'],
  },
  ctq_factors: {
    sql: `SELECT t.* FROM ctq_factors t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.qmp_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'planIds', 'limit'],
  },
  qmp_section_gating: {
    sql: `SELECT t.* FROM qmp_section_gating t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.qmp_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'planIds', 'limit'],
  },
  qmp_traceability_matrix: {
    sql: `SELECT t.* FROM qmp_traceability_matrix t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.qmp_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'planIds', 'limit'],
  },
  qms_change_links: {
    sql: `SELECT t.* FROM qms_change_links t WHERE t.organization_id=$1 AND (to_jsonb(t)->>'deleted_at') IS NULL
      AND t.change_id=ANY($2::int[]) ORDER BY t.id LIMIT $3`,
    bind: ['organizationId', 'changeIds', 'limit'],
  },
};

export function qualityFamilyQuery(table: string, values: QualityQueryValues): { sql: string; args: unknown[] } | null {
  const spec = Object.hasOwn(QUERIES, table) ? QUERIES[table] : undefined;
  if (!spec) throw new Error('Unknown native Quality register.');
  if (spec.programRequired && !values.programId) return null;
  return { sql: spec.sql, args: spec.bind.map(key => values[key]) };
}
