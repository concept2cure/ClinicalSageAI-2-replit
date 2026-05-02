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
  schemaVersion: '1.0';
  exportedAt: string;
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
    auditLogs: number;
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
  const evidenceSufficiency = (
    await client.query(
      `SELECT * FROM evidence_sufficiency_assessments WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [organizationId],
    ).catch(() => ({ rows: [] }))
  ).rows;

  // Post-market documents.
  const postMarketDocuments = (
    await client
      .query(
        `SELECT * FROM post_market_documents WHERE organization_id = $1
         ORDER BY created_at ASC`,
        [organizationId],
      )
      .catch(() => ({ rows: [] }))
  ).rows;

  // GSPR mappings (org-scoped).
  const gsprMappings = (
    await client
      .query(
        `SELECT * FROM gspr_program_mappings WHERE organization_id = $1
         ORDER BY decided_at ASC`,
        [organizationId],
      )
      .catch(() => ({ rows: [] }))
  ).rows;

  // Sections — manifest only (number, title, status, completion).
  const sections = (
    await client
      .query(
        `SELECT id, document_id, section_number, section_title, section_key,
                category, status, completion_percentage, updated_at
         FROM cerv2_510k_sections WHERE organization_id = $1
         ORDER BY display_order ASC`,
        [organizationId],
      )
      .catch(() => ({ rows: [] }))
  ).rows;

  // Audit-log row count only (full export goes via signedAuditExport).
  const auditLogCount = (
    await client
      .query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs WHERE tenant_id = $1`,
        [organizationId],
      )
      .catch(() => ({ rows: [{ count: '0' }] }))
  ).rows[0].count;

  return {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
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
      auditLogs: parseInt(auditLogCount, 10) || 0,
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
