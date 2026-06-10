/**
 * Tool-telemetry persistence — opt-in file backend + boot wiring.
 *
 * Keeps the pure telemetry core (tool-telemetry.ts) free of fs/IO. Enabled only
 * when ANA_TELEMETRY_PERSIST_PATH points at a writable JSON file, so the default
 * deployment behavior is unchanged (in-memory, process-lifetime). Where a
 * writable volume is mounted, AnA's learned tool reliability survives restarts.
 *
 * Storage is a single JSON snapshot file — no schema, no migration. Writes are
 * atomic (temp file + rename). All IO failures are swallowed (telemetry is best-
 * effort observability, never load-bearing).
 *
 * @module server/services/ana/tool-telemetry-persistence
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createScopedLogger } from '../../utils/logger.js';
import {
  setTelemetryBackend,
  hydrateTelemetry,
  persistTelemetry,
  type TelemetryBackend,
  type TelemetrySnapshot,
} from './tool-telemetry.js';

const log = createScopedLogger('tool-telemetry-persistence');
const FLUSH_INTERVAL_MS = 60_000;

/** A JSON-file telemetry backend. Exported for explicit wiring / testing. */
export function createFileTelemetryBackend(filePath: string): TelemetryBackend {
  return {
    async load(): Promise<TelemetrySnapshot | null> {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.tools)) {
          return parsed as TelemetrySnapshot;
        }
        return null;
      } catch {
        return null; // missing/corrupt file → start fresh
      }
    },
    async save(snapshot: TelemetrySnapshot): Promise<void> {
      const tmp = `${filePath}.${process.pid}.tmp`;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(snapshot), 'utf8');
      await fs.rename(tmp, filePath); // atomic replace
    },
  };
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Wire telemetry persistence if ANA_TELEMETRY_PERSIST_PATH is set. Idempotent
 * and fail-safe: any error leaves telemetry running purely in-memory. Returns
 * true when persistence was enabled.
 */
export async function initToolTelemetryPersistence(): Promise<boolean> {
  const filePath = process.env.ANA_TELEMETRY_PERSIST_PATH;
  if (!filePath) return false;
  try {
    setTelemetryBackend(createFileTelemetryBackend(filePath));
    const seeded = await hydrateTelemetry();
    log.info(`Tool telemetry persistence enabled at ${filePath} (hydrated ${seeded} tools)`);

    if (!flushTimer) {
      flushTimer = setInterval(() => {
        void persistTelemetry().catch(err => log.warn(`telemetry flush failed: ${err?.message ?? err}`));
      }, FLUSH_INTERVAL_MS);
      if (typeof flushTimer.unref === 'function') flushTimer.unref();
    }
    return true;
  } catch (err: any) {
    log.warn(`Tool telemetry persistence init failed (continuing in-memory): ${err?.message ?? err}`);
    setTelemetryBackend(null);
    return false;
  }
}

/** Stop the periodic flush (one final persist). For graceful shutdown / tests. */
export async function stopToolTelemetryPersistence(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await persistTelemetry().catch(() => {});
}
