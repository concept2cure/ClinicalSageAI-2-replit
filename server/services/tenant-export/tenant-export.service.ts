/**
 * Tenant data export — bundles every customer-owned resource into a
 * single JSON manifest for off-boarding or customer-initiated export.
 *
 * The signed audit export and tamper-proof chain attestation are produced
 * by their own services and embedded by reference (caller fetches them
 * separately or composes the bundle).
 *
 * Tenant safety: every query is gated on `organizationId`. Refuses if
 * the org doesn't exist.
 *
 * BETA scope: synchronous, in-memory JSON. For the GA endpoint this
 * should stream to S3 and emit a presigned download URL; for limited
 * BETA, in-memory is fine — the largest expected dump is a few MB.
 */

import type { Pool, PoolClient } from 'pg';

export interface TenantExportManifest {
  schemaVersion: '1.1';
  exportedAt: string;
  /**
   * Reads that FAILED, so a consumer can tell an empty resource from an unread
   * one.
   *
   * ── 2026-09-10 ───────────────────────────────────────────────────────────
   * Six queries here carried `.catch(() => ({ rows: [] }))` (and, for the audit
   * count, `.catch(() => ({ rows: [{ count: '0' }] }))`). A failure therefore
   * fed BOTH `counts.<resource>` and `resources.<resource>`: the manifest did
   * not merely misreport a number, it presented an empty collection as the
   * tenant's data. For the audit log that meant an export stating the tenant
   * has zero audit-log entries — which, in the document a customer receives
   * when they ask for their data, is a claim about their compliance record.
   *
   * The shape is copied from the sibling that already solved this:
   * tenant-full-export.service.ts records `coverage.tablesFailed` rather than
   * folding a failure into a count. Empty here means empty.
   *
   * schemaVersion moves 1.0 -> 1.1 because a consumer that ignores this field
   * is reading the old contract, in which a zero could not be a failure.
   */
  readFailures: Array<{ resource: string; error: string }>;
  organization: {
    id: number;
    slug: string;
    name: string;
    status: string;
  };
  counts: {
    programs: number;
    qSubmissions: number;
    qSubQuestions: number;
    qSubCommitments: number;
    evidenceSufficiencyAssessments: number;
    postMarketDocuments: number;
    gsprMappings: number;
    sections: number;
    /** Null when the audit-log count could not be read — see readFailures. */
    auditLogs: number | null;
  };
  resources: {
    programs: Array<Record<string, unknown>>;
    qSubmissions: Array<Record<string, unknown>>;
    qSubQuestions: Array<Record<string, unknown>>;
    qSubCommitments: Array<Record<string, unknown>>;
    qSubTimeline: Array<Record<string, unknown>>;
    qSubMeetings: Array<Record<string, unknown>>;
    evidenceSufficiencyAssessments: Array<Record<string, unknown>>;
    postMarketDocuments: Array<Record<string, unknown>>;
    gsprMappings: Array<Record<string, unknown>>;
    sections: Array<Record<string, unknown>>;
  };
}

export class TenantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantNotFoundError';
  }
}


/**
 * Run one org-scoped read, recording a failure instead of swallowing it.
 *
 * The previous `.catch(() => ({ rows: [] }))` made "the query threw" and "there
 * are none" the same value, in both the count and the resource list. This keeps
 * the export resilient — one unreadable table must not abort a tenant's whole
 * data export — while making the gap visible in `readFailures`.
 */
async function readOrRecord(
  failures: Array<{ resource: string; error: string }>,
  resource: string,
  run: () => Promise<{ rows: Array<Record<string, unknown>> }>
): Promise<Array<Record<string, unknown>>> {
  try {
    return (await run()).rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ resource, error: message.slice(0, 200) });
    return [];
  }
}

export async function exportTenantData(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<TenantExportManifest> {
  const orgResult = await client.query<{
    id: number;
    slug: string;
    name: string;
    status: string;
  }>(
    `SELECT id, slug, name, status FROM organizations WHERE id = $1 LIMIT 1`,
    [organizationId],
  );
  if (orgResult.rows.length === 0) {
    throw new TenantNotFoundError(`Organization ${organizationId} not found`);
  }
  const org = orgResult.rows[0];

  // Populated by readOrRecord below; surfaced on the manifest so an empty
  // resource can be told from an unread one.
  const readFailures: Array<{ resource: string; error: string }> = [];

  // Programs are the entity all Q-Sub / evidence resources hang off.
  const programs = (
    await client.query(
      `SELECT id, name, code, description, program_type, product_type, device_class,
              regulatory_path, primary_agency, product_name, status, phase, priority,
              target_submission_date, actual_submission_date, approval_date,
              created_at, updated_at
       FROM regulatory_programs WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [organizationId],
    )
  ).rows;

  const programIds = programs.map(p => String(p.id));

  // Q-Sub family — joined through programs.
  const qSubmissions = programIds.length
    ? (
        await client.query(
          `SELECT id, program_id, q_number, q_sub_type, title, stage, days_in,
                  filed_at, target_date, fda_team, tone, summary, created_by,
                  created_at, updated_at
           FROM q_submissions WHERE program_id = ANY($1::text[])
           ORDER BY created_at ASC`,
          [programIds],
        )
      ).rows
    : [];

  const qSubmissionIds = qSubmissions.map(q => String(q.id));

  const [qSubQuestions, qSubMeetings, qSubTimeline] = qSubmissionIds.length
    ? await Promise.all([
        client.query(
          `SELECT id, q_submission_id, n, question, our_position, fda_response, status,
                  created_at, updated_at
           FROM q_sub_questions WHERE q_submission_id = ANY($1::uuid[])
           ORDER BY q_submission_id, n`,
          [qSubmissionIds],
        ),
        client.query(
          `SELECT id, q_submission_id, meeting_date, kind, fda_team_display,
                  confirmed, minutes_received_at, created_at
           FROM q_sub_meetings WHERE q_submission_id = ANY($1::uuid[])
           ORDER BY meeting_date ASC`,
          [qSubmissionIds],
        ),
        client.query(
          `SELECT id, q_submission_id, "when", who, what, occurred_at, created_at
           FROM q_sub_timeline_entries WHERE q_submission_id = ANY($1::uuid[])
           ORDER BY occurred_at DESC`,
          [qSubmissionIds],
        ),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }];

  const questionIds = qSubQuestions.rows.map(q => String(q.id));
  const qSubCommitments = questionIds.length
    ? (
        await client.query(
          `SELECT id, q_sub_question_id, display_code, text, dossier_link_kind,
                  dossier_link_label, dossier_link_section_id, rolled_in,
                  rolled_in_at, rolled_in_by, blocker, created_at, updated_at
           FROM q_sub_commitments WHERE q_sub_question_id = ANY($1::uuid[])`,
          [questionIds],
        )
      ).rows
    : [];

  // Evidence-sufficiency assessments (org-scoped directly).
  const evidenceSufficiency = await readOrRecord(
    readFailures,
    'evidenceSufficiencyAssessments',
    () =>
      client.query(
        `SELECT * FROM evidence_sufficiency_assessments WHERE organization_id = $1
         ORDER BY created_at ASC`,
        [organizationId],
      ),
  );

  // Post-market documents.
  const postMarketDocuments = await readOrRecord(readFailures, 'postMarketDocuments', () =>
    client.query(
      `SELECT * FROM post_market_documents WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [organizationId],
    ),
  );

  // GSPR mappings (org-scoped).
  const gsprMappings = await readOrRecord(readFailures, 'gsprMappings', () =>
    client.query(
      `SELECT * FROM gspr_program_mappings WHERE organization_id = $1
       ORDER BY decided_at ASC`,
      [organizationId],
    ),
  );

  // Sections — manifest only (number, title, status, completion).
  const sections = await readOrRecord(readFailures, 'sections', () =>
    client.query(
      `SELECT id, document_id, section_number, section_title, section_key,
              category, status, completion_percentage, updated_at
       FROM cerv2_510k_sections WHERE organization_id = $1
       ORDER BY display_order ASC`,
      [organizationId],
    ),
  );

  // Audit-log row count only (full export goes via signedAuditExport).
  // A failed audit-log count used to become the string '0'. In a tenant data
  // export that is a statement that the tenant has no audit trail, so the count
  // is null on failure and the reason is in readFailures.
  let auditLogCount: number | null = null;
  try {
    const r = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE tenant_id = $1`,
      [organizationId],
    );
    auditLogCount = parseInt(r.rows[0].count, 10);
    if (!Number.isFinite(auditLogCount)) auditLogCount = null;
  } catch (error) {
    readFailures.push({
      resource: 'auditLogs',
      error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    });
  }

  return {
    schemaVersion: '1.1',
    exportedAt: new Date().toISOString(),
    readFailures,
    organization: org,
    counts: {
      programs: programs.length,
      qSubmissions: qSubmissions.length,
      qSubQuestions: qSubQuestions.rows.length,
      qSubCommitments: qSubCommitments.length,
      evidenceSufficiencyAssessments: evidenceSufficiency.length,
      postMarketDocuments: postMarketDocuments.length,
      gsprMappings: gsprMappings.length,
      sections: sections.length,
      auditLogs: auditLogCount,
    },
    resources: {
      programs,
      qSubmissions,
      qSubQuestions: qSubQuestions.rows,
      qSubCommitments,
      qSubTimeline: qSubTimeline.rows,
      qSubMeetings: qSubMeetings.rows,
      evidenceSufficiencyAssessments: evidenceSufficiency,
      postMarketDocuments,
      gsprMappings,
      sections,
    },
  };
}
