/**
 * Retention and legal holds — the retention policies this organisation's vault
 * documents name, the legal holds in force at any point in the period, and the
 * documents the retention sweep disposed of in the period.
 *
 * vault.documents is policied on the organisation's UUID (identity.can_access_program
 * reads app.current_org_id), not on the integer tenant id the snapshot stamps,
 * so the run binds this organisation's UUID on the snapshot first — the one
 * the session's tenant scope carries (db/currentTenant.ts), checked against the
 * session's own organisation id. Without that the documents read would be empty
 * rather than refused, which is the one outcome a report must not have.
 *
 * Dispositions are the retention sweep's own chained rows
 * (jobs/retentionCron.ts disposeDocument: action
 * 'vault.document.retention_soft_delete', new_values documentCode /
 * retentionPolicy / retentionUntil / archived); the archive id is the snapshot
 * that sweep wrote to vault.document_archives in the same transaction.
 *
 * @module server/services/audit/compliance-reports/queries/retention-legal-holds
 */
import { currentTenantOrgUuid, TenantKeyRequiredError, type TenantKeyQueryable } from '../../../../db/currentTenant';
import type { ReportDefinition, RunContext, SectionResult, SqlClient } from '../types';
import { actorJoin, cappedSection, columns, isoUtc, naiveAsUtc } from './section';

/*
 * $1 organisation. A document with no organisation column of its own belongs to
 * its program's organisation, the attribution the retention sweep itself uses.
 */
const POLICIES_SQL = `
SELECT d.retention_policy AS policy_name,
       (p.id IS NOT NULL) AS defined,
       p.retention_days,
       p.archive_before_delete,
       p.hard_delete,
       p.active,
       count(*)::int AS documents,
       min(d.retention_until)::text AS next_expiry
  FROM vault.documents d
  LEFT JOIN vault.retention_policies p ON p.policy_name = d.retention_policy
 WHERE d.deleted_at IS NULL
   AND (d.organization_id = $1
        OR (d.organization_id IS NULL
            AND d.program_id IN (SELECT rp.id FROM regulatory_programs rp WHERE rp.organization_id = $1)))
 GROUP BY d.retention_policy, p.id, p.retention_days, p.archive_before_delete, p.hard_delete, p.active
 ORDER BY d.retention_policy NULLS LAST`;

/* $1 organisation, $2 period start, $3 period end (exclusive): placed before the end, not lifted before the start. */
const HOLDS_SQL = `
SELECT h.id,
       h.reference,
       h.scope,
       h.program_id,
       h.document_id,
       h.reason,
       ${isoUtc('h.placed_at')} AS placed_at,
       h.placed_by,
       pn.name AS placed_by_name,
       ${isoUtc('h.lifted_at')} AS lifted_at,
       h.lifted_by,
       ln.name AS lifted_by_name,
       h.lift_reason
  FROM vault.legal_holds h
  ${actorJoin('h.placed_by', 'pn')}
  ${actorJoin('h.lifted_by', 'ln')}
 WHERE h.organization_id = $1
   AND h.placed_at < $3::timestamptz
   AND (h.lifted_at IS NULL OR h.lifted_at >= $2::timestamptz)
 ORDER BY h.placed_at, h.id`;

const LOG_AT = `COALESCE(a.occurred_at, ${naiveAsUtc('a.created_at')})`;

/* $1 organisation, $2 period start, $3 period end (exclusive). */
const DISPOSITIONS_SQL = `
SELECT ${isoUtc(LOG_AT)} AS occurred_at,
       a.record_id AS document_id,
       a.new_values->>'documentCode' AS document_code,
       a.new_values->>'retentionPolicy' AS policy,
       a.new_values->>'retentionUntil' AS retention_until,
       CASE a.new_values->>'archived' WHEN 'true' THEN true WHEN 'false' THEN false END AS archived,
       ar.id AS archive_id,
       a.id AS audit_id
  FROM audit_logs a
  LEFT JOIN LATERAL (
        SELECT x.id
          FROM vault.document_archives x
         WHERE x.original_document_id::text = a.record_id
           AND x.archive_reason = 'retention_policy'
         ORDER BY x.archived_at DESC
         LIMIT 1) ar ON TRUE
 WHERE a.tenant_id = $1
   AND a.action = 'vault.document.retention_soft_delete'
   AND ${LOG_AT} >= $2::timestamptz
   AND ${LOG_AT} < $3::timestamptz
 ORDER BY ${LOG_AT}, a.id`;

/**
 * Bind the organisation's UUID on the snapshot, for the vault policies. The
 * UUID is the session scope's (or read from the organisations row for the
 * scope's tenant id), and must be the one of the organisation this report is
 * for; anything else is refused, never read around.
 */
async function bindVaultTenant(client: SqlClient, orgId: number): Promise<void> {
  const uuid = await currentTenantOrgUuid(client as unknown as TenantKeyQueryable);
  if (!uuid) throw new TenantKeyRequiredError('compliance report: the session carries no organisation UUID for the vault');
  const bound = await client.query(
    `SELECT set_config('app.current_org_id', o.uuid::text, true) AS org_uuid
       FROM organizations o
      WHERE o.id = $1 AND o.uuid = $2::uuid`,
    [orgId, uuid],
  );
  if (bound.rows.length !== 1) {
    throw new TenantKeyRequiredError('compliance report: the session organisation UUID is not this organisation');
  }
}

async function run(ctx: RunContext): Promise<Record<string, SectionResult>> {
  await bindVaultTenant(ctx.client, ctx.orgId);
  const period = [ctx.orgId, ctx.bounds.start, ctx.bounds.end];
  return {
    policies: {
      ...(await cappedSection(ctx.client, POLICIES_SQL, [ctx.orgId])),
      notes: [
        'Documents that are not deleted, by the retention policy they name. A policy name with no definition is applied by the sweep as archive, then soft delete.',
      ],
    },
    holds: { ...(await cappedSection(ctx.client, HOLDS_SQL, period)), notes: ['Times are UTC.'] },
    dispositions: { ...(await cappedSection(ctx.client, DISPOSITIONS_SQL, period)), notes: ['Times are UTC.'] },
  };
}

export const retentionLegalHolds: ReportDefinition = {
  id: 'retention-legal-holds',
  title: 'Retention and legal holds',
  purpose: "Shows the retention policies this organisation's documents are kept under, the legal holds in force during the period, and the documents the retention sweep disposed of.",
  basis: ['21 CFR 11.10(c)', 'EU GMP Annex 11 §17', 'GDPR Art. 5(1)(e)', 'GDPR Art. 17(3)', 'POLICY-DR-007'],
  period: 'range',
  sections: [
    {
      key: 'policies',
      title: 'Retention policies in use',
      columns: columns([
        ['policy_name', 'Policy'],
        ['defined', 'Policy defined'],
        ['retention_days', 'Retention (days)'],
        ['archive_before_delete', 'Archive before delete'],
        ['hard_delete', 'Destroy on expiry'],
        ['active', 'Active'],
        ['documents', 'Documents'],
        ['next_expiry', 'Earliest retention date'],
      ]),
    },
    {
      key: 'holds',
      title: 'Legal holds in force during the period',
      columns: columns([
        ['id', 'Hold id'],
        ['reference', 'Reference'],
        ['scope', 'Scope'],
        ['program_id', 'Program'],
        ['document_id', 'Document'],
        ['reason', 'Reason'],
        ['placed_at', 'Placed'],
        ['placed_by', 'Placed by user id'],
        ['placed_by_name', 'Placed by'],
        ['lifted_at', 'Lifted'],
        ['lifted_by', 'Lifted by user id'],
        ['lifted_by_name', 'Lifted by'],
        ['lift_reason', 'Reason for lifting'],
      ]),
    },
    {
      key: 'dispositions',
      title: 'Retention dispositions',
      columns: columns([
        ['occurred_at', 'Disposed'],
        ['document_id', 'Document'],
        ['document_code', 'Document code'],
        ['policy', 'Policy'],
        ['retention_until', 'Retained until'],
        ['archived', 'Archived first'],
        ['archive_id', 'Archive record'],
        ['audit_id', 'Audit record'],
      ]),
    },
  ],
  notRecorded: [
    'Documents the retention sweep skipped because a legal hold covered them, and destructions it refused, are written to the server log and not kept as records, so they do not appear here.',
  ],
  run,
};
