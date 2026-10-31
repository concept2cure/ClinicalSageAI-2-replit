/**
 * The audit integrity sweep's per-organisation verdicts (P-72 slice 1b,
 * 2026-10-30; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/): one
 * organisation's audit_logs chain and seals and its audit_events links and
 * seals, each read on a connection in that organisation's own scope, and the
 * merge of every organisation's verdict into one verdict per store. Split from
 * auditChainIntegritySweep.ts, which lists the organisations, opens each one's
 * scope, verifies the stores with no tenant key, anchors and reports.
 *
 * @module server/jobs/auditChainOrganizationVerdicts
 */

import { verifyAuditEventsChainSeals, type PoolClient } from '../services/audit/chain.js';
import { verifyAuditIntegrity } from '../services/audit/audit-integrity-service.js';
import {
  summarizeChainLinkage,
  type AuditEventChainRow,
} from '../services/audit/chainIntegrityMonitor.js';
import type {
  AuditChainCheckResult,
  AuditStoreName,
  AuditStoreStatus,
  AuditStoreVerdict,
} from './auditChainIntegritySweep.js';

/** Run one store's verifier; a throw is that store's `error`, not the sweep's. */
export async function guarded(
  store: AuditStoreName,
  fn: () => Promise<AuditStoreVerdict>,
): Promise<AuditStoreVerdict> {
  try {
    return await fn();
  } catch (err) {
    return { store, status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Most severe first: a merged store takes the worst organisation's status.
 * An organisation with no row in a store contributes no verdict (null).
 */
const SEVERITY: readonly AuditStoreStatus[] = ['broken', 'missing', 'error', 'stale', 'unverifiable', 'ok'];

/** One organisation's verdict on a store, or null when it has no row there. */
interface OrganizationVerdict {
  organizationId: number;
  verdict: AuditStoreVerdict | null;
}

/**
 * One store's verdict over every organisation: the worst status, the rows
 * checked summed, and the first worst organisation's failure and reason. A
 * store in which no organisation has a row verified nothing: `unverifiable`
 * with `nothing`, never ok.
 */
export function mergeOrganizationVerdicts(store: AuditStoreName, perOrganization: OrganizationVerdict[], nothing: string): AuditStoreVerdict {
  const found = perOrganization.filter((o): o is { organizationId: number; verdict: AuditStoreVerdict } => o.verdict !== null);
  if (found.length === 0) return { store, status: 'unverifiable', rowsChecked: 0, reason: nothing };
  const worst = SEVERITY.find((status) => found.some((o) => o.verdict.status === status)) ?? 'error';
  const first = found.find((o) => o.verdict.status === worst)!;
  const rowsChecked = found.reduce((n, o) => n + (o.verdict.rowsChecked ?? 0), 0);
  const others = found.filter((o) => o.verdict.status === worst).length - 1;
  const reason = first.verdict.reason === undefined
    ? undefined
    : others > 0 ? `${first.verdict.reason} (and ${others} other organisation(s))` : first.verdict.reason;
  return {
    store,
    status: worst,
    rowsChecked,
    ...(first.verdict.firstFailure === undefined ? {} : { firstFailure: first.verdict.firstFailure }),
    ...(worst === 'ok' ? {} : { organizationId: first.organizationId }),
    ...(reason === undefined ? {} : { reason }),
  };
}

/** The chain walk refused a tenant-scoped connection: this organisation's legacy rows link across tenants. */
function isPartialView(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'AUDIT_CHAIN_PARTIAL_VIEW';
}

/** One organisation's audit_logs chain and seals; their verdicts are null when it has no chained row. */
interface OrganizationAuditLogs {
  chain: AuditStoreVerdict | null;
  seals: AuditStoreVerdict | null;
  rowsChecked: number;
  brokenAt?: AuditChainCheckResult['brokenAt'];
}

/** audit_logs: one organisation's sha256 chain and HMAC seals, through the canonical integrity service. */
async function verifyAuditLogsStore(client: PoolClient, organizationId: number): Promise<OrganizationAuditLogs> {
  try {
    const integrity = await verifyAuditIntegrity(client, { tenantId: organizationId });
    const rowsChecked = integrity.chain.rowsChecked;
    if (rowsChecked === 0 && integrity.chain.ok) return { chain: null, seals: null, rowsChecked: 0 };
    const chain: AuditStoreVerdict = integrity.chain.ok
      ? { store: 'audit_logs.chain', status: 'ok', rowsChecked }
      : {
          store: 'audit_logs.chain',
          status: 'broken',
          rowsChecked,
          firstFailure: integrity.chain.brokenAt?.id,
          reason: 'sha256_chain mismatch',
        };
    const s = integrity.seals;
    const seals: AuditStoreVerdict = !s.checked
      ? { store: 'audit_logs.seals', status: 'unverifiable', reason: s.reason }
      : !s.valid
        ? {
            store: 'audit_logs.seals',
            status: 'broken',
            firstFailure: String(s.brokenAt),
            reason: 'hmac_seal does not verify',
          }
        : s.unsealedAfterSealed > 0
          ? {
              store: 'audit_logs.seals',
              status: 'unverifiable',
              rowsChecked: s.verified,
              firstFailure: s.firstUnsealedAfterSealed ?? undefined,
              reason: `${s.unsealedAfterSealed} row(s) written after sealing began carry no hmac_seal; their seals could not be verified`,
            }
          : {
              store: 'audit_logs.seals',
              status: 'ok',
              rowsChecked: s.verified,
              ...(s.unsealed > 0
                ? { reason: `${s.unsealed} row(s) predate sealing and are covered by the sha256 chain only` }
                : {}),
            };
    const brokenAt = integrity.chain.brokenAt
      ? {
          id: integrity.chain.brokenAt.id,
          expected: integrity.chain.brokenAt.expected,
          stored: integrity.chain.brokenAt.stored,
        }
      : undefined;
    return { chain, seals, rowsChecked, brokenAt };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Legacy rows linked across tenants: not tampering, and not verified either.
    const status: AuditStoreStatus = isPartialView(err) ? 'unverifiable' : 'error';
    return {
      chain: { store: 'audit_logs.chain', status, reason },
      seals: { store: 'audit_logs.seals', status, reason },
      rowsChecked: 0,
    };
  }
}

const NO_AUDIT_EVENTS = 'no entries: there is no chain to verify';

/** audit_events: one organisation's linkage (the monitor's walk); null when it has no row. */
async function verifyAuditEventsLinkage(client: PoolClient, organizationId: number): Promise<AuditStoreVerdict | null> {
  const verdict = await guarded('audit_events.linkage', async () => {
    const { rows } = await client.query(
      `SELECT id, organization_id, sequence_number, record_hash, previous_hash
         FROM audit_events
        WHERE organization_id = $1
        ORDER BY organization_id, sequence_number ASC`,
      [organizationId],
    );
    const { broken, hashedEntries, unhashedEntries } = summarizeChainLinkage(
      rows as unknown as AuditEventChainRow[],
    );
    const rowsChecked = rows.length;
    if (broken.length > 0) {
      return {
        store: 'audit_events.linkage',
        status: 'broken',
        rowsChecked,
        firstFailure: String(broken[0].id),
        reason: `${broken.length} broken link(s)`,
      };
    }
    // Precedence as the monitor applies it: a break outranks "cannot tell",
    // and "cannot tell" outranks ok. Only a chain in which EVERY row carried a
    // record_hash may be called verified (WO-16C finding 72).
    if (rowsChecked === 0) {
      return { store: 'audit_events.linkage', status: 'unverifiable', rowsChecked, reason: NO_AUDIT_EVENTS };
    }
    if (hashedEntries === 0) {
      return {
        store: 'audit_events.linkage',
        status: 'unverifiable',
        rowsChecked,
        reason: 'no row carries a record_hash: the chain has never been hashed, so no link could be checked',
      };
    }
    if (unhashedEntries > 0) {
      return {
        store: 'audit_events.linkage',
        status: 'unverifiable',
        rowsChecked,
        reason: `${unhashedEntries} of ${rowsChecked} rows carry no record_hash; the links through them could not be checked`,
      };
    }
    return { store: 'audit_events.linkage', status: 'ok', rowsChecked };
  });
  // An organisation with no audit_events row has no chain: it neither passes nor fails the store.
  return verdict.status === 'unverifiable' && verdict.rowsChecked === 0 && verdict.reason === NO_AUDIT_EVENTS ? null : verdict;
}

/** audit_events: one organisation's HMAC seals; null when it has no chained row. */
async function verifyAuditEventsSeals(client: PoolClient, organizationId: number): Promise<AuditStoreVerdict | null> {
  let empty = false;
  const verdict = await guarded('audit_events.seals', async () => {
    const result = await verifyAuditEventsChainSeals(client, { organizationId });
    if (!result.valid) {
      return {
        store: 'audit_events.seals',
        status: 'broken',
        firstFailure: String(result.brokenAt),
        reason: 'hmac_seal does not verify',
      };
    }
    if (result.verified === 0 && result.unsealed === 0) empty = true;
    // Rows exist and none is sealed: the audit_events seal writer has not
    // shipped (migrations 20260617_audit_events_hmac_seal.sql), so nothing was
    // verified. This read "ok" every day.
    if (result.verified === 0 && result.unsealed > 0) {
      return {
        store: 'audit_events.seals',
        status: 'unverifiable',
        rowsChecked: 0,
        reason: `none of the ${result.unsealed} chained rows carries an hmac_seal, so no seal was verified`,
      };
    }
    if (result.unsealedAfterSealed > 0) {
      return {
        store: 'audit_events.seals',
        status: 'unverifiable',
        rowsChecked: result.verified,
        firstFailure: result.firstUnsealedAfterSealed ?? undefined,
        reason: `${result.unsealedAfterSealed} row(s) written after their organisation's sealing began carry no hmac_seal`,
      };
    }
    return { store: 'audit_events.seals', status: 'ok', rowsChecked: result.verified };
  });
  return empty ? null : verdict;
}

/** One organisation's verdicts on every per-organisation store, read on one snapshot in its own scope. */
export interface OrganizationSweep {
  organizationId: number;
  auditLogs: OrganizationAuditLogs;
  linkage: AuditStoreVerdict | null;
  eventSeals: AuditStoreVerdict | null;
}

export async function verifyOrganization(
  client: PoolClient,
  organizationId: number,
  auditEvents: { present: boolean; sealKey: boolean },
): Promise<OrganizationSweep> {
  const auditLogs = await verifyAuditLogsStore(client, organizationId);
  const linkage = auditEvents.present ? await verifyAuditEventsLinkage(client, organizationId) : null;
  const eventSeals = auditEvents.present && auditEvents.sealKey ? await verifyAuditEventsSeals(client, organizationId) : null;
  return { organizationId, auditLogs, linkage, eventSeals };
}

/** The audit_events verdicts over every organisation, or why the store could not be read at all. */
export function auditEventsVerdicts(
  perOrganization: OrganizationSweep[],
  auditEvents: { present: boolean; sealKey: boolean },
): AuditStoreVerdict[] {
  if (!auditEvents.present) {
    const reason = 'table absent';
    return [
      { store: 'audit_events.linkage', status: 'missing', reason },
      { store: 'audit_events.seals', status: 'missing', reason },
    ];
  }
  const linkage = mergeOrganizationVerdicts(
    'audit_events.linkage',
    perOrganization.map((o) => ({ organizationId: o.organizationId, verdict: o.linkage })),
    NO_AUDIT_EVENTS,
  );
  const seals: AuditStoreVerdict = !auditEvents.sealKey
    ? { store: 'audit_events.seals', status: 'unverifiable', reason: 'AUDIT_HMAC_KEY not configured; HMAC seals cannot be verified' }
    : mergeOrganizationVerdicts(
        'audit_events.seals',
        perOrganization.map((o) => ({ organizationId: o.organizationId, verdict: o.eventSeals })),
        'no organisation has a chained audit_events row, so no seal was verified',
      );
  return [linkage, seals];
}
