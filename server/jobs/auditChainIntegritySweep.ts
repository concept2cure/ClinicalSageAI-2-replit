/**
 * Audit integrity sweep.
 *
 * The scheduled tamper-evidence check on every immutable audit store, and the
 * counterpart of the on-demand verifier (scripts/ops/verify-audit-chain.mjs)
 * and the /api/c2c/actions/verify-chain endpoint. It satisfies the ISO 14971
 * control of a periodic (daily) tamper-evidence check on the audit trail
 * (RA-CORTEX-001 §9.1) and 21 CFR Part 11 §11.10(e).
 *
 * What one run verifies — the SAME exported verifiers the writers and the
 * on-demand tool share, not a second transcription of any recipe:
 *
 *   audit_logs.chain          sha256_chain re-derived (chain.ts verifyAuditChain)
 *   audit_logs.seals          hmac_seal under AUDIT_HMAC_KEY
 *                             (audit-integrity-service.ts verifyAuditIntegrity,
 *                             which fails closed to "unverifiable" without the key)
 *   audit_logs.anchor         every organisation's chain head against the latest
 *                             anchor in the object-locked evidence bucket
 *                             (chain-anchor.ts verifyAuditChainAnchor)
 *   audit_events.linkage      previous_hash → record_hash per org
 *                             (chainIntegrityMonitor.ts summarizeChainLinkage)
 *   audit_events.seals        hmac_seal under AUDIT_HMAC_KEY (chain.ts)
 *   audit.tamper_proof_log    previous_hash / content_hash / chain_hash and the
 *                             HMAC signature under AUDIT_HMAC_SECRET
 *                             (tamper-proof-audit.ts verifyTamperProofLogRows)
 *   immutability_triggers     every append-only trigger present and enabled
 *                             (audit-immutability-triggers.ts)
 *
 * Until 2026-09-25 this job called verifyAuditChain alone, so a broken seal,
 * a tampered tamper_proof_log row, a broken audit_events link or a dropped
 * trigger were never reported by the daily check (security audit 2026-09-24
 * findings DP-06 and DP-04; plan item P0-8a).
 *
 * The chain head is anchored OUTSIDE the database (finding DP-04, plan P0-8):
 * the walk proves each row derives from the one before it, and a chain whose
 * newest rows were removed still does. After every store is verified, a run
 * that found no incident writes every organisation's head to the evidence
 * bucket named by AUDIT_ANCHOR_BUCKET (chain-anchor.ts writeAuditChainAnchor);
 * the next run checks the database against it first. A run that found an
 * incident writes nothing, so the last good anchor stays the reference and a
 * tampered state is never anchored. Without AUDIT_ANCHOR_BUCKET the anchor is
 * `unverifiable` ("anchor not configured"), in production as everywhere: never
 * ok. On demand: runAuditChainIntegrityCheck() runs the same verify-then-anchor.
 * An anchor that is `unverifiable` because the archive door removed rows since
 * it does not block the next anchor: otherwise one legitimate archive batch
 * would stop anchoring for good. What may reach `unverifiable` that way is
 * bounded by the verifier, not here: only ledger rows the door could have
 * written count, and no head inside the 24-month hot window is ever excused
 * (chain-anchor.ts archiveAllowance; finding DP-68, fix round 2026-10-01).
 *
 * The anchor's age (P0-8 follow-up, 2026-10-01). Rows written after the latest
 * anchor can be removed without any anchor showing it until the next one is
 * written, so an old anchor is a wide undetectable window. Every run reports
 * the latest anchor's age (`anchorAge`, and in the log line), and an anchor
 * older than ANCHOR_STALE_AFTER_HOURS is `stale`: an incident, alerted like
 * any other. Before this, a deployment whose anchor writes kept failing
 * reported `ok` against an ever older anchor, and only the failed write's own
 * error line said so. A stale anchor does not block the next anchor: the run
 * verified every head it names, and writing today's anchor is what closes the
 * window again. Another incident still blocks it.
 *
 * Three outcomes per store, not two: `ok`, an incident (`broken`, `missing`,
 * `error`, `stale`), or `unverifiable` — the store could not be positively
 * verified (no seal key, no hashed rows). An incident raises the alert path: an error
 * log line, `process.emitWarning`, and the `[SECURITY]` webhook
 * (security-alerts.ts) with counts and the first failing identifier, never row
 * content. Unverifiable is logged as a warning and is never reported as ok.
 *
 * Each organisation in its own scope (P-72 slice 1b, 2026-10-30;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). Until then one pooled
 * connection, in the system scope, sent every statement outside a
 * transaction, and the pool applies a scope only when a transaction begins:
 * the connection saw no tenant, connectionIsTenantScoped said so, and on a
 * production-shaped database the sweep answered ok:false over 0 rows every
 * day, with the platform arm or without it. Now the organisations are listed
 * (an open read), and each one's audit_logs chain, seals and anchored head,
 * and its audit_events links and seals, are verified on a read-only snapshot
 * in that organisation's own scope (runWithOrgJobScope), where its policies
 * admit every one of its rows and nothing of another's; the verdicts are
 * merged per store, and `organizationId` names where the worst one was found
 * (auditChainOrganizationVerdicts.ts).
 * Only the stores with no tenant key (audit.tamper_proof_log, the triggers,
 * the archive ledger) are read on the infrastructure connection, itself inside
 * a transaction. Not verified here: audit_logs rows with no tenant, which no
 * organisation's scope admits, and an organisation's legacy (pre-chain_seq)
 * rows, which link across tenants: the walk refuses them on a tenant-scoped
 * connection, so that organisation's chain and seals are `unverifiable`. Both
 * wait for the platform door the design names for the cross-tenant walk
 * (docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md §3.4). A store in which
 * no organisation has a row is `unverifiable`, never ok: nothing was verified.
 *
 * Read-only and defensive: every store is checked even when another fails,
 * and nothing is thrown, so the sweep cannot affect request handling. Part 11
 * tamper-evidence monitoring defaults ON in production (opt out explicitly
 * with ENABLE_AUDIT_CHAIN_CHECK=false); outside production it stays opt-in so
 * default dev/test boot is unchanged. The gating matrix lives in
 * resolveAuditChainSweepPosture (server/startup/audit-enforcement.ts), shared
 * with the boot gate that refuses AUDIT_REQUIRE_ENFORCE=true without it.
 *
 * @module server/jobs/auditChainIntegritySweep
 */

import cron from 'node-cron';
import { pool } from '../db.js';
import type { PoolClient } from '../services/audit/chain.js';
import { assertAuditImmutabilityTriggers } from '../services/audit/audit-immutability-triggers.js';
import { verifyTamperProofLogRows, type TamperProofLogRow } from '../lib/tamper-proof-audit.js';
import {
  resolveAuditAnchorStore,
  verifyAuditChainAnchor,
  writeAuditChainAnchor,
  type AnchorBreak,
  type AuditAnchorStore,
  type InOrganizationScope,
} from '../services/audit/chain-anchor.js';
import {
  auditEventsVerdicts,
  guarded,
  mergeOrganizationVerdicts,
  verifyOrganization,
  type OrganizationSweep,
} from './auditChainOrganizationVerdicts.js';
import { reportSecurityAlert } from '../services/security-alerts.js';
import { resolveAuditChainSweepPosture } from '../startup/audit-enforcement.js';
import { createScopedLogger } from '../utils/logger.js';
import { runWithOrgJobScope, runWithSystemTenantScope } from '../db/tenantStore';
import { runScheduledOncePerWindow, windowKeyOf } from '../db/scheduledOnce';

const CALLER = 'audit-chain-integrity-sweep';
const logger = createScopedLogger('audit-chain-integrity');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Past this, the latest anchor is `stale`: an incident (P0-8 follow-up). The sweep runs daily. */
export const ANCHOR_STALE_AFTER_HOURS = 48;

export type AuditStoreName =
  | 'audit_logs.chain'
  | 'audit_logs.seals'
  | 'audit_logs.anchor'
  | 'audit_events.linkage'
  | 'audit_events.seals'
  | 'audit.tamper_proof_log'
  | 'immutability_triggers';

/**
 * ok            positively verified
 * broken        a re-derivation, link, seal or signature did not match
 * missing       the store, or a trigger protecting it, does not exist
 * error         the verifier threw — the store was NOT checked
 * stale         the anchor verified, but it is older than
 *               ANCHOR_STALE_AFTER_HOURS: rows written since it are covered by
 *               no anchor (audit_logs.anchor only)
 * unverifiable  the store could not be positively verified (no key, no hashed
 *               rows); not an incident, never a pass
 */
export type AuditStoreStatus = 'ok' | 'broken' | 'missing' | 'error' | 'stale' | 'unverifiable';

export interface AuditStoreVerdict {
  store: AuditStoreName;
  status: AuditStoreStatus;
  rowsChecked?: number;
  /** The first failing identifier — a row id, a sequence number, an index, a trigger name. Never content. */
  firstFailure?: string;
  /** For a store verified per organisation: the organisation the verdict's firstFailure and reason come from. */
  organizationId?: number;
  reason?: string;
}

/** How old the latest anchor was when this run verified against it. */
export interface AnchorAge {
  anchorKey: string;
  anchoredAt: string;
  /** Hours from anchoredAt to this run, to one decimal. */
  hours: number;
  staleAfterHours: number;
}

/** What the anchor step did after the stores were verified. */
export interface AnchorWriteOutcome {
  written: boolean;
  key?: string;
  organizations?: number;
  reason?: string;
}

export interface AuditChainCheckResult {
  /** True only when EVERY store is `ok`. */
  ok: boolean;
  /** audit_logs chain rows verified (kept for the existing consumers). */
  rowsChecked: number;
  /** The audit_logs chain break, when there is one (kept for the existing consumers). */
  brokenAt?: { id: string; expected: string; stored: string };
  /** Set when the sweep itself could not run (no connection). */
  error?: string;
  /** Organisations whose stores were verified, each in its own scope. */
  organizations?: number;
  stores: AuditStoreVerdict[];
  /** Stores whose status is an incident: broken, missing or error. */
  failures: AuditStoreName[];
  /** Stores that could not be positively verified. */
  unverifiable: AuditStoreName[];
  /** The chain-head anchor this run wrote, or why it wrote none. */
  anchorWrite?: AnchorWriteOutcome;
  /** The latest anchor's age; null when there was none to read (not configured, not yet written, unreadable). */
  anchorAge?: AnchorAge | null;
}

export interface AuditChainCheckOptions {
  /** Where anchors live. Omitted: resolved from AUDIT_ANCHOR_BUCKET; null: not configured. */
  anchorStore?: AuditAnchorStore | null;
}

const INCIDENT_STATUSES: ReadonlySet<AuditStoreStatus> = new Set(['broken', 'missing', 'error', 'stale']);

async function tableExists(client: PoolClient, qualified: string): Promise<boolean> {
  const r = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [qualified]);
  return r.rows[0]?.present === true;
}

/** audit.tamper_proof_log: the Part 11 store, walked with the writer's own pure verifier. */
async function verifyTamperProofStore(client: PoolClient): Promise<AuditStoreVerdict> {
  const store = 'audit.tamper_proof_log';
  return guarded(store, async () => {
    if (!(await tableExists(client, store))) {
      return {
        store,
        status: 'missing',
        reason: 'table absent — db/migrations/20260813_audit_tamper_proof_log.sql has not been applied',
      };
    }
    // The signing secret exactly as the writer resolves it. No development
    // fallback here: a chain verified under a guessed secret is not verified.
    const hmacSecret = (process.env.AUDIT_HMAC_SECRET ?? '').trim();
    if (!hmacSecret) {
      return {
        store,
        status: 'unverifiable',
        reason: 'AUDIT_HMAC_SECRET not configured; chain signatures cannot be verified',
      };
    }
    // Read-only on purpose: TamperProofAuditLog.verifyChain appends an
    // AUDIT_VERIFICATION_PASSED row on success; a daily sweep must not write.
    const { rows } = await client.query(
      'SELECT * FROM audit.tamper_proof_log ORDER BY sequence_number ASC',
    );
    const walked = verifyTamperProofLogRows(rows as unknown as TamperProofLogRow[], { hmacSecret });
    const rowsChecked = rows.length;
    if (!walked.valid) {
      return {
        store,
        status: 'broken',
        rowsChecked,
        firstFailure: walked.firstInvalidEntry === undefined ? undefined : String(walked.firstInvalidEntry),
        reason: walked.invalidReason,
      };
    }
    return { store, status: 'ok', rowsChecked };
  });
}

const ANCHOR_NOT_CONFIGURED =
  'anchor not configured: AUDIT_ANCHOR_BUCKET is unset, so nothing outside the database records the ' +
  'chain head and removal of the newest audit rows cannot be detected';

function describeAnchorBreak(b: AnchorBreak): string {
  const now = b.currentRows === null ? 'an uncountable number' : String(b.currentRows);
  return `organization ${b.organizationId}: ${b.kind} (${b.anchoredRows} rows anchored at or before the head, ${now} now)`;
}

/** The latest anchor's age on this run's clock, or null when no anchor was read. */
function anchorAgeOf(anchorKey: string | null, anchoredAt: string | null): AnchorAge | null {
  const at = anchoredAt === null ? NaN : Date.parse(anchoredAt);
  if (anchorKey === null || anchoredAt === null || Number.isNaN(at)) return null;
  const hours = Math.round((Date.now() - at) / (HOUR_MS / 10)) / 10;
  return { anchorKey, anchoredAt, hours, staleAfterHours: ANCHOR_STALE_AFTER_HOURS };
}

/**
 * audit_logs against the latest chain-head anchor in the evidence bucket (P0-8,
 * DP-04), and how old that anchor is. Each anchored head is compared in its own
 * organisation's scope (`inScope`); `client` reads only the archive ledger.
 */
async function verifyAnchorStore(
  client: PoolClient,
  anchorStore: AuditAnchorStore | null,
  inScope: InOrganizationScope,
): Promise<{ verdict: AuditStoreVerdict; age: AnchorAge | null }> {
  const store = 'audit_logs.anchor';
  if (!anchorStore) return { verdict: { store, status: 'unverifiable', reason: ANCHOR_NOT_CONFIGURED }, age: null };
  let age: AnchorAge | null = null;
  const verdict = await guarded(store, async () => {
    const v = await verifyAuditChainAnchor(client, anchorStore, new Date(), { inOrganizationScope: inScope });
    age = anchorAgeOf(v.anchorKey, v.anchoredAt);
    if (v.status === 'broken') {
      return { store, status: 'broken', firstFailure: v.breaks[0]?.rowId, reason: v.breaks.map(describeAnchorBreak).join('; ') };
    }
    if (v.status === 'not_anchored') return { store, status: 'unverifiable', reason: `not verified: ${v.reason}` };
    const archived = v.archived.length ? `: ${v.archived.map(describeAnchorBreak).join('; ')}` : '';
    const found = v.status === 'ok'
      ? `verified against ${v.anchorKey} (${v.organizations} organisation(s), anchored ${v.anchoredAt}, ${age?.hours} hour(s) old)`
      : `${v.reason}${archived}`;
    // Strictly older than the limit: an anchor exactly 48 hours old is not yet stale.
    if (age !== null && Date.now() - Date.parse(age.anchoredAt) > ANCHOR_STALE_AFTER_HOURS * HOUR_MS) {
      return {
        store,
        status: 'stale',
        reason:
          `latest anchor is ${age.hours} hour(s) old, past the ${ANCHOR_STALE_AFTER_HOURS}-hour limit: rows written since ` +
          `${age.anchoredAt} are covered by no anchor, so their removal would not be seen; ${found}`,
      };
    }
    return { store, status: v.status === 'ok' ? 'ok' : 'unverifiable', reason: found };
  });
  return { verdict, age };
}

/**
 * Anchor every organisation's head, only over a run that found no incident.
 * `blocking` is every incident but a stale anchor: today's anchor is what ends
 * that one. Each head is read in its own organisation's scope; `at` is taken
 * before the first is read (chain-anchor.ts writeAuditChainAnchor).
 */
async function writeAnchor(
  client: PoolClient,
  anchorStore: AuditAnchorStore | null,
  failures: AuditStoreName[],
  organizations: readonly number[],
  inScope: InOrganizationScope,
): Promise<AnchorWriteOutcome> {
  if (!anchorStore) return { written: false, reason: ANCHOR_NOT_CONFIGURED };
  if (failures.length > 0) {
    return {
      written: false,
      reason: `not written: the sweep found an incident in ${failures.join(', ')}; the previous anchor stays the reference`,
    };
  }
  try {
    const written = await writeAuditChainAnchor(client, anchorStore, new Date(), { inOrganizationScope: inScope, organizations });
    return { written: true, key: written.key, organizations: written.organizations };
  } catch (err) {
    const reason = `anchor write failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`Audit chain head NOT anchored to ${anchorStore.location}: ${reason}`);
    return { written: false, reason };
  }
}

/** The append-only triggers on every store above. */
async function verifyImmutabilityTriggers(client: PoolClient): Promise<AuditStoreVerdict> {
  const store = 'immutability_triggers';
  return guarded(store, async () => {
    const report = await assertAuditImmutabilityTriggers(client);
    if (report.ok) {
      return { store, status: 'ok', rowsChecked: report.present };
    }
    const parts: string[] = [];
    if (report.missing.length) parts.push(`missing: ${report.missing.join(', ')}`);
    if (report.disabled.length) parts.push(`disabled: ${report.disabled.join(', ')}`);
    if (report.tablesAbsent.length) parts.push(`tables absent: ${report.tablesAbsent.join(', ')}`);
    return {
      store,
      status: 'missing',
      rowsChecked: report.present,
      firstFailure: report.missing[0] ?? report.disabled[0],
      reason: parts.join('; '),
    };
  });
}

/** Log the outcome; an incident also raises the alert path. Counts and identifiers only. */
function reportSweepOutcome(
  stores: AuditStoreVerdict[],
  failures: AuditStoreName[],
  unverifiable: AuditStoreName[],
  { anchorWrite, anchorAge }: { anchorWrite: AnchorWriteOutcome; anchorAge: AnchorAge | null },
  verifiedSummary: string,
): void {
  const summary = stores.map(({ store, status, rowsChecked, firstFailure, reason }) => ({
    store,
    status,
    ...(rowsChecked === undefined ? {} : { rowsChecked }),
    ...(firstFailure === undefined ? {} : { firstFailure }),
    ...(reason === undefined ? {} : { reason }),
  }));

  if (failures.length > 0) {
    // A break is a data-integrity incident: surface loudly for alerting.
    logger.error(
      `AUDIT INTEGRITY FAILURE in ${failures.join(', ')} — investigate immediately`,
      { failures, stores: summary, anchorWrite, anchorAge },
    );
    process.emitWarning(
      `Audit integrity sweep failed: ${failures.join(', ')}`,
      'AuditChainIntegrity',
    );
    reportSecurityAlert({
      kind: 'audit_integrity_sweep_failed',
      message: `Daily audit integrity sweep failed for ${failures.join(', ')}`,
      detail: { failures, unverifiable, stores: summary },
    });
  } else if (unverifiable.length > 0) {
    logger.warn(
      `Audit integrity sweep NOT fully verified: ${unverifiable.join(', ')} could not be checked`,
      { unverifiable, stores: summary, anchorWrite, anchorAge },
    );
  } else {
    logger.info(`Every audit store verified (${verifiedSummary})`, { anchorWrite, anchorAge });
  }
}

/**
 * A read-only snapshot on one pooled connection, in the caller's scope: the
 * pool applies that scope when the transaction begins. Every statement the
 * sweep sends is inside one; outside a transaction the pool applies none.
 */
async function onSnapshot<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let rollbackFailed: Error | undefined;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      return await fn(client as unknown as PoolClient);
    } finally {
      await client.query('ROLLBACK').catch((err: unknown) => {
        rollbackFailed = err instanceof Error ? err : new Error(String(err));
      });
    }
  } finally {
    // A connection whose transaction could not be ended is not returned to the pool.
    client.release(rollbackFailed);
  }
}

/** `fn` on a read-only snapshot in ONE organisation's own scope: its tenant id, no role. */
const inOrganizationSnapshot: InOrganizationScope = (organizationId, fn) =>
  runWithOrgJobScope(organizationId, CALLER, () => onSnapshot(fn));

/** Every organisation, from `organizations`, whose read policy is open; purged ones keep their row and their audit trail. */
async function listOrganizations(): Promise<number[]> {
  return runWithSystemTenantScope(CALLER, () =>
    onSnapshot(async (client) => {
      const { rows } = await client.query('SELECT id FROM public.organizations ORDER BY id');
      return rows.map((r) => Number(r.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    }),
  );
}

/**
 * One sweep: every organisation's stores, each in its own scope, then the
 * stores with no tenant key on `client` (the infrastructure scope), then the
 * anchor of a clean state.
 */
async function sweepOnce(
  client: PoolClient,
  organizations: readonly number[],
  anchorStore: AuditAnchorStore | null,
): Promise<AuditChainCheckResult> {
  const auditEventsShape = {
    present: await tableExists(client, 'public.audit_events'),
    sealKey: Boolean(process.env.AUDIT_HMAC_KEY),
  };
  const perOrganization: OrganizationSweep[] = [];
  for (const organizationId of organizations) {
    perOrganization.push(
      await inOrganizationSnapshot(organizationId, (c) => verifyOrganization(c, organizationId, auditEventsShape)),
    );
  }
  const nothing = organizations.length === 0
    ? 'no organisation exists, so no audit_logs row was verified'
    : 'no organisation has a chained audit_logs row, so nothing was verified';
  const auditLogsVerdicts: [AuditStoreVerdict, AuditStoreVerdict] = [
    mergeOrganizationVerdicts('audit_logs.chain', perOrganization.map((o) => ({ organizationId: o.organizationId, verdict: o.auditLogs.chain })), nothing),
    mergeOrganizationVerdicts('audit_logs.seals', perOrganization.map((o) => ({ organizationId: o.organizationId, verdict: o.auditLogs.seals })), nothing),
  ];
  const rowsChecked = perOrganization.reduce((n, o) => n + o.auditLogs.rowsChecked, 0);
  const brokenAt = perOrganization.find((o) => o.auditLogs.brokenAt)?.auditLogs.brokenAt;

  const anchor = await verifyAnchorStore(client, anchorStore, inOrganizationSnapshot);
  const auditEvents = auditEventsVerdicts(perOrganization, auditEventsShape);
  const tamperProof = await verifyTamperProofStore(client);
  const triggers = await verifyImmutabilityTriggers(client);

  const stores: AuditStoreVerdict[] = [...auditLogsVerdicts, anchor.verdict, ...auditEvents, tamperProof, triggers];
  const failures = stores.filter((s) => INCIDENT_STATUSES.has(s.status)).map((s) => s.store);
  const unverifiable = stores.filter((s) => s.status === 'unverifiable').map((s) => s.store);
  const ok = failures.length === 0 && unverifiable.length === 0;
  const blocking = stores.filter((s) => INCIDENT_STATUSES.has(s.status) && s.status !== 'stale').map((s) => s.store);

  // After every store is verified, never before: the anchor records a state
  // this run found no incident in, a stale anchor aside.
  const anchorWrite = await writeAnchor(client, anchorStore, blocking, organizations, inOrganizationSnapshot);

  reportSweepOutcome(
    stores,
    failures,
    unverifiable,
    { anchorWrite, anchorAge: anchor.age },
    `${organizations.length} organisation(s), each in its own scope: ` +
      `audit_logs ${rowsChecked} rows, ` +
      `audit_events ${auditEvents[0].rowsChecked ?? 0} rows, ` +
      `tamper_proof_log ${tamperProof.rowsChecked ?? 0} rows, ` +
      `${triggers.rowsChecked ?? 0} immutability triggers, chain heads anchored`,
  );

  return {
    ok,
    rowsChecked,
    ...(brokenAt ? { brokenAt } : {}),
    organizations: organizations.length,
    stores,
    failures,
    unverifiable,
    anchorWrite,
    anchorAge: anchor.age,
  };
}

/**
 * Run a single sweep over every audit store, then anchor the chain heads.
 * Never throws. The daily schedule calls it; it is also the on-demand entry.
 */
export async function runAuditChainIntegrityCheck(
  options: AuditChainCheckOptions = {},
): Promise<AuditChainCheckResult> {
  const anchorStore = options.anchorStore !== undefined ? options.anchorStore : resolveAuditAnchorStore();
  try {
    const organizations = await listOrganizations();
    return await runWithSystemTenantScope(CALLER, () => onSnapshot((client) => sweepOnce(client, organizations, anchorStore)));
  } catch (err: any) {
    logger.error(`Audit integrity sweep could not run: ${err?.message}`);
    return {
      ok: false,
      rowsChecked: 0,
      error: err?.message,
      stores: [],
      failures: [],
      unverifiable: [],
    };
  }
}

/**
 * Schedule the daily integrity sweep.
 *
 * Part 11 tamper-evidence monitoring must not be silently absent in
 * production: the sweep is read-only (SELECTs only, no locks) and alert-only,
 * so it is safe to default ON. The gating matrix is resolveAuditChainSweepPosture
 * (server/startup/audit-enforcement.ts); with AUDIT_REQUIRE_ENFORCE=true a
 * production boot that disables the sweep is refused there.
 * Default schedule: 02:00 daily (override with AUDIT_CHAIN_CHECK_CRON).
 */
export function startAuditChainIntegritySchedule(): void {
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const posture = resolveAuditChainSweepPosture(process.env);

  if (!posture.enabled) {
    // Boot-posture line: state the decision and the env var that controls it.
    if (isProduction) {
      logger.warn(
        'Audit chain integrity sweep DISABLED in production — Part 11 tamper-evidence monitoring is off',
        posture
      );
    } else {
      logger.info('Audit chain integrity sweep disabled', posture);
    }
    return;
  }

  const expr = process.env.AUDIT_CHAIN_CHECK_CRON || '0 2 * * *';
  try {
    // Every server process schedules this; one check per day across them
    // (U19) — three meant three full scans and three alerts per break.
    cron.schedule(expr, () => {
      void runScheduledOncePerWindow('audit-chain-integrity-sweep', windowKeyOf(DAY_MS), () =>
        runAuditChainIntegrityCheck()
      ).catch(err =>
        logger.error(`Audit chain integrity check failed: ${err?.message ?? String(err)}`)
      );
    });
    logger.info(`Audit chain integrity sweep scheduled (${expr})`, {
      enabled: true,
      controlledBy: posture.controlledBy,
      schedule: expr,
    });
  } catch (err: any) {
    logger.error(`Failed to schedule audit chain integrity sweep: ${err?.message}`);
  }
}
