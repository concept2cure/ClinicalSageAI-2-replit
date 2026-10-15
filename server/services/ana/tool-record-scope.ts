/**
 * A program id AnA's model supplies is the caller's organization's, or the tool
 * does not run (P1-34 hand-on 2).
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * Tool arguments are chosen by the model, and the model reads documents other
 * people wrote. Dozens of AnA handlers took `program_id` / `programId` and
 * checked that it looked like a UUID — then anchored a record to it (a risk
 * item, a KRI, a QTL, a monitoring plan, a governed fact, a clinical study, an
 * IVD classification…) or read for it. The row was stamped with the caller's
 * organization, but pointed at another tenant's program; and where a read ran
 * without the caller's tenant scope (site_intel.sites, the governed-fact
 * store), another tenant's data came back. A foreign-key check does not stop
 * this: Postgres runs referential checks as the table owner, past row-level
 * security.
 *
 * Checking it in each handler is how it went wrong — the check was written a
 * dozen times and skipped in more. It is checked here once, in the registry
 * wrapper every handler is registered through, so every path (the stream, the
 * agentic loop, MCP, a tool calling a tool) and every tool added later is
 * covered. The question itself is answered by `programInOrganization`
 * (server/services/c2c/program-access.ts), the one program check: a live
 * project of this organization in `regulatory_programs`. It throws rather than
 * inventing a verdict when it could not be read.
 *
 * @module server/services/ana/tool-record-scope
 */

/** The input fields that name a program. */
export const PROGRAM_ID_FIELDS = ['program_id', 'programId', 'device_program_id'] as const;

export interface ScopeRefusal {
  code: string;
  result: string;
}

type ProgramCheck = (programId: string, organizationId: number) => Promise<boolean>;

async function defaultProgramCheck(programId: string, organizationId: number): Promise<boolean> {
  const [{ programInOrganization }, { getPool }] = await Promise.all([
    import('../c2c/program-access.js'),
    import('../../db.js'),
  ]);
  return programInOrganization(getPool, programId, organizationId);
}

/** In the shape the handlers answer with: the reason in `error`, the code beside it. */
function refusal(code: string, message: string): ScopeRefusal {
  return { code, result: JSON.stringify({ error: message, code, retry: false }) };
}

/**
 * Null when every program the call names belongs to the caller's
 * organization (or it names none); otherwise the refusal the model reads.
 * Nothing is read or written for a call it refuses.
 */
export async function foreignProgramRefusal(
  input: Record<string, unknown> | undefined,
  organizationId: number | null | undefined,
  check: ProgramCheck = defaultProgramCheck,
): Promise<ScopeRefusal | null> {
  const named = PROGRAM_ID_FIELDS.map(field => ({ field, value: input?.[field] })).filter(
    ({ value }) => typeof value === 'string' && value.trim() !== '',
  ) as Array<{ field: string; value: string }>;
  if (named.length === 0) return null;

  if (!organizationId) {
    return refusal(
      'PROGRAM_NOT_IN_ORGANIZATION',
      'This call names a program, so organization context is required: without the organization it runs ' +
        'for there is no way to confirm the program is yours. Nothing was read or changed.',
    );
  }

  for (const { field, value } of named) {
    let ours: boolean;
    try {
      ours = await check(value.trim(), organizationId);
    } catch {
      return refusal(
        'PROGRAM_CHECK_UNAVAILABLE',
        `Whether ${field} is one of this organization's programs could not be checked just now, so nothing was ` +
          'read or changed. Try again shortly.',
      );
    }
    if (!ours) {
      // The id is not echoed: it is the model's, and the result goes back into
      // the conversation.
      return refusal(
        'PROGRAM_NOT_IN_ORGANIZATION',
        `${field} does not name one of this organization's programs, so nothing was read or changed. ` +
          "Use a program from this organization's project list.",
      );
    }
  }
  return null;
}

/**
 * Record ids other than programs, per tool, with the query that proves the
 * record is the caller's organization's. Keyed by tool AND field because the
 * same field name means different tables in different tools (`site_id`,
 * `assessment_id`). Each was a handler that checked the record's parent — the
 * study, the risk item, the package — and took this id on trust, so the row it
 * wrote pointed into another tenant's records.
 *
 * `$1` is the id, `$2` the organization.
 */
export const RECORD_SCOPES: Readonly<Record<string, ReadonlyArray<{ field: string; sql: string }>>> = {
  add_risk_control: [
    { field: 'new_risk_item_id', sql: 'SELECT 1 FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL' },
  ],
  log_study_ae: [{ field: 'site_id', sql: 'SELECT 1 FROM clinical_study_sites WHERE id = $1 AND organization_id = $2' }],
  log_study_deviation: [{ field: 'site_id', sql: 'SELECT 1 FROM clinical_study_sites WHERE id = $1 AND organization_id = $2' }],
  qms_change_create: [
    { field: 'qms_document_id', sql: 'SELECT 1 FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL' },
  ],
  simulate_reviewer_challenges: [{ field: 'assessment_id', sql: assessmentInOrganizationSql() }],
  assemble_briefing_book: [{ field: 'assessment_id', sql: assessmentInOrganizationSql() }],
  approve_import: [{ field: 'project_id', sql: 'SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2' }],
};

/** A readiness assessment has no organization column; it is its package's. */
function assessmentInOrganizationSql(): string {
  return (
    'SELECT 1 FROM submission_twin_assessments a JOIN c2c_submission_packages p ON p.id = a.package_id ' +
    'WHERE a.id = $1 AND p.org_id = $2'
  );
}

type RecordQuery = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

async function defaultRecordQuery(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> {
  const { getPool } = await import('../../db.js');
  return getPool().query(sql, params);
}

/**
 * Null when every record id RECORD_SCOPES names for this tool is absent or the
 * caller's organization's; otherwise the refusal the model reads.
 */
export async function foreignRecordRefusal(
  tool: string,
  input: Record<string, unknown> | undefined,
  organizationId: number | null | undefined,
  query: RecordQuery = defaultRecordQuery,
): Promise<ScopeRefusal | null> {
  const scopes = RECORD_SCOPES[tool];
  if (!scopes) return null;
  for (const { field, sql } of scopes) {
    const value = input?.[field];
    if (value === undefined || value === null || value === '') continue;
    if (!organizationId) {
      return refusal(
        'RECORD_NOT_IN_ORGANIZATION',
        `This call names a record (${field}), so organization context is required. Nothing was read or changed.`,
      );
    }
    let rows: unknown[];
    try {
      ({ rows } = await query(sql, [value, organizationId]));
    } catch {
      return refusal(
        'RECORD_CHECK_UNAVAILABLE',
        `Whether ${field} is one of this organization's records could not be checked just now, so nothing was ` +
          'read or changed. Try again shortly.',
      );
    }
    if (rows.length === 0) {
      return refusal(
        'RECORD_NOT_IN_ORGANIZATION',
        `${field} does not name one of this organization's records, so nothing was read or changed.`,
      );
    }
  }
  return null;
}
