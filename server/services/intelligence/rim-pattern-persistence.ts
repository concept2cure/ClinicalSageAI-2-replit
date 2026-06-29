/**
 * RIM Pattern Persistence — file-based durable storage for learned RIM patterns.
 *
 * Supplements the in-memory RIM pattern store with a JSON-file persistence layer
 * so that learned patterns survive process restarts. Each organization's patterns
 * are stored in their own file at `data/rim-patterns/${orgId}.json`.
 *
 * Design constraints:
 *   - FIRE-AND-FORGET: `persistPatterns` never throws — write errors are logged
 *     and dropped so persistence never blocks the hot path.
 *   - GRACEFUL READS: `loadPersistedPatterns` returns `[]` when the file does not
 *     exist or contains invalid data — callers never need to handle errors.
 *   - TENANT-SCOPED: each org's patterns live in a separate file, mirroring the
 *     in-memory store's tenant isolation.
 *
 * @module server/services/intelligence/rim-pattern-persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RimPattern } from './rim-pattern-store.js';

/** Base directory for persisted RIM pattern files. */
const PERSISTENCE_DIR = path.resolve(process.cwd(), 'data', 'rim-patterns');

/** Resolve the file path for an org's persisted patterns. */
function orgFilePath(orgId: string): string {
  return path.join(PERSISTENCE_DIR, `${orgId}.json`);
}

/**
 * Persist an org's full set of learned patterns to disk. Fire-and-forget:
 * write errors are logged but never thrown into the caller.
 */
export function persistPatterns(orgId: string, patterns: RimPattern[]): void {
  try {
    fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    fs.writeFileSync(orgFilePath(orgId), JSON.stringify(patterns, null, 2), 'utf-8');
  } catch (err) {
    console.warn(
      '[RIM] Pattern persistence write failed (non-blocking):',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Load an org's persisted patterns from disk. Returns `[]` if the file does not
 * exist or contains invalid data — callers never need to handle errors.
 */
export async function loadPersistedPatterns(orgId: string): Promise<RimPattern[]> {
  try {
    const filePath = orgFilePath(orgId);
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('[RIM] Persisted patterns for org', orgId, 'is not an array — returning []');
      return [];
    }
    return parsed as RimPattern[];
  } catch (err: any) {
    // ENOENT is expected for orgs that have never persisted patterns.
    if (err?.code !== 'ENOENT') {
      console.warn(
        '[RIM] Pattern persistence read failed (returning []):',
        err instanceof Error ? err.message : err,
      );
    }
    return [];
  }
}
