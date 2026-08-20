/**
 * RIM Pattern Persistence — the judgment layer's own tables.
 *
 * Learned patterns live in `rim_learned_patterns` (one row per pattern,
 * upserted on its deterministic identity) with an append-only provenance
 * trail in `rim_pattern_observations` — one row per observation event,
 * never updated, never deleted. That trail is what makes "judgment
 * accumulates over time" inspectable rather than asserted
 * (migrations/20260820b_rim_learned_patterns.sql).
 *
 * History of this module, because each prior shape was a real failure mode:
 *   1. JSON files under data/rim-patterns/ — gitignored, per-container disk.
 *      A restart on a fresh filesystem lost every learned pattern; nothing
 *      was ever written in production anyway (the writer had no callers).
 *   2. One JSON blob per org in project_memory_entries under category
 *      'rim_learned_pattern' — durable, but no per-pattern identity, no
 *      queryable history, no provenance a reviewer can inspect.
 * The loader lazily imports shape 2's blob when the real table is empty for
 * an org, so nothing learned during the stopgap window is lost.
 *
 * Design constraints:
 *   - FIRE-AND-FORGET WRITES: `persistPattern` never throws — errors are
 *     logged and dropped so persistence never blocks the hot path. Writes
 *     are chained per org so they land in observation order.
 *   - GRACEFUL READS: `loadPersistedPatterns` returns `[]` when nothing is
 *     stored or rows are unreadable — callers never handle errors.
 *   - TENANT-SCOPED: every row carries organization_id; reads filter on it,
 *     and hydration drops any pattern claiming another org.
 *
 * @module server/services/intelligence/rim-pattern-persistence
 */

import type { RimPattern } from './rim-pattern-store.js';

/** The stopgap category this module's loader can still import from. */
const LEGACY_CATEGORY = 'rim_learned_pattern';

/**
 * Memoized dynamic import of the db module (dynamic to avoid circular
 * dependencies — same reason pattern-registry does it; memoized so concurrent
 * callers share ONE in-flight import rather than racing the module registry).
 */
let dbModule: Promise<typeof import('../../db.js')> | null = null;
const getDb = () => (dbModule ??= import('../../db.js'));

/** Orgs already warned about a missing table (once per process). */
let warnedMissingTable = false;

function parseOrgId(orgId: string): number | null {
  const n = Number.parseInt(orgId, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string })?.code === '42P01';
}

function warnMissingTableOnce(): void {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    '[RIM] rim_learned_patterns does not exist — learned patterns stay in memory and are lost ' +
      'on restart. Apply migrations/20260820b_rim_learned_patterns.sql (in C2C_MIGRATION_FILES; ' +
      'npm run db:apply-c2c or a deploy-migrate run applies it).'
  );
}

/**
 * Per-org write serialization: observations must land in the order they were
 * recorded, and interleaved upserts from one process would race each other's
 * occurrence counts.
 */
const persistChains = new Map<number, Promise<void>>();

/**
 * Persist ONE learned pattern (the row the store just upserted in memory) and
 * append its observation event. Fire-and-forget: errors are logged but never
 * thrown into the caller.
 */
export function persistPattern(pattern: RimPattern): Promise<void> {
  const org = pattern.orgId;
  if (!Number.isInteger(org) || org <= 0) return Promise.resolve();
  const chained = (persistChains.get(org) ?? Promise.resolve()).then(() =>
    persistPatternNow(pattern)
  );
  persistChains.set(org, chained);
  return chained;
}

async function persistPatternNow(pattern: RimPattern): Promise<void> {
  try {
    const { pool } = await getDb();
    await pool.query(
      `INSERT INTO rim_learned_patterns (
         organization_id, pattern_key, domain, signal_type, observation,
         confidence, occurrences, first_seen, last_seen
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, pattern_key) DO UPDATE SET
         confidence = EXCLUDED.confidence,
         occurrences = EXCLUDED.occurrences,
         last_seen = EXCLUDED.last_seen,
         updated_at = now()`,
      [
        pattern.orgId,
        pattern.id,
        pattern.domain,
        pattern.signalType,
        pattern.observation,
        pattern.confidence,
        pattern.occurrences,
        pattern.firstSeen,
        pattern.lastSeen,
      ]
    );
    // Append-only provenance: one row per observation event, never touched again.
    await pool.query(
      `INSERT INTO rim_pattern_observations (organization_id, pattern_key, observed_at)
       VALUES ($1, $2, $3)`,
      [pattern.orgId, pattern.id, pattern.lastSeen]
    );
  } catch (err) {
    if (isMissingTable(err)) {
      warnMissingTableOnce();
      return;
    }
    console.warn(
      '[RIM] Pattern persistence write failed (non-blocking):',
      err instanceof Error ? err.message : err
    );
  }
}

function rowToPattern(row: Record<string, unknown>): RimPattern {
  return {
    id: String(row.pattern_key),
    orgId: Number(row.organization_id),
    domain: String(row.domain),
    signalType: row.signal_type as RimPattern['signalType'],
    observation: String(row.observation),
    confidence: Number(row.confidence),
    occurrences: Number(row.occurrences),
    firstSeen: new Date(row.first_seen as string | Date).toISOString(),
    lastSeen: new Date(row.last_seen as string | Date).toISOString(),
  };
}

/**
 * Load an org's persisted patterns. Returns `[]` when nothing is stored or
 * rows are unreadable — callers never need to handle errors.
 *
 * When the real table holds nothing for the org, the loader checks the
 * stopgap blob (project_memory_entries, category 'rim_learned_pattern') and,
 * if present, imports it through {@link persistPattern} so the interim
 * window's learning graduates with the schema. The blob is left in place —
 * once the table has rows, this branch never runs again.
 */
export async function loadPersistedPatterns(orgId: string): Promise<RimPattern[]> {
  const org = parseOrgId(orgId);
  if (org === null) return [];
  try {
    const { pool } = await getDb();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT organization_id, pattern_key, domain, signal_type, observation,
              confidence, occurrences, first_seen, last_seen
         FROM rim_learned_patterns
        WHERE organization_id = $1`,
      [org]
    );
    if (result.rows.length > 0) {
      // Tenant hygiene: never hydrate a pattern claiming another org.
      return result.rows.map(rowToPattern).filter(p => p.orgId === org);
    }
    return await importLegacyBlob(org);
  } catch (err) {
    if (isMissingTable(err)) {
      warnMissingTableOnce();
    } else {
      console.warn(
        '[RIM] Pattern persistence read failed (returning []):',
        err instanceof Error ? err.message : err
      );
    }
    return [];
  }
}

/** One-time import of the stopgap JSON blob into the real tables. */
async function importLegacyBlob(org: number): Promise<RimPattern[]> {
  try {
    const { pool } = await getDb();
    const legacy = await pool.query<{ content: string }>(
      `SELECT content FROM project_memory_entries
        WHERE organization_id = $1 AND category = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [org, LEGACY_CATEGORY]
    );
    if (legacy.rows.length === 0 || !legacy.rows[0].content) return [];

    const parsed = JSON.parse(legacy.rows[0].content);
    const patterns = Array.isArray(parsed) ? parsed : parsed?.patterns;
    if (!Array.isArray(patterns)) return [];

    const owned = (patterns as RimPattern[]).filter(p => p && p.orgId === org);
    for (const p of owned) {
      await persistPatternNow(p);
    }
    if (owned.length > 0) {
      console.warn(
        `[RIM] Imported ${owned.length} learned pattern(s) for org ${org} from the ` +
          'project_memory_entries stopgap into rim_learned_patterns.'
      );
    }
    return owned;
  } catch (err) {
    console.warn(
      '[RIM] Legacy pattern import failed (returning []):',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
