/**
 * The enforcement mode — one resolver, one cache, one precedence rule.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 *
 * Route-level entitlement enforcement has three states — not checking,
 * observing, refusing — and the only place that decision could be expressed was
 * a process environment variable read on every request. Meanwhile the Master
 * Licensing console grew a panel that shows exactly what enforcement is
 * refusing or would refuse. So the platform owner could MAKE the rollout
 * decision on a screen and could not EXECUTE it there: acting on what they had
 * just read required an engineer, a configuration change and a redeploy. A
 * control room whose one conclusion has to be carried out somewhere else is not
 * a control room.
 *
 * This module is the whole decision: where the mode is stored, which source
 * wins, how it reaches the request path without a query per request, and what
 * happens when it cannot be read at all.
 *
 * ── PRECEDENCE ───────────────────────────────────────────────────────────────
 *
 *   1. The STORED setting (platform_settings, key `module_enforcement_mode`),
 *      when a row exists and holds a value this build understands.
 *   2. Otherwise the DEPLOYMENT setting — the process environment variable the
 *      gate has always read.
 *
 * Nothing stored means the deployment decides, exactly as it did before this
 * module existed. Applying the migration changes no deployment's behaviour;
 * only a human on the console changes it. Every resolution carries `source`
 * so the reader can tell which of the two answered — a console that shows a
 * mode without saying whether it is stored or inherited invites an operator to
 * "change" a value that a redeploy will silently put back.
 *
 * A stored value that is NOT one of the three known modes is treated as
 * unreadable, not coerced to a default: an older build must not reinterpret a
 * newer build's value as `off`.
 *
 * ── NO QUERY PER REQUEST ─────────────────────────────────────────────────────
 *
 * The gate runs on every API request. A configuration read per request would be
 * a worse defect than the one this fixes, so the resolution is cached for
 * {@link MODE_CACHE_TTL_MS}.
 *
 * STALENESS WINDOW: up to 30 seconds. A mode change made on the console takes
 * effect within 30 seconds on each server process, without a restart. That is
 * the deliberate trade: an operator switching to refusing mode watches the
 * report for minutes, not milliseconds, and 30 seconds of a busy deployment is
 * thousands of requests that must not each carry a settings query.
 *
 * The refresh is NOT awaited on the hot path. A stale entry is served
 * immediately and refreshed in the background, so no request ever waits on the
 * settings read. The single exception is the very first call in a process,
 * which awaits: serving the deployment value while the stored value is unknown
 * could ESCALATE enforcement (deployment says refuse, stored says observe) for
 * the first requests after every restart, and escalating by accident is the one
 * outcome this module exists to prevent. One awaited read per process is a
 * price worth paying; one per request is not.
 *
 * ── FAIL SAFE, IN A NAMED DIRECTION ──────────────────────────────────────────
 *
 * If the stored mode cannot be read, this NEVER resolves to a mode that refuses
 * more than the last known good answer did. Concretely:
 *
 *   - A previous good resolution exists → it keeps being served, flagged
 *     `degraded`. Continuing to do what was already being done cannot start
 *     refusing anything new.
 *   - No previous good resolution exists (a read failure at process start) →
 *     the deployment value is used but CAPPED AT `report`. A deployment
 *     configured to refuse therefore observes instead of refusing while its
 *     configuration store is unreadable.
 *
 * Why cap rather than trust the deployment value: the failure hides whether a
 * stored value exists, so trusting the deployment value can refuse requests
 * that the stored value would have served — customers 403ed by an infrastructure
 * fault, which is exactly the outage `report` mode was invented to avoid. The
 * cap costs at most a window where an unlicensed module is served, and it costs
 * nothing at all in practice: if the settings store is unreachable then
 * entitlement resolution itself is failing too, and the gate already fails open
 * on that (see moduleEntitlementGate's header).
 *
 * A MISSING TABLE IS NOT A FAILURE. A deployment that has not applied the
 * migration yet has no `platform_settings` relation; that is "nothing stored",
 * not "cannot read", and it resolves to the deployment value undegraded. Any
 * other error is a real failure and degrades as above.
 *
 * @module server/services/entitlements/enforcement-mode
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('enforcement-mode');

export type EnforcementMode = 'off' | 'report' | 'enforce';

/** Ascending by how much they refuse. Order is load-bearing for {@link capAt}. */
export const ENFORCEMENT_MODES: readonly EnforcementMode[] = ['off', 'report', 'enforce'];

const RANK: Record<EnforcementMode, number> = { off: 0, report: 1, enforce: 2 };

/** The key this setting occupies in the governed platform settings store. */
export const ENFORCEMENT_MODE_KEY = 'module_enforcement_mode';

/**
 * How long a resolution is served before a refresh is triggered. See the
 * header: this IS the staleness window an operator experiences after changing
 * the mode on the console.
 */
export const MODE_CACHE_TTL_MS = 30_000;

/** Postgres `undefined_table` — a deployment that has not run the migration. */
const UNDEFINED_TABLE = '42P01';

/**
 * PURE: the mode this string names, or null when it names none.
 *
 * Null rather than a default, on purpose. The caller decides what an
 * unrecognized value means, and the two callers decide differently: the
 * deployment reader treats it as "unset" (the historical behaviour), the stored
 * reader treats it as "written by a build I do not understand".
 */
export function parseMode(raw: unknown): EnforcementMode | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return (ENFORCEMENT_MODES as readonly string[]).includes(v) ? (v as EnforcementMode) : null;
}

/** PURE: the more permissive of the two — never refuses more than either. */
export function capAt(mode: EnforcementMode, ceiling: EnforcementMode): EnforcementMode {
  return RANK[mode] <= RANK[ceiling] ? mode : ceiling;
}

/**
 * PURE: the mode this deployment is configured for, defaulting to `off`.
 *
 * Unchanged behaviour from before this module existed, including the default:
 * enforcement has never been on, so it stays opt-in and an unreadable value
 * means unset rather than something else.
 */
export function deploymentEnforcementMode(env: NodeJS.ProcessEnv = process.env): EnforcementMode {
  return parseMode(env.MODULE_ENFORCEMENT) ?? 'off';
}

/** One row of the governed setting, as stored. */
export interface StoredModeRow {
  setting_value: string | null;
  updated_at: Date | string | null;
  updated_by: number | null;
  reason: string | null;
}

export interface ResolvedEnforcementMode {
  /** The mode in force. This is what the gate acts on. */
  mode: EnforcementMode;
  /** Which layer decided — 'stored' on the console, or 'deployment'. */
  source: 'stored' | 'deployment';
  /** The stored value, or null when nothing readable is stored. */
  storedMode: EnforcementMode | null;
  /** What the deployment is configured for, whether or not it is in force. */
  deploymentMode: EnforcementMode;
  /** When the stored value was last changed, ISO, or null. */
  updatedAt: string | null;
  /** The platform user who last changed it, or null. */
  updatedBy: number | null;
  /** The reason-for-change captured with the last change, or null. */
  reason: string | null;
  /**
   * True when the stored value could not be read and this answer is a
   * fail-safe. A surface must say so: a degraded answer is not evidence about
   * what is stored.
   */
  degraded: boolean;
  /** ISO instant this resolution was computed. */
  resolvedAt: string;
}

function isoOf(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/**
 * PURE: compose a resolution from the stored row (or its absence) and the
 * deployment value. Exported so precedence is testable without a database.
 */
export function resolveMode(
  row: StoredModeRow | null,
  deploymentMode: EnforcementMode,
  now: string = new Date().toISOString(),
): ResolvedEnforcementMode {
  const stored = row ? parseMode(row.setting_value) : null;
  if (row && stored == null) {
    // A row exists but this build does not understand its value. Falling back
    // to the deployment value is the honest answer — but it must be visible,
    // because "nothing stored" and "something stored that I cannot read" are
    // different facts and only one of them is somebody's mistake.
    logger.warn('stored enforcement mode is not a value this build understands', {
      key: ENFORCEMENT_MODE_KEY,
    });
  }
  if (stored != null) {
    return {
      mode: stored,
      source: 'stored',
      storedMode: stored,
      deploymentMode,
      updatedAt: isoOf(row?.updated_at ?? null),
      updatedBy: row?.updated_by ?? null,
      reason: row?.reason ?? null,
      degraded: false,
      resolvedAt: now,
    };
  }
  return {
    mode: deploymentMode,
    source: 'deployment',
    storedMode: null,
    deploymentMode,
    updatedAt: null,
    updatedBy: null,
    reason: null,
    degraded: false,
    resolvedAt: now,
  };
}

/**
 * Read the stored row. Returns null when nothing is stored — INCLUDING on a
 * database that has not applied the migration, which is the pre-migration
 * behaviour and not a fault. Throws on any other failure.
 */
export async function readStoredMode(): Promise<StoredModeRow | null> {
  try {
    const res = await pool.query(
      `SELECT setting_value, updated_at, updated_by, reason
         FROM platform_settings
        WHERE setting_key = $1`,
      [ENFORCEMENT_MODE_KEY],
    );
    return (res?.rows?.[0] as StoredModeRow | undefined) ?? null;
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) return null;
    throw err;
  }
}

// ─── The cache ───────────────────────────────────────────────────────────────

interface CacheEntry {
  value: ResolvedEnforcementMode;
  /** Epoch ms this entry was written; TTL is measured from here. */
  at: number;
}

let cache: CacheEntry | null = null;
/** Dedupes concurrent refreshes so a stampede costs one query, not N. */
let inflight: Promise<ResolvedEnforcementMode> | null = null;
/**
 * Bumped on every invalidation, so a read that was already in flight when the
 * cache was invalidated cannot write its now-obsolete answer.
 *
 * Without this: a background refresh reads the old value, an operator writes a
 * new mode, the write invalidates and re-reads correctly — and then the older
 * read lands and puts the old mode back for a full TTL. The operator watches a
 * console that reverts their change by itself and has no way to tell why.
 */
let generation = 0;

/** Drop the cache. Called after a write, and by tests. */
export function invalidateEnforcementModeCache(): void {
  cache = null;
  inflight = null;
  generation += 1;
}

/** The cached resolution without touching the database. Null when cold. */
export function peekEnforcementMode(): ResolvedEnforcementMode | null {
  return cache?.value ?? null;
}

/**
 * The fail-safe answer when the stored value cannot be read.
 *
 * See the header for why the cap exists. The last known good answer is
 * preferred when there is one, because continuing to do what was already being
 * done cannot start refusing anything new.
 */
function degradedResolution(
  previous: ResolvedEnforcementMode | null,
  deploymentMode: EnforcementMode,
  now: string,
): ResolvedEnforcementMode {
  if (previous) {
    return { ...previous, degraded: true, resolvedAt: now };
  }
  return {
    mode: capAt(deploymentMode, 'report'),
    source: 'deployment',
    storedMode: null,
    deploymentMode,
    updatedAt: null,
    updatedBy: null,
    reason: null,
    degraded: true,
    resolvedAt: now,
  };
}

/** Read, resolve and cache. Never throws — a failure degrades, loudly. */
export async function refreshEnforcementMode(): Promise<ResolvedEnforcementMode> {
  if (inflight) return inflight;
  const previous = cache?.value ?? null;
  const gen = generation;
  inflight = (async () => {
    const now = new Date().toISOString();
    const deployment = deploymentEnforcementMode();
    let resolved: ResolvedEnforcementMode;
    try {
      resolved = resolveMode(await readStoredMode(), deployment, now);
    } catch (err) {
      resolved = degradedResolution(previous, deployment, now);
      // Never silent. An operator whose console change is not taking effect
      // must be able to find out why from the logs, and a gate that quietly
      // stopped honouring the stored decision is worse than one that failed.
      logger.error('could not read the stored enforcement mode — serving a fail-safe value', {
        servingMode: resolved.mode,
        deploymentMode: deployment,
        usedPreviousResolution: previous != null,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // Cached even when degraded, so a persistent failure costs one query per
    // TTL rather than one per request — but only if nothing invalidated the
    // cache while this read was in flight. A superseded answer is returned to
    // its own caller and never published.
    if (gen === generation) cache = { value: resolved, at: Date.now() };
    return resolved;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * The mode in force, for the request path.
 *
 * Cold (no cached value): awaits one read — see the header on why serving the
 * deployment value before the stored value is known could escalate.
 * Warm and fresh: returns immediately.
 * Warm and stale: returns the cached value IMMEDIATELY and refreshes in the
 * background, so no request ever waits on this.
 */
export async function currentEnforcementMode(): Promise<ResolvedEnforcementMode> {
  const entry = cache;
  if (!entry) return refreshEnforcementMode();
  if (Date.now() - entry.at < MODE_CACHE_TTL_MS) return entry.value;
  // Fire and forget. `refreshEnforcementMode` never rejects, but the catch is
  // kept so a future change cannot produce an unhandled rejection on the hot
  // path.
  void refreshEnforcementMode().catch(() => undefined);
  return entry.value;
}

/**
 * Store a new mode. The caller (the master-admin licensing router) owns the
 * authorization, the reason floor and the audit record; this owns the write and
 * making the new value visible.
 *
 * The cache is invalidated and re-read rather than assumed, so the value
 * returned to the operator is the value the database now holds — the console
 * must never report a mode it merely asked for.
 */
export async function writeEnforcementMode(input: {
  mode: EnforcementMode;
  reason: string;
  updatedBy: number | null;
}): Promise<ResolvedEnforcementMode> {
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by, reason)
     VALUES ($1, $2, now(), $3, $4)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value,
           updated_at    = now(),
           updated_by    = EXCLUDED.updated_by,
           reason        = EXCLUDED.reason`,
    [ENFORCEMENT_MODE_KEY, input.mode, input.updatedBy, input.reason],
  );
  invalidateEnforcementModeCache();
  return refreshEnforcementMode();
}
