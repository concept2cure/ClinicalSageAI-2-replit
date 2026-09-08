/**
 * The CMC register reads behind the Module 3 contradictions sweep — one
 * tenant-scoped implementation for every caller.
 *
 * ── Why this module exists ────────────────────────────────────────────────────
 * The sweep was written twice. The HTTP surface
 * (api/cmc/module3OperatingSystemRoutes) was corrected to scope every read by
 * organization and to use the columns the tables actually have; the AnA command
 * handler (services/ana-ri/module3-command-handlers) kept the original SQL,
 * which filtered by `project_id` alone. Because the project id is caller-
 * supplied and register project ids share one uuid space, that second copy
 * returned another organization's specifications, methods, stability studies,
 * batch records and comparability assessments to whoever asked. The same SQL
 * also selected `method_name` / `study_name`, columns these tables do not have,
 * so against a provisioned database it raised rather than answered.
 *
 * Both callers now share this function, so the tenant predicate and the column
 * names cannot drift apart again.
 *
 * ── The shapes, which are not uniform ─────────────────────────────────────────
 * - quality_specifications  — tenant_id, uuid project_id
 * - cmc_batch_records       — tenant_id OR organization_id (both exist), uuid project_id
 * - cmc_comparability_assessments — organization_id, uuid project_id
 * - analytical_methods / stability_studies — the ORGANIZATION's registers, with
 *   no project column by design, so they are read org-wide.
 *
 * A non-uuid project id (a legacy numeric one) matches no register row, so the
 * project-scoped reads are skipped rather than issued: passing it to a uuid
 * column aborts the whole statement with 22P02, which would turn "no rows" into
 * a 500 for the entire sweep.
 *
 * @module server/services/cmc/contradiction-registers
 */

/** Minimal query surface — node-postgres Pool, a PoolClient, or PGlite. */
export interface RegisterQueryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface ContradictionRegisters {
  specifications: Array<{ materialName: string; acceptanceCriteria?: Record<string, unknown> }>;
  methods: Array<{ methodName: string; purpose?: string; validationStatus?: string }>;
  stability: Array<{ studyName: string; status?: string }>;
  batch: Array<{ batchNumber: string; disposition?: string }>;
  comparability: Array<{ assessmentName: string; regulatoryRiskLevel?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the five registers the contradiction engine consumes, scoped to one
 * organization. Every query carries the org; none is filtered by project alone.
 */
export async function readContradictionRegisters(
  pool: RegisterQueryable,
  args: { organizationId: number; projectId: string },
): Promise<ContradictionRegisters> {
  const { organizationId: orgId, projectId } = args;
  const isUuidProject = UUID_RE.test(String(projectId ?? ''));
  const noRows = Promise.resolve({ rows: [] as never[] });

  const [specs, methods, stability, batch, comparability] = await Promise.all([
    isUuidProject
      ? pool.query(
          `SELECT material_name as "materialName", acceptance_criteria as "acceptanceCriteria"
             FROM quality_specifications
            WHERE project_id = $1::uuid AND tenant_id::text = $2`,
          // `::text` on the column, not the param: quality_specifications
          // .tenant_id is `integer` where migrations/20260823_cmc_register_
          // store_parity.sql created the table, but TEXT on installs where
          // db/migrations/20260401_cmc_convergence_os.sql:127 added the column
          // to a pre-existing table first. A read that assumes one type throws
          // on the other.
          [projectId, String(orgId)],
        )
      : noRows,
    // The engine reads `validationStatus` (ICH Q2 validated / verified /
    // transferred); the table's column is `status`, and its name is `title`.
    pool.query(
      `SELECT title as "methodName", purpose, status as "validationStatus"
         FROM analytical_methods WHERE organization_id = $1`,
      [orgId],
    ),
    pool.query(
      `SELECT study_title as "studyName", status FROM stability_studies WHERE organization_id = $1`,
      [orgId],
    ),
    isUuidProject
      ? pool.query(
          `SELECT batch_number as "batchNumber", disposition FROM cmc_batch_records
            WHERE project_id = $1::uuid AND (tenant_id = $2 OR organization_id = $3)`,
          // Two params for one identity, deliberately. cmc_batch_records names
          // its owner in both `tenant_id TEXT` (db/migrations/
          // 20260401_cmc_convergence_os.sql:121) and `organization_id INTEGER
          // NOT NULL` (migrations/0006), so a SINGLE bound param is inferred as
          // text from the first comparison and then fails the second with
          // `operator does not exist: integer = text` — at runtime, on the
          // sweep that is supposed to fail closed.
          [projectId, String(orgId), orgId],
        )
      : noRows,
    isUuidProject
      ? pool.query(
          `SELECT assessment_name as "assessmentName", regulatory_risk_level as "regulatoryRiskLevel"
             FROM cmc_comparability_assessments
            WHERE project_id = $1::uuid AND organization_id = $2`,
          [projectId, orgId],
        )
      : noRows,
  ]);

  return {
    specifications: specs.rows as ContradictionRegisters['specifications'],
    methods: methods.rows as ContradictionRegisters['methods'],
    stability: stability.rows as ContradictionRegisters['stability'],
    batch: batch.rows as ContradictionRegisters['batch'],
    comparability: comparability.rows as ContradictionRegisters['comparability'],
  };
}

export default { readContradictionRegisters };
