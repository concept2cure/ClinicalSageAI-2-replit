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
import { verifyTenantChainOnAdminScope, type TenantChainHead } from './tenant-chain-verdict.js';

type ConnectablePool = {
  connect: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown>; release: () => void }>;
};

/**
 * `head` is the chain head against the latest anchor, this organisation's
 * only: verified, broken with its breaks, or a reason beginning "head not
 * verified against the anchor" (tenant-chain-verdict.ts; fix round DP-71).
 */
export type TenantChainVerdict = {
  ok: boolean | null;
  rowsChecked?: number;
  brokenAt?: unknown;
  reason?: string;
  head?: TenantChainHead;
};

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
 * A walk's verdict as this organization may read it: the break redacted to
 * what is its own (breakForTenant), and a walk over no chained rows stated as
 * not verified. The one statement of it for every reader of the tenant chain:
 * the exports and reports here, and the ledger and record-history reads
 * (routes/audit-trail-ledger.routes.ts; reporting review 2026-10-01,
 * SECURITY-8: they returned the raw break and ok:true over nothing).
 */
export function tenantChainVerdict(
  orgId: number,
  walk: { ok: boolean | null; rowsChecked: number; reason?: string; brokenAt?: ChainBreak; head?: TenantChainHead },
): { ok: boolean | null; rowsChecked: number; reason?: string; brokenAt?: Record<string, unknown>; head?: TenantChainHead } {
  // The anchored head is carried as the verifier gave it (this organisation's
  // only); `ok: null` from the verifier is a walk that could not read every
  // chained row (its own reason, P-72 slice 1b) or an anchor that could not be
  // read (the head's reason, fix round DP-72).
  const head = walk.head ? { head: walk.head } : {};
  if (walk.ok === null) {
    return { ok: null, rowsChecked: walk.rowsChecked, reason: walk.reason ?? walk.head?.reason ?? 'The chain head could not be checked against its anchor.', ...head };
  }
  if (walk.ok && walk.rowsChecked === 0) return { ok: null, rowsChecked: 0, reason: NO_CHAINED_ROWS_REASON, ...head };
  return {
    ok: walk.ok,
    rowsChecked: walk.rowsChecked,
    ...(walk.brokenAt ? { brokenAt: breakForTenant(orgId, walk.brokenAt) } : {}),
    ...head,
  };
}

/**
 * The tenant's whole audit chain, walked now; `ok: null` when the walk could
 * not run, when there was nothing to walk, and when the anchor could not be
 * read (the head's reason says so). `head` is carried as the verifier gave it.
 */
export async function walkTenantChain(orgId: number): Promise<TenantChainVerdict> {
  try {
    return tenantChainVerdict(orgId, await verifyTenantChainOnAdminScope(orgId));
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

/**
 * The organisation a sealed package was issued for, as its manifest states it: a signed audit export seals it in
 * `queryFilters.organizationId` (signedAuditExport.ts exportFilters), a compliance report at the top of the
 * manifest (compliance-reports/signed-report.ts). Null when the manifest names no usable organisation. The value
 * is the caller's claim until the seal verifies. On a version-2 manifest it is under the seal, so changing it makes
 * the package invalid. A version-1 manifest (issued before the fix in ledger L55) sealed its top-level fields only,
 * so there the organisation is stated and not sealed, like every other nested claim of that version.
 */
export function manifestOrganizationId(manifest: unknown): number | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as { organizationId?: unknown; queryFilters?: { organizationId?: unknown } | null };
  const stated = m.organizationId ?? m.queryFilters?.organizationId;
  return typeof stated === 'number' && Number.isSafeInteger(stated) && stated > 0 ? stated : null;
}

/**
 * Record that a sealed package was put to the platform's seal key, and what the answer was: one chained row, in
 * its own transaction, written BEFORE the verdict is sent (GA-D6-03). Returns false when the row could not be
 * written; the caller then sends no verdict.
 */
export async function recordExportVerification(
  pool: ConnectablePool,
  e: {
    tenantId: number;
    userId: number | string | null | undefined;
    manifest: { exportId?: unknown; kind?: unknown; dataHash?: unknown };
    verdict: { valid: boolean; errors: string[]; signingKeyId: string | null };
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<boolean> {
  const exportId = typeof e.manifest.exportId === 'string' && e.manifest.exportId ? e.manifest.exportId.slice(0, 128) : 'unnamed';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await writeChainedAuditRow(client, {
      tenantId: e.tenantId,
      userId: e.userId ?? undefined,
      action: 'audit.export_verify',
      resourceType: 'audit_export',
      resourceId: exportId,
      details: {
        exportId,
        kind: typeof e.manifest.kind === 'string' ? e.manifest.kind.slice(0, 64) : 'audit-export',
        dataHash: typeof e.manifest.dataHash === 'string' ? e.manifest.dataHash.slice(0, 128) : null,
        valid: e.verdict.valid,
        errors: e.verdict.errors,
        signingKeyId: e.verdict.signingKeyId,
        description: `Checked the seal of ${exportId}: ${e.verdict.valid ? 'it verifies' : 'it does not verify'}`,
      },
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
    });
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[audited-export] verification not recorded:', (err as Error)?.message);
    return false;
  } finally {
    client.release();
  }
}
