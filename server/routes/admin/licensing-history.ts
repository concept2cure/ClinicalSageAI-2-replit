/**
 * Master Administration — the READ side of licensing governance.
 * Mounted under /api/admin/master, inside the same platform-admin gate.
 *
 *   GET /licensing/history   the licensing decisions that were made
 *
 * WHY THIS EXISTS. Every mutation in ./master-licensing already writes an
 * auditService record carrying the operator's typed reason, and those records
 * go into the Part 11 tamper-evident chain. None of it was readable anywhere in
 * the product. A customer asking why they lost a module, or an auditor asking
 * who moved a capability into a higher tier and on what justification, could
 * only be answered by an engineer with a database session. A compliance record
 * nobody can read does not do the job it exists for.
 *
 * ── Why this is not the audit explorer in ./master-admin ────────────────────
 * `GET /audit` there answers "what happened on this platform", listing
 * id / action / table / record / ip. It never reads the recorded `details`, so
 * it cannot answer either question people actually arrive with — WHY a module
 * moved tier, and WHAT the operator typed as justification. This endpoint reads
 * that payload, resolves the workspace and module by name, and reports the
 * integrity of each row. Neither is a filter of the other; the explorer is
 * deliberately left alone.
 *
 * ── THE THREE THINGS THIS ENDPOINT IS BUILT AROUND ─────────────────────────
 *
 * 1. AN OPEN VOCABULARY. Rows are selected on the PRESENCE of a
 *    `masterAdminAction`, never on a list of the values this file happens to
 *    know. New governed actions are being added in parallel (an enforcement
 *    mode change, trial grants, access-request approvals) and every one of them
 *    must appear here the day it ships, without a change to this file. An
 *    action this file does not recognise still carries an operator, a
 *    timestamp, a reason and its recorded fields, so it renders as a readable
 *    row rather than being dropped. The only exclusions are the two known
 *    actions that are not licensing decisions at all (see NON_LICENSING).
 *
 * 2. HONEST ABOUT COMPLETENESS. An audit view that drops what it could not read
 *    or pages without saying there is more produces confident wrong answers. So
 *    a row whose recorded detail cannot be interpreted is still returned, with
 *    `readable: false` and whatever survived, and counted in `unreadable`; the
 *    page reports `total` and `hasMore` from the same query that produced the
 *    rows. A read that FAILS is a 500 — never an empty history, because "no
 *    decision was ever made" and "we could not read the record" are opposite
 *    facts.
 *
 * 3. HONEST ABOUT INTEGRITY. Per row: whether its chain position was re-derived
 *    and matched, and whether its seal verified. Verification is the canonical
 *    one (services/audit/audit-integrity-service → verifyAuditIntegrity, and
 *    the per-tenant verifyAuditChain in services/audit/chain that it is built
 *    on), never a second implementation of the hashing, and it is FAIL-CLOSED
 *    in the same way: a row whose seal could not be checked reports
 *    `seal: 'unverified'`, not a pass. Where verification did not run at all,
 *    every row says `chain: 'not-checked'` and the response says why. No row is
 *    ever given a green tick this endpoint did not earn.
 *
 *    The audit chain is ONE CHAIN PER TENANT, ordered by chain_seq
 *    (services/audit/chain.ts). So a row's position is its place in ITS
 *    tenant's chain — never its timestamp, which the writer stamps before it
 *    takes the tenant's chain lock and which concurrent writers can therefore
 *    order differently — and a break in one tenant's chain says nothing about
 *    another's. The store-wide walk answers "is anything broken"; when it is,
 *    each tenant on the page is walked on its own to place its rows.
 *
 *    2026-09-22 (tests/db/licensing-history.dbtest.ts): three ways this
 *    endpoint gave a verdict the walk had not earned were reproduced against a
 *    real database and closed — (a) a row AFTER a break in its tenant's chain
 *    reported 'verified' because its timestamp sorted earlier; (b) every other
 *    tenant's later rows reported 'after-break' for a break that was not in
 *    their chain; (c) a row appended after the memoised walk reported
 *    'verified' by a walk that never saw it.
 *
 * The whole router inherits `authMiddleware` + `requirePlatformAdmin` from the
 * mount in ./master-admin — no endpoint here does its own authorization, and
 * none may.
 *
 * @module server/routes/admin/licensing-history
 */

import { Router, Request, Response } from 'express';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { verifyAuditIntegrity } from '../../services/audit/audit-integrity-service';
import { verifyAuditChain } from '../../services/audit/chain';

const logger = createScopedLogger('admin-licensing-history');
const router = Router();

/**
 * The two governed actions that are recorded by the master-admin console but
 * are not licensing decisions: one records a person's account state, the other
 * acknowledges a billing alert. Everything else — INCLUDING actions added after
 * this file was written — is in scope. This is an exclusion list rather than an
 * inclusion list on purpose: an unknown action must appear, not vanish.
 */
export const NON_LICENSING = ['user.status_change', 'billing_alert.acknowledge'] as const;

/** Page size. Deliberately small — this is read line by line, not scanned. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Above this many audit rows the chain walk is not attempted on a page load.
 *
 * verifyAuditIntegrity re-derives EVERY chained row; that is the correct
 * algorithm and the only one, but it is not something to run unbounded behind
 * an interactive request. Past the bound the response reports
 * `unavailable / store-too-large` and every row says its chain was not checked,
 * which is the honest outcome. It is never reported as verified.
 */
const VERIFY_MAX_ROWS = 50_000;

/** How long one chain verification is reused across page loads, in ms. */
const VERIFY_TTL_MS = 30_000;

// ─── pure helpers ────────────────────────────────────────────────────────────

/** PURE: a page size inside the allowed range, or the default. */
export function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

/** PURE: a non-negative offset. */
export function clampOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Largest value an audit_logs.tenant_id (INTEGER) can hold. */
const MAX_TENANT_ID = 2_147_483_647;

/** A filter value that cannot be applied. The request is refused, not widened. */
export const INVALID = Symbol('invalid-filter');

/**
 * PURE: the workspace filter. Absent or blank → null (no filter); a workspace
 * id, or 0 for platform-level decisions → that number; anything else → INVALID.
 *
 * Anything else used to be read as "no filter": `abc`, `-3`, `12abc` and a
 * repeated parameter all returned every workspace's decisions to a caller who
 * had asked for one, and `1.5` or an id past the INTEGER range reached the
 * database and came back as the 500 that means "the record could not be read".
 * A filter that cannot be applied is neither of those things.
 */
export function parseOrganizationFilter(raw: unknown): number | null | typeof INVALID {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return INVALID;
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d{1,10}$/.test(s)) return INVALID;
  const n = Number(s);
  return n <= MAX_TENANT_ID ? n : INVALID;
}

/** PURE: the module filter. Absent or blank → null; one id up to 128 chars; else INVALID. */
export function parseModuleFilter(raw: unknown): string | null | typeof INVALID {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') return INVALID;
  const s = raw.trim();
  if (s === '') return null;
  return s.length <= 128 ? s : INVALID;
}

/**
 * PURE: the recorded detail payload as an object, or null when it cannot be
 * interpreted.
 *
 * The driver hands back a parsed object for a `json` column, but a row written
 * by an older path can hold a JSON-encoded string, and a hand-edited row can
 * hold anything. Returning null (rather than throwing, or coercing to `{}`) is
 * what lets the caller mark the row unreadable and still show it.
 */
export function toDetails(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Where a chained row sits relative to the verification that was run. */
export type ChainState = 'verified' | 'broken' | 'after-break' | 'not-checked' | 'not-recorded';
/** Whether this row's HMAC seal was checked, and what it said. */
export type SealState = 'verified' | 'unverified' | 'not-sealed';

export interface RowIntegrity {
  chain: ChainState;
  seal: SealState;
}

/**
 * Ordering key for one audit row within ITS TENANT'S chain — the order the
 * canonical verifier walks (services/audit/chain.ts AUDIT_CHAIN_ORDER_ASC_SQL):
 * legacy rows (no chain_seq) first, in (occurred_at, id) order, then sequenced
 * rows by chain_seq. Comparing positions is only meaningful within one tenant.
 */
export interface ChainPosition {
  occurredAt: number;
  id: string;
  /** audit_logs.chain_seq; null/absent for a legacy (pre-sequence) row. */
  chainSeq?: number | null;
}

/**
 * PURE: is `a` strictly earlier than `b` in their tenant's chain?
 *
 * chain_seq decides wherever both rows have one. The timestamp does not: the
 * writer stamps occurred_at BEFORE it takes the tenant's chain lock, so two
 * writers of one tenant can hold timestamps in one order and chain positions
 * in the other — and at millisecond precision a tie falls to a random uuid.
 * Ordering by time put a row that sits AFTER a break in its chain before it,
 * and reported it verified.
 */
function earlier(a: ChainPosition, b: ChainPosition): boolean {
  const as = a.chainSeq ?? null;
  const bs = b.chainSeq ?? null;
  if (as !== null && bs !== null) return as < bs;
  // Every legacy row precedes every sequenced row of the same tenant.
  if (as === null && bs !== null) return true;
  if (as !== null && bs === null) return false;
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt;
  return a.id < b.id;
}

/**
 * PURE: what this deployment can honestly say about ONE row, given the
 * verification of THAT ROW'S TENANT'S chain.
 *
 * `chainOk === null` means no verification ran — every row then reports
 * 'not-checked' and NOTHING reports 'verified'. When a break was found, rows
 * before it in the chain were genuinely re-derived and matched, the break row
 * itself is 'broken', and everything after it is 'after-break' because a
 * broken link makes every later link unprovable rather than wrong.
 */
export function rowIntegrity(
  row: { sha256Chain: string | null; hmacSeal: string | null; position: ChainPosition },
  verification: {
    chainOk: boolean | null;
    breakAt: ChainPosition | null;
    /** null = seals were not checked at all on this deployment. */
    sealsValid: boolean | null;
  },
): RowIntegrity {
  let chain: ChainState;
  if (!row.sha256Chain) {
    // The row exists but was never committed to the chain — written before
    // chaining shipped, or by a path that does not chain. Saying so is the
    // point: it is the one state a green tick would misrepresent completely.
    chain = 'not-recorded';
  } else if (verification.chainOk === null) {
    chain = 'not-checked';
  } else if (verification.chainOk) {
    chain = 'verified';
  } else if (!verification.breakAt) {
    // A break was reported but its position could not be resolved; nothing
    // about this row can be claimed either way.
    chain = 'not-checked';
  } else if (row.position.id === verification.breakAt.id) {
    chain = 'broken';
  } else if (earlier(row.position, verification.breakAt)) {
    chain = 'verified';
  } else {
    chain = 'after-break';
  }

  const seal: SealState = !row.hmacSeal
    ? 'not-sealed'
    : verification.sealsValid === true
      ? 'verified'
      : 'unverified';

  return { chain, seal };
}

// ─── chain verification, bounded and memoised ────────────────────────────────

/**
 * What the deployment can say about the record store as a whole.
 *
 * `reason` is a TOKEN, mapped to human copy by the surface. It never carries a
 * configuration key, a relation name or a driver message.
 */
export interface IntegrityReport {
  status: 'verified' | 'broken' | 'unavailable';
  reason:
    | 'chain-and-seals-verified'
    | 'chain-verified-seals-not-configured'
    | 'chain-broken'
    | 'seal-broken'
    | 'store-too-large'
    | 'check-failed';
  /** Rows the walk re-derived. 0 when nothing was checked. */
  rowsChecked: number;
  /** When the walk ran. A page load may reuse a recent one; this says which. */
  checkedAt: string;
  chainOk: boolean | null;
  sealsValid: boolean | null;
}

/**
 * The memoised walk, and what it covered.
 *
 * `size` is the store's row count taken BEFORE the walk read the chain, so
 * every row it counted was visible to the walk. audit_logs is append-only
 * (its UPDATE/DELETE/TRUNCATE triggers refuse), so an unchanged count later
 * means no row has been appended since — and only then may the walk vouch for
 * the rows on a page. The count is read through the same scoped connection as
 * the walk, so it counts exactly the rows that walk could see.
 *
 * Before the count was part of the key, a decision written inside the memo
 * window was listed with chain 'verified' by a walk that never saw it —
 * reproduced with a row tampered the moment it was written.
 */
let cached: { at: number; size: number; report: IntegrityReport } | null = null;

/** Drop the memoised verification. Exported for tests, which must not share it. */
export function clearIntegrityCache(): void {
  cached = null;
}

/** The verifier's client: every statement through the request's scoped pool. */
const auditClient = {
  query: (sql: string, params?: unknown[]) => query(sql, (params ?? []) as unknown[]),
};

async function verifyStore(): Promise<IntegrityReport> {
  const now = Date.now();
  const checkedAt = new Date().toISOString();
  let report: IntegrityReport;
  let size: number | null = null;

  try {
    // One bounded scan answers both questions this walk needs first: is the
    // store larger than we walk in one pass, and has anything been appended
    // since the memoised walk. It stops after VERIFY_MAX_ROWS + 1 rows.
    // tenant-isolation-safe: intentional estate-wide integrity check behind the
    // platform-admin router gate; restricting this count to one organization
    // would let a platform administrator report a partial chain as complete.
    const sized = await query(
      `SELECT count(*)::int AS n FROM (SELECT 1 FROM audit_logs LIMIT $1) bounded`,
      [VERIFY_MAX_ROWS + 1],
    );
    const n = Number(sized.rows[0]?.n);
    size = Number.isFinite(n) ? n : null;

    if (
      cached &&
      size !== null &&
      cached.size === size &&
      now - cached.at < VERIFY_TTL_MS
    ) {
      return cached.report;
    }

    if (size !== null && size > VERIFY_MAX_ROWS) {
      report = {
        status: 'unavailable',
        reason: 'store-too-large',
        rowsChecked: 0,
        checkedAt,
        chainOk: null,
        sealsValid: null,
      };
    } else {
      const result = await verifyAuditIntegrity(auditClient);

      // The seal half is fail-closed in exactly the way the service is: seals
      // that were not checked are NOT a pass, and are reported as their own
      // state rather than folded into "verified".
      const sealsValid = result.seals.checked ? result.seals.valid : null;

      const status: IntegrityReport['status'] = !result.chain.ok
        ? 'broken'
        : sealsValid === false
          ? 'broken'
          : 'verified';
      const reason: IntegrityReport['reason'] = !result.chain.ok
        ? 'chain-broken'
        : sealsValid === false
          ? 'seal-broken'
          : sealsValid === true
            ? 'chain-and-seals-verified'
            : 'chain-verified-seals-not-configured';

      report = {
        status,
        reason,
        rowsChecked: result.chain.rowsChecked,
        checkedAt,
        chainOk: result.chain.ok,
        sealsValid,
      };
    }
  } catch (err) {
    // A verification that could not run is reported as not run. It is never
    // downgraded into "nothing was wrong".
    logger.error('audit integrity verification failed', err as Record<string, unknown>);
    report = {
      status: 'unavailable',
      reason: 'check-failed',
      rowsChecked: 0,
      checkedAt,
      chainOk: null,
      sealsValid: null,
    };
  }

  // A walk whose coverage is unknown is never reused.
  cached = size === null ? null : { at: now, size, report };
  return report;
}

/** One tenant's chain, walked on its own: intact, or where its first break is. */
interface TenantChain {
  chainOk: boolean | null;
  breakAt: ChainPosition | null;
}

/**
 * Walk each tenant's chain on its own — the canonical verifyAuditChain with
 * `{ tenantId }`, the same walker verifyAuditIntegrity runs across the store.
 *
 * Only called once the store-wide walk has found a break. That walk reports ONE
 * break — the earliest by time across every tenant — so it cannot say which
 * other tenants are intact, nor where a later break sits in another tenant's
 * chain. Placing the store-wide break against every row by timestamp marked
 * other tenants' intact rows 'after-break' and, within the broken tenant, a
 * row after the break 'verified'. Each tenant's own first break places its
 * own rows, by chain position.
 *
 * A tenant whose walk could not run reports nothing about its rows.
 */
async function verifyTenantChains(tenantIds: number[]): Promise<Map<number, TenantChain>> {
  const out = new Map<number, TenantChain>();
  for (const tenantId of tenantIds) {
    try {
      const result = await verifyAuditChain(auditClient, { tenantId });
      if (result.ok) {
        out.set(tenantId, { chainOk: true, breakAt: null });
        continue;
      }
      let breakAt: ChainPosition | null = null;
      if (result.brokenAt) {
        // tenant-isolation-safe: the id comes from the canonical verifier's
        // walk of this tenant's chain, on the platform-admin system scope.
        const pos = await query(
          `SELECT id, occurred_at, chain_seq FROM audit_logs WHERE id = $1`,
          [result.brokenAt.id],
        );
        const r = pos.rows[0];
        if (r) {
          breakAt = {
            id: String(r.id),
            occurredAt: new Date(r.occurred_at).getTime(),
            chainSeq: r.chain_seq == null ? null : Number(r.chain_seq),
          };
        }
      }
      out.set(tenantId, { chainOk: false, breakAt });
    } catch (err) {
      logger.warn('tenant chain verification failed', err as Record<string, unknown>);
      out.set(tenantId, { chainOk: null, breakAt: null });
    }
  }
  return out;
}

// ─── GET /licensing/history ──────────────────────────────────────────────────

router.get('/licensing/history', async (req: Request, res: Response) => {
  try {
    const limit = clampLimit(req.query.limit);
    const offset = clampOffset(req.query.offset);

    /*
     * A DISPLAY FILTER, NOT A TENANCY SCOPE — and the difference is what makes
     * reading it off the query string safe here.
     *
     * This endpoint is deliberately UN-SCOPED: a platform admin reading the
     * licensing record sees every workspace's decisions by default, because
     * "who moved this capability, across the estate" is the question it exists
     * to answer. The parameter can therefore only ADD a `tenant_id = $2`
     * predicate to a set the caller may already see in full — it can narrow the
     * result and has no reachable path that widens it. It is never used to
     * resolve the caller's own organization, never passed to a tenant-scoped
     * helper, and no other statement in this file reads it.
     *
     * Authorization is `authMiddleware` + `requirePlatformAdmin` on the mount in
     * ./master-admin, exactly as for the audit explorer beside it, which names
     * the same parameter `client` for the same reason.
     */
    // security-allow: platform-wide view — this only narrows an all-workspaces read the master-admin guard already permits, and is never used as a tenancy scope
    const organizationId = parseOrganizationFilter(req.query.organizationId);
    const moduleId = parseModuleFilter(req.query.moduleId);
    // A filter that cannot be applied is refused. Dropping it would answer a
    // different question — every workspace's decisions — as if it were the one
    // asked; passing it on would report a malformed request as a failed read.
    if (organizationId === INVALID) {
      return res.status(400).json({ error: 'The workspace filter is not a workspace id.' });
    }
    if (moduleId === INVALID) {
      return res.status(400).json({ error: 'The module filter is not a single module id.' });
    }

    // One statement: the page AND the size of the whole filtered set, so the
    // two cannot disagree about how much is being withheld. The window count
    // is evaluated before LIMIT.
    //
    // Selection is on the PRESENCE of masterAdminAction (invariant 1) minus the
    // two non-licensing actions. The module filter matches the recorded module
    // and, for a packaging change, the audited record itself.
    // tenant-isolation-safe: estate-wide platform-admin read under the system scope (/api/admin/master); the optional workspace filter only narrows it, and users is joined for the actor's email alone
    const rowsRes = await query(
      `SELECT a.id, a.occurred_at, a.created_at, a.tenant_id, a.user_id,
              a.table_name, a.record_id, a.new_values, a.sha256_chain, a.hmac_seal,
              a.chain_seq,
              u.email AS actor_email,
              o.name  AS organization_name,
              am.name AS module_name,
              COUNT(*) OVER() AS total_matching
         FROM audit_logs a
         LEFT JOIN users u          ON u.id = a.user_id
         LEFT JOIN organizations o  ON o.id = a.tenant_id
         LEFT JOIN available_modules am ON am.module_id = a.new_values->>'moduleId'
        WHERE a.new_values->>'masterAdminAction' IS NOT NULL
          AND a.new_values->>'masterAdminAction' <> ALL($1::text[])
          AND ($2::int IS NULL OR a.tenant_id = $2)
          AND ($3::text IS NULL
               OR a.new_values->>'moduleId' = $3
               OR (a.table_name = 'module_packaging' AND a.record_id = $3))
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT $4 OFFSET $5`,
      [[...NON_LICENSING], organizationId, moduleId, limit, offset],
    );

    // After the page read, so every row on the page was visible to the walk.
    const integrity = await verifyStore();

    // A break somewhere in the store: place this page's rows against their OWN
    // tenant's chain, one walk per tenant on the page.
    const tenantChains =
      integrity.chainOk === false
        ? await verifyTenantChains(
            Array.from(
              new Set<number>(
                rowsRes.rows
                  .map((r: any) => Number(r.tenant_id))
                  .filter((t: number) => Number.isSafeInteger(t)),
              ),
            ),
          )
        : null;

    let unreadable = 0;
    const entries = rowsRes.rows.map((r: any) => {
      const occurredAtRaw = r.occurred_at ?? r.created_at ?? null;
      const occurredAt = occurredAtRaw ? new Date(occurredAtRaw).toISOString() : null;
      const position: ChainPosition = {
        id: String(r.id),
        occurredAt: occurredAtRaw ? new Date(occurredAtRaw).getTime() : 0,
        chainSeq: r.chain_seq == null ? null : Number(r.chain_seq),
      };
      const tenantChain: TenantChain = tenantChains
        ? (tenantChains.get(Number(r.tenant_id)) ?? { chainOk: null, breakAt: null })
        : { chainOk: integrity.chainOk, breakAt: null };

      const details = toDetails(r.new_values);
      if (details === null) unreadable += 1;

      const action =
        details && typeof details.masterAdminAction === 'string'
          ? (details.masterAdminAction as string)
          : null;
      const reason =
        details && typeof details.reason === 'string' && details.reason.trim() !== ''
          ? (details.reason as string)
          : null;

      // Everything else the operator's action recorded, so an action this file
      // has never heard of still shows WHAT it changed. The two fields already
      // surfaced as their own columns are not repeated.
      const changed: Record<string, unknown> = {};
      if (details) {
        for (const [k, v] of Object.entries(details)) {
          if (k === 'masterAdminAction' || k === 'reason') continue;
          changed[k] = v;
        }
      }

      const detailModuleId =
        details && typeof details.moduleId === 'string' ? (details.moduleId as string) : null;
      const packagingModuleId =
        r.table_name === 'module_packaging' && r.record_id ? String(r.record_id) : null;

      return {
        id: String(r.id),
        occurredAt,
        /** The internal token. The surface renders an operator-facing name. */
        action,
        /** False when the recorded detail could not be interpreted at all. */
        readable: details !== null,
        actorId: r.user_id ?? null,
        actorEmail: r.actor_email ?? null,
        organizationId: r.tenant_id ?? null,
        organizationName: r.organization_name ?? null,
        moduleId: detailModuleId ?? packagingModuleId,
        moduleName: r.module_name ?? null,
        reason,
        changed,
        integrity: rowIntegrity(
          {
            sha256Chain: r.sha256_chain ?? null,
            hmacSeal: r.hmac_seal ?? null,
            position,
          },
          {
            chainOk: tenantChain.chainOk,
            breakAt: tenantChain.breakAt,
            sealsValid: integrity.sealsValid,
          },
        ),
      };
    });

    const total = rowsRes.rows.length ? Number(rowsRes.rows[0].total_matching) : null;

    return res.json({
      entries,
      page: {
        limit,
        offset,
        returned: entries.length,
        /** Size of the whole filtered set, or null when this page held no row. */
        total,
        /**
         * There are records this page does not show. The surface must say so:
         * a page presented as the complete history is the confident wrong
         * answer this endpoint exists to prevent.
         */
        hasMore: total != null ? offset + entries.length < total : false,
      },
      filters: { organizationId, moduleId },
      /** Rows returned WITH the page whose recorded detail could not be read. */
      unreadable,
      integrity: {
        status: integrity.status,
        reason: integrity.reason,
        rowsChecked: integrity.rowsChecked,
        checkedAt: integrity.checkedAt,
      },
    });
  } catch (err) {
    // Fail closed. An empty `entries: []` here would render as "no licensing
    // decision was ever made", which is the opposite of what just happened.
    logger.error('licensing history read failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load the licensing decision history.' });
  }
});

export default router;
