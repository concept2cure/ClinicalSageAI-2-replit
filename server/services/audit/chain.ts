/**
 * audit/chain — SHA-256 hash-chain computation for audit_logs.
 *
 * Every new audit_logs row gets a sha256_chain value that commits it into an
 * append-only chain. The chain makes silent tampering detectable: any edit to
 * a prior row breaks all subsequent links.
 *
 * Algorithm: sha256(JSON.stringify({ action, actor_id, target, payload_hash,
 *   occurred_at, previous: prev_sha256_chain }))
 *
 * ── The chain is ONE CHAIN PER TENANT (tenant_id) ────────────────────────────
 *
 * VSR-001 finding F-1 (2026-09-21): the writer used to read "the latest row"
 * on the caller's connection, and under tenant_isolation_policy that
 * connection sees only its own tenant's rows. Each tenant's first row
 * committed to genesis and its later rows to the tenant's head, while a row
 * written on an unscoped connection committed to the global head; the
 * verifier then replayed every tenant's rows as one chain and reported a
 * break. The only chain shape a tenant-scoped connection can both write and
 * verify without bypassing row level security is one chain per tenant — the
 * shape audit_events already has — so that is now the recipe, explicitly:
 *
 *   • the writer resolves the row's tenant (ChainRow.tenant_id, else the
 *     connection's app.current_tenant_id, else the request's tenant scope;
 *     nothing → it refuses),
 *   • takes pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_CLASS, tenant) — held until
 *     the caller's transaction ends, which is what serialises writers of one
 *     tenant. The old `SELECT … LIMIT 1 FOR UPDATE` locked the head ROW: a
 *     blocked writer re-read the same, stale head after the first committed
 *     and chained to it (fork). Reproduced in __tests__/chain-concurrency.dbtest.ts,
 *   • reads that tenant's head by AUDIT_CHAIN_HEAD_ORDER_SQL — chain_seq, the
 *     order key migrations/20260921_audit_logs_chain_seq.sql adds — and
 *     announces the position it took in the transaction-local GUC
 *     AUDIT_CHAIN_TENANT_GUC. The BEFORE INSERT trigger from the same
 *     migration assigns chain_seq to the row that follows, refuses a row whose
 *     tenant_id differs from the announced tenant, and clears the
 *     announcement (one position, one row).
 *
 * Rows written before that migration, or by pre-fix code running against a
 * migrated database, have chain_seq NULL ("legacy" rows). They are never
 * rewritten (audit_logs is append-only) and stay verifiable: the verifier
 * walks them in (occurred_at, id) order and accepts a row that derives from
 * EITHER predecessor its writer could have seen — the tenant's last row or the
 * global last row. Every sequenced row is held to exactly one predecessor.
 *
 * The caller MUST run computeAuditChain* and its INSERT in one transaction:
 * outside one, the advisory lock and the announcement both end with the
 * statement that made them, and the trigger then records the row as legacy.
 *
 * 21 CFR Part 11 §11.10(e) compliance: integrity of audit records.
 */

import { createHash } from 'crypto';
import {
  sealRecord,
  verifyChainSeals,
  GENESIS_PREVIOUS_HASH,
  type SealedRecord,
  type ChainSealVerification,
} from './audit-hmac-seal.js';
import { getTenantScope } from '../../db/tenantStore.js';

/**
 * audit_logs' order key is chain_seq (per tenant); the HMAC seal binds
 * recordHash + previousHash at a fixed sequence position, because rows written
 * before chain_seq existed have none and the seal recipe cannot change under
 * them. The writer and verifier both use this constant so they never drift.
 */
const AUDIT_SEAL_SEQ = 0;

/** pg_advisory_xact_lock class for the per-tenant chain lock (0x0C2C). */
export const AUDIT_CHAIN_LOCK_CLASS = 3116;

/**
 * Transaction-local GUC in which the writer announces the tenant it took a
 * chain position for; read and cleared by trigger audit_logs_chain_position.
 */
export const AUDIT_CHAIN_TENANT_GUC = 'app.audit_chain_tenant';

/**
 * The single chain-order recipe, within one tenant. Legacy rows (chain_seq
 * NULL) come first in write order, then sequenced rows by chain_seq. The
 * ledger route orders and links rows with these; the migration's indexes
 * serve them.
 */
export const AUDIT_CHAIN_ORDER_ASC_SQL = 'chain_seq ASC NULLS FIRST, occurred_at ASC, id ASC';
export const AUDIT_CHAIN_HEAD_ORDER_SQL = 'chain_seq DESC NULLS LAST, occurred_at DESC, id DESC';

/** The order the pre-fix recipe used and legacy rows are still walked in. */
const LEGACY_HEAD_ORDER_SQL = 'occurred_at DESC, id DESC';

export interface ChainRow {
  action:       string;
  actor_id:     number | null;
  target:       string | null;
  payload_hash: string | null;
  occurred_at:  string | Date;
  /**
   * The tenant whose chain the row joins — the tenant_id the caller is about
   * to INSERT. Optional only because existing callers predate it: when absent
   * the writer reads the connection's app.current_tenant_id and then the
   * request's tenant scope, and refuses when neither names a tenant.
   */
  tenant_id?:   number | string | null;
}

export interface PoolClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

// ── Failure modes (all fail closed) ──────────────────────────────────────────

/** No tenant for the row: not passed, not on the connection, not in scope. */
export class AuditChainTenantUnresolvedError extends Error {
  readonly code = 'AUDIT_CHAIN_TENANT_UNRESOLVED';
  constructor() {
    super(
      'audit chain: the row\'s tenant is unknown — pass ChainRow.tenant_id, or run on a ' +
        'connection whose app.current_tenant_id is set. The chain is per tenant; a row with ' +
        'no tenant cannot take a position.',
    );
  }
}

/** audit_logs has no chain_seq: migrations/20260921_audit_logs_chain_seq.sql has not run. */
export class AuditChainSchemaMissingError extends Error {
  readonly code = 'AUDIT_CHAIN_SCHEMA_MISSING';
  constructor() {
    super(
      'audit chain: audit_logs.chain_seq is missing — migrations/20260921_audit_logs_chain_seq.sql ' +
        'has not been applied to this database. Refusing to write or verify an unordered chain.',
    );
  }
}

/** The connection is tenant-scoped, so a cross-tenant verification would see a subset. */
export class AuditChainPartialViewError extends Error {
  readonly code = 'AUDIT_CHAIN_PARTIAL_VIEW';
  constructor(detail?: string) {
    super(
      detail ??
        'audit chain: this connection is scoped to one tenant (app.rls_enforce=on without ' +
          'app_super_admin), so a verification of every tenant would silently check a subset. ' +
          'Verify one tenant ({ tenantId }) or use a super-admin scope.',
    );
  }
}

// ── Schema presence ──────────────────────────────────────────────────────────

const orderColumnPresentByClient = new WeakMap<object, true>();
let warnedFixtureWithoutOrderColumn = false;

function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * Whether audit_logs carries chain_seq. A production database always does —
 * the migration set replays on every deploy — so its absence is refused
 * outright. The one tolerated case is a test fixture (the shared
 * AUDIT_LOGS_PGLITE_DDL and the suites that declare their own copy) that
 * predates the column: under vitest the pre-fix ordering is used, once
 * warned, so those suites keep exercising the writer.
 */
async function chainOrderColumnPresent(client: PoolClient): Promise<boolean> {
  if (orderColumnPresentByClient.has(client)) return true;
  // The table asked about is the one this connection's unqualified
  // `audit_logs` resolves to — the table every statement below reads and
  // writes. It used to be `audit_logs` in current_schema(), which is only the
  // FIRST schema on the search_path that exists. A connection whose
  // search_path put another schema first was told chain_seq was absent: under
  // vitest it then took the head by occurred_at and forked the chain (tenant
  // 0, a full real-database run, 2026-09-24); outside vitest every audit write
  // on it would have thrown. __tests__/chain-concurrency.dbtest.ts case 4.
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('audit_logs')
          AND attname = 'chain_seq'
          AND NOT attisdropped
     ) AS present`,
  );
  if (res.rows[0]?.present === true) {
    orderColumnPresentByClient.set(client, true);
    return true;
  }
  if (!isTestRuntime()) throw new AuditChainSchemaMissingError();
  if (!warnedFixtureWithoutOrderColumn) {
    warnedFixtureWithoutOrderColumn = true;
    console.warn(
      '[audit/chain] audit_logs.chain_seq is absent in this test fixture; using the pre-fix ' +
        '(occurred_at, id) order. Apply migrations/20260921_audit_logs_chain_seq.sql to the fixture.',
    );
  }
  return false;
}

// ── Tenant resolution ────────────────────────────────────────────────────────

function asTenantNumber(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

let warnedTenantUnresolvedInTest = false;

/**
 * The row's tenant: ChainRow.tenant_id, else the connection's
 * app.current_tenant_id (every request-scoped and governed connection carries
 * it), else the request's tenant scope. With none of them the writer refuses —
 * except under vitest, where a harness that stamps no tenant context gets the
 * pre-fix recipe (null: the row is written as a legacy row, which the verifier
 * still checks) so that suite keeps exercising the chain; it is warned once,
 * because the right fix is to stamp the context or pass the tenant.
 */
async function resolveChainTenant(client: PoolClient, row: ChainRow): Promise<number | null> {
  const explicit = asTenantNumber(row.tenant_id);
  if (explicit != null) return explicit;

  const res = await client.query(
    `SELECT NULLIF(current_setting('app.current_tenant_id', true), '') AS tenant`,
  );
  const fromConnection = asTenantNumber(res.rows[0]?.tenant);
  if (fromConnection != null) return fromConnection;

  const fromScope = asTenantNumber(getTenantScope()?.tenantId);
  if (fromScope != null) return fromScope;

  if (!isTestRuntime()) throw new AuditChainTenantUnresolvedError();
  if (!warnedTenantUnresolvedInTest) {
    warnedTenantUnresolvedInTest = true;
    console.warn(
      `[audit/chain] ${new AuditChainTenantUnresolvedError().message} Under vitest the row is ` +
        'written as a legacy (unsequenced) row instead; stamp tenant context in this harness.',
    );
  }
  return null;
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Re-derive the canonical hash of a single chained row, given the previous
 * row's stored hash. The writer and the verifier share this one serialization
 * so they can never drift.
 */
export function deriveChainHash(row: ChainRow, previousHash: string): string {
  const canonical = JSON.stringify({
    action:       row.action,
    actor_id:     row.actor_id,
    target:       row.target,
    payload_hash: row.payload_hash,
    occurred_at:  row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : row.occurred_at,
    previous:     previousHash,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * SHA-256 hash of an arbitrary payload object. Used to fill payload_hash
 * before calling computeAuditChain.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}

// ── Writer ───────────────────────────────────────────────────────────────────

interface ChainPosition {
  /** null only under vitest, for a harness that stamps no tenant (legacy recipe). */
  tenantId: number | null;
  previousHash: string;
}

/** Lock key for the legacy recipe's writers (no tenant): one global slot. */
const LEGACY_LOCK_KEY = 0;

/**
 * Take the next chain position for the row's tenant: lock the tenant's chain
 * for the rest of the caller's transaction, read the tenant's head, and
 * announce the position for the INSERT trigger.
 */
async function takeChainPosition(client: PoolClient, row: ChainRow): Promise<ChainPosition> {
  const tenantId = await resolveChainTenant(client, row);
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [AUDIT_CHAIN_LOCK_CLASS, tenantId ?? LEGACY_LOCK_KEY]);
  const ordered = await chainOrderColumnPresent(client);
  if (tenantId == null) {
    // Legacy recipe (test harness without tenant context): the head as this
    // connection sees it, no announcement, so the trigger leaves chain_seq NULL.
    const seen = await client.query(
      `SELECT sha256_chain FROM audit_logs
        WHERE sha256_chain IS NOT NULL
        ORDER BY ${LEGACY_HEAD_ORDER_SQL}
        LIMIT 1`,
    );
    return { tenantId: null, previousHash: (seen.rows[0]?.sha256_chain as string | undefined) ?? GENESIS_PREVIOUS_HASH };
  }
  const head = await client.query(
    `SELECT sha256_chain FROM audit_logs
      WHERE sha256_chain IS NOT NULL AND tenant_id = $1
      ORDER BY ${ordered ? AUDIT_CHAIN_HEAD_ORDER_SQL : LEGACY_HEAD_ORDER_SQL}
      LIMIT 1`,
    [tenantId],
  );
  await client.query('SELECT set_config($1, $2, true)', [AUDIT_CHAIN_TENANT_GUC, String(tenantId)]);
  const previousHash = (head.rows[0]?.sha256_chain as string | undefined) ?? GENESIS_PREVIOUS_HASH;
  return { tenantId, previousHash };
}

/**
 * Compute the sha256_chain value for the next audit_logs row.
 *
 * @param client - A pool client that is already inside the caller's transaction.
 *                 The tenant lock is taken here; the caller must not end the
 *                 transaction until after the INSERT.
 * @param row    - The row about to be inserted (id not yet assigned).
 */
export async function computeAuditChain(
  client: PoolClient,
  row: ChainRow,
): Promise<string> {
  const { previousHash } = await takeChainPosition(client, row);
  return deriveChainHash(row, previousHash);
}

/**
 * Best-effort HMAC seal of a chain link (21 CFR Part 11 §11.70). Sealing is
 * OPT-IN: it happens only when AUDIT_HMAC_KEY is configured. A missing key must
 * NEVER break an audit write, so this returns null (the row is written unsealed)
 * rather than throwing — sealRecord throws on an absent key, hence the guard.
 */
function maybeSeal(recordHash: string, previousHash: string): string | null {
  if (!process.env.AUDIT_HMAC_KEY) return null;
  try {
    return sealRecord({ recordHash, previousHash, sequenceNumber: AUDIT_SEAL_SEQ });
  } catch {
    return null;
  }
}

export interface SealedChainResult {
  /** The sha256_chain value to store (identical to computeAuditChain's output). */
  sha256Chain: string;
  /** The prior row's chain hash that this row commits (genesis = 64 zeros). */
  previousHash: string;
  /** HMAC-SHA256 seal to store in audit_logs.hmac_seal, or null when unsealed. */
  hmacSeal: string | null;
  /**
   * The tenant whose chain the row joins; the INSERT's tenant_id must equal
   * it. null only under vitest for a harness that stamps no tenant context
   * (the row is then a legacy row).
   */
  tenantId: number | null;
}

/**
 * Compute the sha256_chain AND its HMAC seal for the next audit_logs row.
 *
 * Same position-taking as computeAuditChain, plus the HMAC seal (when
 * AUDIT_HMAC_KEY is set) so the caller can persist it in the hmac_seal column.
 * The seal makes the chain non-forgeable by anyone who can write the DB but
 * lacks the secret key.
 */
export async function computeAuditChainSealed(
  client: PoolClient,
  row: ChainRow,
): Promise<SealedChainResult> {
  const { tenantId, previousHash } = await takeChainPosition(client, row);
  const sha256Chain = deriveChainHash(row, previousHash);
  return { sha256Chain, previousHash, hmacSeal: maybeSeal(sha256Chain, previousHash), tenantId };
}

// ── Verifier ─────────────────────────────────────────────────────────────────

export interface ChainWalkRow extends ChainRow {
  id: string;
  sha256_chain: string;
  hmac_seal?: string | null;
  chain_seq?: number | string | bigint | null;
  /**
   * A row of ANOTHER tenant loaded only so a one-tenant walk can see the
   * global head a legacy writer could have linked to. It is never verified
   * or counted; it only takes part in "what was the last hash written".
   */
  context?: boolean;
}

export interface ChainBreak {
  id: string;
  expected: string;
  stored: string;
  tenantId: number | null;
  /** 'legacy' — chain_seq NULL, pre-fix recipe; 'sequenced' — ordered by chain_seq. */
  segment: 'legacy' | 'sequenced';
  /**
   * What the row's stored hash actually commits to, found by trying every
   * stored hash: a row (fork or mis-order — the content is intact), 'genesis',
   * or null when no predecessor derives it (content tampered, or its
   * predecessor is gone).
   */
  commitsTo: { id: string; tenantId: number | null } | 'genesis' | null;
}

export interface ChainVerificationResult {
  ok: boolean;
  rowsChecked: number;
  tenants: number;
  legacyRows: number;
  sequencedRows: number;
  /** The first row whose stored hash does not match its re-derivation. */
  brokenAt?: ChainBreak;
}

export interface ChainWalk extends ChainVerificationResult {
  /** previousHash of every row that verified, by id — what a seal binds. */
  links: Map<string, string>;
}

function tenantKey(row: ChainWalkRow): string {
  const n = asTenantNumber(row.tenant_id);
  return n == null ? 'null' : String(n);
}

function occurredAtMillis(row: ChainWalkRow): number {
  const v = row.occurred_at;
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function compareWriteOrder(a: ChainWalkRow, b: ChainWalkRow): number {
  const dt = occurredAtMillis(a) - occurredAtMillis(b);
  if (dt !== 0) return dt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isSequenced(row: ChainWalkRow): boolean {
  return row.chain_seq != null;
}

function firstDeriving(row: ChainWalkRow, candidates: string[]): string | null {
  for (const c of candidates) {
    if (deriveChainHash(row, c) === row.sha256_chain) return c;
  }
  return null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Verify a set of chained rows (all of one tenant, or every tenant) with the
 * recipe described in the file header. Pure: takes rows, returns the verdict
 * and the previousHash of each verified row.
 *
 * Legacy rows (chain_seq NULL) are walked in (occurred_at, id) order and
 * accepted when they derive from the tenant's last row or the global last
 * row as of that moment — the two heads the pre-fix writer could have seen.
 * Sequenced rows are walked per tenant in chain_seq order and must derive
 * from the previous sequenced row of that tenant; the first one from the
 * tenant's legacy head. The first mismatch stops the walk: all rows after a
 * break are untrustworthy.
 */
interface WalkState {
  rows: ChainWalkRow[];
  byHash: Map<string, ChainWalkRow>;
  links: Map<string, string>;
  verified: number;
  legacyRows: number;
  sequencedRows: number;
  brokenAt?: ChainBreak;
  /** tenant key → hash of the tenant's latest legacy row (end of pass 1). */
  lastLegacyTenant: Map<string, string>;
  /** sequenced row id → the tenant's legacy head at that row's write time. */
  legacyHeadBefore: Map<string, string>;
}

function describeBreak(
  state: WalkState,
  row: ChainWalkRow,
  expected: string,
  segment: ChainBreak['segment'],
): ChainBreak {
  let commitsTo: ChainBreak['commitsTo'] = null;
  if (deriveChainHash(row, GENESIS_PREVIOUS_HASH) === row.sha256_chain) {
    commitsTo = 'genesis';
  } else {
    for (const [hash, r] of state.byHash) {
      if (r.id !== row.id && deriveChainHash(row, hash) === row.sha256_chain) {
        commitsTo = { id: r.id, tenantId: asTenantNumber(r.tenant_id) };
        break;
      }
    }
  }
  return {
    id: row.id,
    expected,
    stored: row.sha256_chain,
    tenantId: asTenantNumber(row.tenant_id),
    segment,
    commitsTo,
  };
}

/** Pass 1 — legacy rows in write order, tracking what every writer could see. */
function walkLegacyRows(state: WalkState): void {
  const lastTenant = new Map<string, string>();
  let lastGlobal = GENESIS_PREVIOUS_HASH;

  for (const row of state.rows) {
    const t = tenantKey(row);
    if (row.context) {
      // Another tenant's legacy row: it moved the global head, nothing else.
      lastTenant.set(t, row.sha256_chain);
      lastGlobal = row.sha256_chain;
      continue;
    }
    if (isSequenced(row)) {
      state.sequencedRows += 1;
      const head = state.lastLegacyTenant.get(t);
      if (head) state.legacyHeadBefore.set(row.id, head);
    } else {
      state.legacyRows += 1;
      if (!state.brokenAt) {
        const candidates = unique([lastTenant.get(t) ?? GENESIS_PREVIOUS_HASH, lastGlobal]);
        const previous = firstDeriving(row, candidates);
        if (previous == null) {
          state.brokenAt = describeBreak(state, row, candidates[0], 'legacy');
        } else {
          state.links.set(row.id, previous);
          state.verified += 1;
        }
      }
      state.lastLegacyTenant.set(t, row.sha256_chain);
    }
    lastTenant.set(t, row.sha256_chain);
    lastGlobal = row.sha256_chain;
  }
}

/** One tenant's sequenced rows in chain_seq order; returns the first break, if any. */
function walkSequencedTenant(
  state: WalkState,
  t: string,
  list: ChainWalkRow[],
): { row: ChainWalkRow; expected: string } | undefined {
  list.sort((a, b) => Number(a.chain_seq) - Number(b.chain_seq));
  let previous: string | null = null;
  for (const row of list) {
    const candidates = previous != null
      ? [previous]
      : unique([
          state.legacyHeadBefore.get(row.id) ?? GENESIS_PREVIOUS_HASH,
          state.lastLegacyTenant.get(t) ?? GENESIS_PREVIOUS_HASH,
        ]);
    const derived = firstDeriving(row, candidates);
    if (derived == null) return { row, expected: candidates[0] };
    state.links.set(row.id, derived);
    state.verified += 1;
    previous = row.sha256_chain;
  }
  return undefined;
}

/** Pass 2 — sequenced rows per tenant in chain_seq order, one predecessor each. */
function walkSequencedRows(state: WalkState): void {
  const sequencedByTenant = new Map<string, ChainWalkRow[]>();
  for (const row of state.rows) {
    if (!isSequenced(row)) continue;
    const t = tenantKey(row);
    const list = sequencedByTenant.get(t) ?? [];
    list.push(row);
    sequencedByTenant.set(t, list);
  }
  let firstBreak: { row: ChainWalkRow; expected: string } | undefined;
  for (const [t, list] of sequencedByTenant) {
    const brk = walkSequencedTenant(state, t, list);
    if (brk && (!firstBreak || compareWriteOrder(brk.row, firstBreak.row) < 0)) firstBreak = brk;
  }
  if (firstBreak) state.brokenAt = describeBreak(state, firstBreak.row, firstBreak.expected, 'sequenced');
}

/**
 * Verify a set of chained rows (all of one tenant, or every tenant) with the
 * recipe described in the file header. Pure: takes rows, returns the verdict
 * and the previousHash of each verified row.
 *
 * Legacy rows (chain_seq NULL) are walked in (occurred_at, id) order and
 * accepted when they derive from the tenant's last row or the global last
 * row as of that moment — the two heads the pre-fix writer could have seen.
 * Sequenced rows are walked per tenant in chain_seq order and must derive
 * from the previous sequenced row of that tenant; the first one from the
 * tenant's legacy head. The first mismatch stops the walk: all rows after a
 * break are untrustworthy.
 */
export function walkAuditChain(input: ChainWalkRow[]): ChainWalk {
  const rows = input.slice().sort(compareWriteOrder);
  const state: WalkState = {
    rows,
    byHash: new Map(rows.map((r) => [r.sha256_chain, r])),
    links: new Map(),
    verified: 0,
    legacyRows: 0,
    sequencedRows: 0,
    lastLegacyTenant: new Map(),
    legacyHeadBefore: new Map(),
  };
  walkLegacyRows(state);
  if (!state.brokenAt) walkSequencedRows(state);

  return {
    ok: !state.brokenAt,
    rowsChecked: state.verified + (state.brokenAt ? 1 : 0),
    tenants: new Set(rows.filter((r) => !r.context).map(tenantKey)).size,
    legacyRows: state.legacyRows,
    sequencedRows: state.sequencedRows,
    ...(state.brokenAt ? { brokenAt: state.brokenAt } : {}),
    links: state.links,
  };
}

export interface VerifyAuditChainOptions {
  /** Verify one tenant's chain only; omit to verify every tenant on this connection. */
  tenantId?: number | null;
}

async function readChainRows(
  client: PoolClient,
  opts: VerifyAuditChainOptions = {},
): Promise<ChainWalkRow[]> {
  const tenantId = asTenantNumber(opts.tenantId);
  const scoped = await connectionIsTenantScoped(client);
  if (tenantId == null && scoped) {
    // A cross-tenant walk on a tenant-scoped connection would verify a subset
    // and call it the chain. Refuse rather than report a false pass.
    throw new AuditChainPartialViewError();
  }
  const ordered = await chainOrderColumnPresent(client);
  const res = await client.query(
    `SELECT id, tenant_id, action, actor_id, target, payload_hash, occurred_at,
            sha256_chain, hmac_seal, ${ordered ? 'chain_seq' : 'NULL::bigint AS chain_seq'}
       FROM audit_logs
      WHERE sha256_chain IS NOT NULL${tenantId == null ? '' : ' AND tenant_id = $1'}
      ORDER BY occurred_at ASC, id ASC`,
    tenantId == null ? [] : [tenantId],
  );
  const rows: ChainWalkRow[] = res.rows.map((r) => ({
    id:           String(r.id),
    tenant_id:    (r.tenant_id as number | null) ?? null,
    action:       r.action as string,
    actor_id:     (r.actor_id as number | null) ?? null,
    target:       (r.target as string | null) ?? null,
    payload_hash: (r.payload_hash as string | null) ?? null,
    occurred_at:  r.occurred_at as string | Date,
    sha256_chain: r.sha256_chain as string,
    hmac_seal:    (r.hmac_seal as string | null) ?? null,
    chain_seq:    (r.chain_seq as number | string | null) ?? null,
  }));
  if (tenantId == null || !rows.some((r) => !isSequenced(r))) return rows;

  // One tenant, with legacy rows. A legacy writer linked to whichever head it
  // saw — the tenant's or the GLOBAL one — so the walk needs the other
  // tenants' legacy hashes as context. A tenant-scoped connection cannot see
  // them (RLS), and would report every cross-linked legacy row as a break:
  // refuse instead of guessing.
  if (scoped) {
    throw new AuditChainPartialViewError(
      `audit chain: tenant ${tenantId} has legacy (unsequenced) rows that may link to other ` +
        "tenants' rows, which this tenant-scoped connection cannot see. Verify on a super-admin scope.",
    );
  }
  const ctx = await client.query(
    `SELECT id, tenant_id, occurred_at, sha256_chain
       FROM audit_logs
      WHERE sha256_chain IS NOT NULL AND tenant_id IS DISTINCT FROM $1
        ${ordered ? 'AND chain_seq IS NULL' : ''}
      ORDER BY occurred_at ASC, id ASC`,
    [tenantId],
  );
  for (const r of ctx.rows) {
    rows.push({
      id:           String(r.id),
      tenant_id:    (r.tenant_id as number | null) ?? null,
      action:       '',
      actor_id:     null,
      target:       null,
      payload_hash: null,
      occurred_at:  r.occurred_at as string | Date,
      sha256_chain: r.sha256_chain as string,
      chain_seq:    null,
      context:      true,
    });
  }
  return rows;
}

/** app.rls_enforce=on without app_super_admin: the connection sees one tenant. */
async function connectionIsTenantScoped(client: PoolClient): Promise<boolean> {
  const view = await client.query(
    `SELECT NULLIF(current_setting('app.rls_enforce', true), '') AS rls_enforce,
            NULLIF(current_setting('app.current_user_role', true), '') AS role`,
  );
  const v = view.rows[0] ?? {};
  return v.rls_enforce === 'on' && v.role !== 'app_super_admin';
}

/**
 * Verify the integrity of the audit_logs sha256 chain — every tenant on this
 * connection, or one tenant. Read-only: issues no writes and takes no locks.
 *
 * 21 CFR Part 11 §11.10(e): demonstrable integrity of audit records.
 */
export async function verifyAuditChain(
  client: PoolClient,
  opts: VerifyAuditChainOptions = {},
): Promise<ChainVerificationResult> {
  const walk = walkAuditChain(await readChainRows(client, opts));
  return {
    ok: walk.ok,
    rowsChecked: walk.rowsChecked,
    tenants: walk.tenants,
    legacyRows: walk.legacyRows,
    sequencedRows: walk.sequencedRows,
    ...(walk.brokenAt ? { brokenAt: walk.brokenAt } : {}),
  };
}

/**
 * Verify the HMAC seals over the audit_logs chain (21 CFR Part 11 §11.70).
 *
 * Walks the chain exactly as verifyAuditChain does to recover each row's true
 * previousHash, then verifies the seal on every row that carries one. Rows
 * written before sealing was enabled (or while AUDIT_HMAC_KEY was unset) have
 * a null seal and are skipped — they remain covered by the sha256 chain, just
 * not by the stronger HMAC seal. A sealed row the chain walk could not link
 * (it sits after a break) fails closed: its seal cannot be checked, so it is
 * reported as the broken index rather than skipped.
 *
 * Read-only. Requires AUDIT_HMAC_KEY (verifySeal throws via resolveKey when the
 * key is absent — that is a configuration error, not a verification outcome).
 */
export async function verifyAuditChainSeals(
  client: PoolClient,
  opts: VerifyAuditChainOptions = {},
): Promise<ChainSealVerification> {
  const rows = await readChainRows(client, opts);
  const walk = walkAuditChain(rows);
  const sealed: SealedRecord[] = [];
  const ordered = rows.slice().sort(compareWriteOrder);
  for (const r of ordered) {
    const seal = r.hmac_seal ?? null;
    if (!seal) continue;
    const previousHash = walk.links.get(r.id);
    if (previousHash == null) return { valid: false, brokenAt: sealed.length };
    sealed.push({ recordHash: r.sha256_chain, previousHash, sequenceNumber: AUDIT_SEAL_SEQ, seal });
  }
  return verifyChainSeals(sealed);
}

/**
 * Verify the HMAC seals over the `audit_events` chain (21 CFR Part 11 §11.70).
 *
 * audit_events is the SIEM / export-facing audit table. Unlike audit_logs it
 * carries a real per-org monotonic `sequence_number`, so its seal binds the
 * ACTUAL sequence number (strictly stronger than audit_logs' fixed
 * AUDIT_SEAL_SEQ — reordering is detected directly). See
 * docs/AUDIT_INTEGRITY_HMAC_PLAN.md §2b/§2c and migration
 * 20260617_audit_events_hmac_seal.sql for the additive nullable hmac_seal column.
 *
 * TOLERANT OF ABSENT SEALS — this is the whole point of the F1 rollout's "step 2
 * before the writer ships" ordering. While the writer is still deferred, EVERY
 * row's hmac_seal is NULL. This verifier:
 *   - verifies the seal of every row that HAS a non-NULL hmac_seal,
 *   - SKIPS (never fails) rows with a NULL seal — they are validly unsealed and
 *     remain covered by the SHA-256 chain,
 *   - walks rows per organization in sequence order so each sealed row's
 *     previousHash is reconstructed correctly even across interleaved unsealed
 *     rows,
 *   - returns { valid: true, brokenAt: null } when no sealed row fails — INCLUDING
 *     the all-NULL (pre-writer) state, so exports/attestations never see a false
 *     tamper alarm.
 *
 * Read-only. Requires AUDIT_HMAC_KEY only when at least one sealed row is present
 * (verifySeal throws via resolveKey when the key is absent — a configuration
 * error, not a verification outcome). When every row is unsealed, no seal is
 * verified and the key is never consulted, so this is safe to call with the key
 * unset during the pre-writer phase.
 */
export async function verifyAuditEventsChainSeals(
  client: PoolClient,
): Promise<ChainSealVerification> {
  const res = await client.query(
    `SELECT organization_id, record_hash, previous_hash, sequence_number, hmac_seal
       FROM audit_events
      WHERE record_hash IS NOT NULL
      ORDER BY organization_id ASC, sequence_number ASC`,
  );

  // Group sealed rows per org, reconstructing each row's previousHash from the
  // prior chained row within the same org (sealed or not).
  const sealed: SealedRecord[] = [];
  const prevByOrg = new Map<string, string>();

  for (const r of res.rows) {
    const orgKey = String((r.organization_id as unknown) ?? 'null');
    const recordHash = r.record_hash as string;
    const storedPrev = (r.previous_hash as string | null) ?? null;
    const previousHash = storedPrev ?? prevByOrg.get(orgKey) ?? GENESIS_PREVIOUS_HASH;
    const sequenceNumber = Number(r.sequence_number ?? 0);
    const seal = (r.hmac_seal as string | null) ?? null;

    if (seal) {
      sealed.push({ recordHash, previousHash, sequenceNumber, seal });
    }
    // Advance the per-org pointer using EVERY chained row (sealed or not).
    prevByOrg.set(orgKey, recordHash);
  }

  // No sealed rows (e.g. pre-writer, all-NULL state) → trivially valid, key not
  // consulted. Otherwise verify only the seal-bearing rows.
  return verifyChainSeals(sealed);
}
