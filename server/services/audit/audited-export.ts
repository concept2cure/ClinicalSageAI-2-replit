/**
 * An export of retained records, recorded before anything leaves.
 *
 * Every inspector export in this product — a turn record
 * (routes/ana-ri/turn-records.ts) and a document's authoring record
 * (routes/authoring.router.ts) — does the same two things around its own
 * package, so they are done once, here:
 *
 *   1. walk the tenant's whole audit chain now, and report the result as it
 *      is: ok, broken where, or unknown when the walk could not run — an
 *      export never implies a check that did not happen;
 *   2. write one chained audit row saying who exported what, in its own
 *      transaction, BEFORE the package is sent; when that row cannot be
 *      written the export is refused and nothing leaves (§11.10(e): an export
 *      is itself an event on the record).
 *
 * @compliance 21 CFR Part 11 §11.10(b), (e); EU Annex 11 §9.
 * @module server/services/audit/audited-export
 */

import type { Response } from 'express';

import { writeChainedAuditRow } from '../auditService.js';
import type { ChainBreak } from './chain.js';
import { verifyTenantChainOnAdminScope } from './tenant-chain-verdict.js';

type ConnectablePool = {
  connect: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown>; release: () => void }>;
};

export type TenantChainVerdict = { ok: boolean | null; rowsChecked?: number; brokenAt?: unknown; reason?: string };

/** What an export may say about where another organization's row is involved. */
const ANOTHER_ORGANIZATION = 'another organization';

/**
 * A chain break as this organization may read it. The walk loads other
 * organizations' legacy rows as context, so the break it reports can name one
 * of their rows — the broken row, or the row its hash commits to — by id and
 * organization number. That is theirs, not the exporter's (DP-44, 2026-09-29):
 * a row of this organization is named, one of another is only said to be.
 */
export function breakForTenant(orgId: number, b: ChainBreak): Record<string, unknown> {
  const own = b.tenantId === orgId;
  const to = b.commitsTo;
  return {
    segment: b.segment,
    ...(own ? { id: b.id, expected: b.expected, stored: b.stored } : { row: ANOTHER_ORGANIZATION }),
    commitsTo: to == null || to === 'genesis' ? to : to.tenantId === orgId ? { id: to.id } : ANOTHER_ORGANIZATION,
  };
}

/**
 * What a walk over no chained rows says. chain.ts walkAuditChain answers
 * `ok: true, rowsChecked: 0` for it; nothing was checked, so it is not a
 * verdict (review round 1, 2026-10-01).
 */
export const NO_CHAINED_ROWS_REASON = 'No chained rows exist for this organisation, so there is no chain to verify.';

/**
 * The tenant's whole audit chain, walked now; `ok: null` when the walk could
 * not run, and when there was nothing to walk.
 */
export async function walkTenantChain(orgId: number): Promise<TenantChainVerdict> {
  try {
    const walk = await verifyTenantChainOnAdminScope(orgId);
    if (walk.ok && walk.rowsChecked === 0) return { ok: null, rowsChecked: 0, reason: NO_CHAINED_ROWS_REASON };
    return { ok: walk.ok, rowsChecked: walk.rowsChecked, ...(walk.brokenAt ? { brokenAt: breakForTenant(orgId, walk.brokenAt) } : {}) };
  } catch (err) {
    console.error('[audited-export] tenant chain walk failed:', (err as Error)?.message);
    return { ok: null, reason: 'The audit chain could not be walked at export time.' };
  }
}

/**
 * Record the export on the chain, then send the package as a JSON download.
 * Answers 503 and sends nothing when the export row cannot be written.
 */
export async function sendAuditedExport(
  pool: ConnectablePool,
  res: Response,
  e: {
    tenantId: number;
    userId: number | string | null | undefined;
    action: string;
    resourceType: string;
    resourceId: string;
    details: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    filename: string;
    headers?: Record<string, string>;
    body: unknown;
    refusalCode: string;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await writeChainedAuditRow(client, {
      tenantId: e.tenantId,
      userId: e.userId ?? undefined,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      details: e.details,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[audited-export] export not recorded:', (err as Error)?.message);
    res.status(503).json({
      success: false,
      error: {
        code: e.refusalCode,
        message: 'The export was refused because it could not be recorded in the audit trail. Nothing was exported.',
      },
    });
    return;
  } finally {
    client.release();
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${e.filename}"`);
  for (const [k, v] of Object.entries(e.headers ?? {})) res.setHeader(k, v);
  res.send(JSON.stringify(e.body, null, 2));
}
