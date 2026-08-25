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
 *    one (services/audit/audit-integrity-service → verifyAuditIntegrity), never
 *    a second implementation of the hashing, and it is FAIL-CLOSED in the same
 *    way: a row whose seal could not be checked reports `seal: 'unverified'`,
 *    not a pass. Where verification did not run at all, every row says
 *    `chain: 'not-checked'` and the response says why. No row is ever given a
 *    green tick this endpoint did not earn.
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

/** Ordering key for one audit row — the SAME order the chain writer appended in. */
export interface ChainPosition {
  occurredAt: number;
  id: string;
}

/** PURE: is `a` strictly earlier than `b` in append order? */
function earlier(a: ChainPosition, b: ChainPosition): boolean {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt;
  return a.id < b.id;
}

/**
 * PURE: what this deployment can honestly say about ONE row.
 *
 * `chainOk === null` means no verification ran — every row then reports
 * 'not-checked' and NOTHING reports 'verified'. When a break was found, rows
 * before it were genuinely re-derived and matched, the break row itself is
 * 'broken', and everything after it is 'after-break' because a broken link
 * makes every later link unprovable rather than wrong.
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
  breakAt: ChainPosition | null;
}

let cached: { at: number; report: IntegrityReport } | null = null;

/** Drop the memoised verification. Exported for tests, which must not share it. */
export function clearIntegrityCache(): void {
  cached = null;
}

async function verifyStore(): Promise<IntegrityReport> {
  const now = Date.now();
  if (cached && now - cached.at < VERIFY_TTL_MS) return cached.report;

  const checkedAt = new Date().toISOString();
  let report: IntegrityReport;

  try {
    // Cheap probe for "is this store larger than we walk in one pass" — it
    // stops after VERIFY_MAX_ROWS rows and returns nothing when there are
    // fewer, so the common case costs one bounded scan.
    // tenant-isolation-safe: intentional estate-wide integrity check behind the
    // platform-admin router gate; restricting this probe to one organization
    // would let a platform administrator report a partial chain as complete.
    const oversize = await query(`SELECT 1 FROM audit_logs OFFSET $1 LIMIT 1`, [VERIFY_MAX_ROWS]);
    if (oversize.rows.length > 0) {
      report = {
        status: 'unavailable',
        reason: 'store-too-large',
        rowsChecked: 0,
        checkedAt,
        chainOk: null,
        sealsValid: null,
        breakAt: null,
      };
    } else {
      const result = await verifyAuditIntegrity({
        query: (sql: string, params?: unknown[]) => query(sql, (params ?? []) as unknown[]),
      });

      // The seal half is fail-closed in exactly the way the service is: seals
      // that were not checked are NOT a pass, and are reported as their own
      // state rather than folded into "verified".
      const sealsValid = result.seals.checked ? result.seals.valid : null;

      let breakAt: ChainPosition | null = null;
      if (!result.chain.ok && result.chain.brokenAt) {
        // Resolve the break row's append position so rows BEFORE it can still
        // be reported as verified — they were.
        try {
          // tenant-isolation-safe: the id comes from the estate-wide canonical
          // integrity verifier above, and this platform-admin-only lookup needs
          // that exact row's global chain position, regardless of its tenant.
          const pos = await query(`SELECT id, occurred_at FROM audit_logs WHERE id = $1`, [
            result.chain.brokenAt.id,
          ]);
          const r = pos.rows[0];
          if (r) {
            breakAt = { id: String(r.id), occurredAt: new Date(r.occurred_at).getTime() };
          }
        } catch (err) {
          logger.warn('chain break position lookup failed', err as Record<string, unknown>);
        }
      }

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
        breakAt,
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
      breakAt: null,
    };
  }

  cached = { at: now, report };
  return report;
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
    const orgRaw = req.query.organizationId;
    const organizationId =
      typeof orgRaw === 'string' && orgRaw.trim() !== '' && Number.isFinite(Number(orgRaw))
        ? Number(orgRaw)
        : null;

    const modRaw = req.query.moduleId;
    const moduleId =
      typeof modRaw === 'string' && modRaw.trim() !== '' ? modRaw.trim().slice(0, 128) : null;

    // One statement: the page AND the size of the whole filtered set, so the
    // two cannot disagree about how much is being withheld. The window count
    // is evaluated before LIMIT.
    //
    // Selection is on the PRESENCE of masterAdminAction (invariant 1) minus the
    // two non-licensing actions. The module filter matches the recorded module
    // and, for a packaging change, the audited record itself.
    const rowsRes = await query(
      `SELECT a.id, a.occurred_at, a.created_at, a.tenant_id, a.user_id,
              a.table_name, a.record_id, a.new_values, a.sha256_chain, a.hmac_seal,
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

    const integrity = await verifyStore();

    let unreadable = 0;
    const entries = rowsRes.rows.map((r: any) => {
      const occurredAtRaw = r.occurred_at ?? r.created_at ?? null;
      const occurredAt = occurredAtRaw ? new Date(occurredAtRaw).toISOString() : null;
      const position: ChainPosition = {
        id: String(r.id),
        occurredAt: occurredAtRaw ? new Date(occurredAtRaw).getTime() : 0,
      };

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
            chainOk: integrity.chainOk,
            breakAt: integrity.breakAt,
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
