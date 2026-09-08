/**
 * The one way a cerv2_510k_sections change becomes history.
 *
 * `cerv2_510k_sections` has no version trigger — nothing in the database
 * preserves a section's prior text when it is overwritten. That made the
 * version row an application responsibility, and only one of the two writers
 * accepted it: the human PATCH route recorded a rich `cerv2_section_versions`
 * row, while AnA's `write_kit_section` tool overwrote `content` in place with
 * no version row, no reason and no prior-content snapshot. AnA could therefore
 * destroy a section's earlier text with no recoverable history — on the device
 * surface, where that text becomes a 510(k).
 *
 * This module is that responsibility in one place, so the next writer cannot
 * arrive with another answer, and so "did this change get recorded?" has a
 * single implementation to inspect. The AnA tool path uses it, and as of ledger
 * L39 so do all three routes/cerv2-sections.ts handlers, whose inline inserts
 * are gone. The one column those inserts wrote and this writer did not,
 * `field_data`, is a parameter here now — a shared writer that silently drops a
 * column the callers it replaces were filling is not a migration.
 *
 * ── CALLERS MUST PASS A TRANSACTION ─────────────────────────────────────────
 * `exec` is the caller's transaction client, and the caller must run its
 * content UPDATE on the same one. A version row written outside the content
 * write can commit while the content rolls back (history for a change that
 * never happened), or the content can commit while the history fails (a change
 * with no history — the failure this exists to prevent). Both are worse than
 * refusing.
 *
 * @module server/services/cerv2/section-version
 */

/** Minimal shape of a pg client / pool — whatever the caller's transaction is. */
export interface SectionVersionExec {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface RecordSectionVersionParams {
  sectionId: number;
  organizationId: number;
  /** What kind of change this was: 'created' | 'edited' | 'reviewed' | 'approved'. */
  changeType: string;
  /**
   * Why the change was made. Required by the caller's own contract rather than
   * defaulted here: a literal like 'Section updated' satisfies a NOT NULL
   * column while telling a reviewer nothing, and a reason nobody supplied is
   * not a reason.
   */
  changeSummary: string;
  /** The section's state AFTER the change. */
  content: string;
  status?: string | null;
  completionPercentage?: number | null;
  /**
   * Every field value as of this version. The column exists so a reviewer can
   * see the whole section state at a point in history without reconstructing it
   * from the diff columns; a writer that omits it leaves that NULL and the
   * reconstruction is the reader's problem.
   */
  fieldData?: unknown;
  /** The state BEFORE — this is the part that makes the row history. */
  previousValues: Record<string, unknown>;
  newValues?: Record<string, unknown> | null;
  fieldsChanged?: string[] | null;
  changedBy?: number | null;
  changedByEmail?: string | null;
  changedByName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append the next version row for a section, on the caller's transaction.
 *
 * The version number is computed with `MAX(version_number) + 1` inside the same
 * transaction as the caller's UPDATE, so two concurrent writers cannot both
 * read the same maximum — the second blocks on the first's row lock and sees
 * the committed value.
 *
 * @returns the version number written.
 */
export async function recordCerv2SectionVersion(
  exec: SectionVersionExec,
  params: RecordSectionVersionParams,
): Promise<number> {
  const { rows: maxRows } = await exec.query(
    `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM cerv2_section_versions
      WHERE section_id = $1 AND organization_id = $2`,
    [params.sectionId, params.organizationId],
  );
  const nextVersion = Number(maxRows[0]?.max_version ?? 0) + 1;

  await exec.query(
    `INSERT INTO cerv2_section_versions
       (section_id, organization_id, version_number, change_type, change_summary,
        content, status, completion_percentage, field_data, fields_changed,
        previous_values, new_values,
        changed_by, changed_by_email, changed_by_name, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::json,$10,$11::json,$12::json,$13,$14,$15,$16,$17)`,
    [
      params.sectionId,
      params.organizationId,
      nextVersion,
      params.changeType,
      params.changeSummary,
      params.content,
      params.status ?? null,
      params.completionPercentage ?? null,
      params.fieldData == null ? null : JSON.stringify(params.fieldData),
      params.fieldsChanged ?? null,
      JSON.stringify(params.previousValues ?? {}),
      params.newValues == null ? null : JSON.stringify(params.newValues),
      params.changedBy ?? null,
      params.changedByEmail ?? null,
      params.changedByName ?? null,
      params.ipAddress ?? null,
      params.userAgent ?? null,
    ],
  );

  return nextVersion;
}
