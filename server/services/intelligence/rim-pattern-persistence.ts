/**
 * RIM Pattern Persistence — database-backed durable storage for learned RIM
 * patterns.
 *
 * Supplements the in-memory RIM pattern store so that learned patterns survive
 * process restarts. Each organization's full pattern set is stored as ONE
 * `project_memory_entries` row under category `rim_learned_pattern`, updated in
 * place — the same substrate and org→profile bridge `pattern-registry.ts` uses
 * for its registry export, and the convention `learning-loop-service.ts`
 * documents as this layer's stopgap-until-dedicated-table.
 *
 * This replaces a JSON-file store under `data/rim-patterns/` (gitignored,
 * per-container local disk). That location meant a container restart on a
 * fresh filesystem lost every learned pattern, two instances diverged
 * silently, and nothing was ever written in production anyway because the one
 * writer (`interceptLearnedPattern`) had no callers. Durable, tenant-scoped
 * storage is the floor for a layer whose whole claim is "judgment accumulates
 * over time". A dedicated, Part 11-auditable `rim_learned_patterns` table
 * (immutable history, created_by) is the recorded follow-up once patterns
 * exist at volume.
 *
 * Design constraints:
 *   - FIRE-AND-FORGET WRITES: `persistPatterns` never throws — errors are
 *     logged and dropped so persistence never blocks the hot path.
 *   - GRACEFUL READS: `loadPersistedPatterns` returns `[]` when nothing is
 *     stored or the row is unreadable — callers never handle errors.
 *   - TENANT-SCOPED: one row per org, resolved through that org's own
 *     intelligence profile; reads filter on organization_id.
 *
 * @module server/services/intelligence/rim-pattern-persistence
 */

import type { RimPattern } from './rim-pattern-store.js';

const CATEGORY = 'rim_learned_pattern';

/**
 * Memoized dynamic import of the db module (dynamic to avoid circular
 * dependencies — same reason pattern-registry does it; memoized so concurrent
 * callers share ONE in-flight import rather than racing the module registry).
 */
let dbModule: Promise<typeof import('../../db.js')> | null = null;
const getDb = () => (dbModule ??= import('../../db.js'));

/** Orgs already warned about a missing intelligence profile (once per process). */
const warnedNoProfile = new Set<number>();

function parseOrgId(orgId: string): number | null {
  const n = Number.parseInt(orgId, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Per-org write serialization. The durable write is update-else-insert, and two
 * fire-and-forget persists landing close together (two violations in one scan)
 * can BOTH observe "no row yet" and BOTH insert — after which the org has two
 * rows forever. Chaining writes per org closes that race in-process; reads stay
 * tolerant (newest row wins) for the cross-instance case.
 */
const persistChains = new Map<number, Promise<void>>();

/**
 * Persist an org's full set of learned patterns. Fire-and-forget: errors are
 * logged but never thrown into the caller. The caller (the pattern store)
 * hydrates before writing, so the full-set write can never clobber patterns
 * persisted by an earlier process.
 */
export function persistPatterns(orgId: string, patterns: RimPattern[]): Promise<void> {
  const org = parseOrgId(orgId);
  if (org === null) return Promise.resolve();
  const chained = (persistChains.get(org) ?? Promise.resolve()).then(() =>
    persistPatternsNow(org, patterns)
  );
  persistChains.set(org, chained);
  return chained;
}

async function persistPatternsNow(org: number, patterns: RimPattern[]): Promise<void> {
  try {
    const { pool } = await getDb();

    // Bridge to a profile row: patterns are org-scoped, the table is
    // profile-scoped. Any profile belonging to the org anchors the row.
    const profile = await pool.query<{ id: number; project_id: number }>(
      `SELECT id, project_id FROM project_intelligence_profiles
        WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`,
      [org]
    );
    if (profile.rows.length === 0) {
      if (!warnedNoProfile.has(org)) {
        warnedNoProfile.add(org);
        console.warn(
          `[RIM] Pattern persistence skipped for org ${org} — no project intelligence profile ` +
            'exists yet to anchor the row. Learned patterns stay in memory until one is created.'
        );
      }
      return;
    }

    const content = JSON.stringify({
      version: 1,
      patterns,
      persistedAt: new Date().toISOString(),
    });

    // One row per org, updated in place: an insert-per-write grows without
    // bound, and the newest full set is the only state that matters.
    const updated = await pool.query(
      `UPDATE project_memory_entries
          SET content = $1, updated_at = NOW()
        WHERE organization_id = $2 AND category = $3`,
      [content, org, CATEGORY]
    );
    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO project_memory_entries (
           project_profile_id, project_id, organization_id,
           category, title, content,
           importance_level, confidence_score, extracted_by, status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'high', 1, 'system', 'active')`,
        [
          profile.rows[0].id,
          profile.rows[0].project_id,
          org,
          CATEGORY,
          'RIM learned patterns',
          content,
        ]
      );
    }
  } catch (err) {
    console.warn(
      '[RIM] Pattern persistence write failed (non-blocking):',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Load an org's persisted patterns. Returns `[]` when nothing is stored or the
 * stored row is unreadable — callers never need to handle errors.
 */
export async function loadPersistedPatterns(orgId: string): Promise<RimPattern[]> {
  const org = parseOrgId(orgId);
  if (org === null) return [];
  try {
    const { pool } = await getDb();
    const result = await pool.query<{ content: string }>(
      `SELECT content FROM project_memory_entries
        WHERE organization_id = $1 AND category = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [org, CATEGORY]
    );
    if (result.rows.length === 0 || !result.rows[0].content) return [];

    const parsed = JSON.parse(result.rows[0].content);
    const patterns = Array.isArray(parsed) ? parsed : parsed?.patterns;
    if (!Array.isArray(patterns)) {
      console.warn(`[RIM] Persisted patterns for org ${org} have no pattern array — returning []`);
      return [];
    }
    // Tenant hygiene: never hydrate a pattern claiming another org, whatever
    // the row says.
    return (patterns as RimPattern[]).filter(p => p && p.orgId === org);
  } catch (err) {
    console.warn(
      '[RIM] Pattern persistence read failed (returning []):',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}
