/**
 * The Module 3 contradiction lifecycle: a sweep that keeps what people decided,
 * and a resolution that is a governed act.
 *
 * ── The defects this replaces (discovery map 2026-10-04,
 *    cmc-contradiction-sweep-erases-resolutions, contradiction-lifecycle) ─────
 * 1. The sweep ran `DELETE FROM cmc_contradictions` for the program and
 *    re-inserted whatever it detected, all `open`. Every resolution a person
 *    had recorded was erased by the next sweep, and a critical finding that QA
 *    had resolved came back open and blocked approval again, with its
 *    resolution note orphaned in the provenance log.
 * 2. Resolving needed no role and no reason the server checked, recorded the
 *    actor as the raw request user or 'system', and wrote no audit row.
 *
 * Now the sweep reconciles. A finding is identified by its type and its
 * details, which name the records and values in conflict, so the same conflict
 * over the same data is the same finding:
 *   - detected again → kept as it stands: an open finding stays open, a
 *     resolved one stays resolved (its data has not changed);
 *   - newly detected → inserted open;
 *   - open and no longer detected → removed: the conflict is gone from the
 *     data, which is what clears it;
 *   - resolved and no longer detected → kept, as the record of the decision.
 * Changed data changes the details, so a resolution never carries over to a
 * different conflict.
 *
 * Resolving requires a stated reason (the governed-reason floor), refuses a
 * finding already resolved, and writes the provenance event and a chained
 * audit row in the same transaction as the status change, under the signed-in
 * user's id.
 *
 * @module server/services/cmc/contradiction-lifecycle
 */
import type { PoolClient } from 'pg';
import { writeChainedAuditRow } from '../auditService.js';
import { requireGovernedReason } from '../../routes/governed-reason';
import { type Refusal, refuse, inRefusableTransaction } from '../vault/vault-refusal.js';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface DetectedContradiction {
  severity: string;
  contradictionType: string;
  details: string;
  impactedSections: string[];
  requiredReviewers: string[];
}

export interface SweepOutcome {
  inserted: number;
  kept: number;
  keptResolved: number;
  cleared: number;
}

const key = (type: string, details: string) => `${type}\u0000${details}`;

/** Reconcile the program's stored findings with what the detector found now. Run inside the caller's transaction. */
export async function reconcileContradictions(
  client: Queryable,
  orgId: number,
  projectId: string,
  detected: DetectedContradiction[],
): Promise<SweepOutcome> {
  const { rows: stored } = await client.query(
    `SELECT id, contradiction_type, details, status FROM cmc_contradictions
      WHERE organization_id = $1 AND project_id = $2
      FOR UPDATE`,
    [orgId, projectId],
  );
  const byKey = new Map<string, { id: string; status: string }>();
  for (const r of stored) byKey.set(key(r.contradiction_type, r.details), { id: String(r.id), status: String(r.status) });

  const outcome: SweepOutcome = { inserted: 0, kept: 0, keptResolved: 0, cleared: 0 };
  const seen = new Set<string>();
  for (const c of detected) {
    const k = key(c.contradictionType, c.details);
    if (seen.has(k)) continue;
    seen.add(k);
    const existing = byKey.get(k);
    if (existing) {
      // The same conflict over the same data: its standing is kept. Severity,
      // sections and reviewers follow the detector's current reading.
      await client.query(
        `UPDATE cmc_contradictions
            SET severity = $3, impacted_sections = $4::jsonb, required_reviewers = $5::jsonb
          WHERE id = $1 AND organization_id = $2`,
        [existing.id, orgId, c.severity, JSON.stringify(c.impactedSections), JSON.stringify(c.requiredReviewers)],
      );
      if (existing.status === 'resolved') outcome.keptResolved += 1;
      else outcome.kept += 1;
      continue;
    }
    await client.query(
      `INSERT INTO cmc_contradictions (organization_id, project_id, severity, contradiction_type, details, impacted_sections, required_reviewers)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [orgId, projectId, c.severity, c.contradictionType, c.details, JSON.stringify(c.impactedSections), JSON.stringify(c.requiredReviewers)],
    );
    outcome.inserted += 1;
  }

  const gone = [...byKey].filter(([k, v]) => !seen.has(k) && v.status !== 'resolved').map(([, v]) => v.id);
  if (gone.length > 0) {
    await client.query(
      `DELETE FROM cmc_contradictions WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND status <> 'resolved'`,
      [orgId, gone],
    );
    outcome.cleared = gone.length;
  }
  return outcome;
}

/** Resolve one finding with the person's reason: status, provenance and audit in one transaction. */
export async function resolveContradiction(a: {
  organizationId: number;
  userId: number;
  contradictionId: string;
  reason: unknown;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ ok: true; projectId: string } | Refusal> {
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!/^[0-9a-f-]{36}$/i.test(a.contradictionId)) return refuse(404, 'NOT_FOUND', 'Contradiction not found.');
  return inRefusableTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT id, project_id, status, severity, contradiction_type, details FROM cmc_contradictions
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [a.contradictionId, a.organizationId],
    );
    const row = rows[0];
    if (!row) return refuse(404, 'NOT_FOUND', 'Contradiction not found.');
    if (row.status === 'resolved') return refuse(409, 'ALREADY_RESOLVED', 'That contradiction is already resolved.');
    await client.query(
      `UPDATE cmc_contradictions SET status = 'resolved', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [row.id, a.organizationId],
    );
    await client.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'contradiction', $3, 'resolved', $4::jsonb, $5)`,
      [a.organizationId, row.project_id, row.id, JSON.stringify({ resolutionNote: reason.reason, severity: row.severity }), String(a.userId)],
    );
    await writeChainedAuditRow(client, {
      tenantId: a.organizationId,
      userId: a.userId,
      action: 'cmc.contradiction.resolve',
      resourceType: 'cmc_contradiction',
      resourceId: String(row.id),
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      details: {
        projectId: row.project_id,
        severity: row.severity,
        contradictionType: row.contradiction_type,
        details: row.details,
        reason: reason.reason,
      },
    });
    return { ok: true as const, projectId: String(row.project_id) };
  });
}
