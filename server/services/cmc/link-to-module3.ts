/**
 * Link a saved CMC register row into the Module 3 canonical layer and report
 * what actually happened.
 *
 * This is the ONE path from a register save to `cmc_source_objects`, and the
 * one place a propagation failure is observed. Every register — the older
 * ones in server/api/cmc/routes.ts, the batch record and specification routes,
 * and the newer registers this function was written for — awaits it and
 * spreads its result into the response:
 *
 *     const linkage = await linkToModule3('write_through_x', orgId, row, writeThroughX, req);
 *     res.json({ success: true, data: row, ...linkage });
 *
 * ── Why it is shared ─────────────────────────────────────────────────────────
 * It used to live in routes.ts and serve five registers. The other eleven did
 * `writeThroughX(...).catch(observe)` and moved on — but the write-through
 * swallowed its own errors, so the `.catch` never ran, no metric was ever
 * incremented, and the response claimed nothing either way. A recorded
 * method, batch or specification could silently never reach the dossier.
 * `writeThroughToCanonicalSource` now answers `{ ok, ... }` (see
 * WriteThroughOutcome), and this function is what turns that answer into the
 * response fields and the metric.
 *
 * The register row is NEVER rolled back on a propagation failure: it is real
 * recorded data whether or not the dossier layer accepted it this second, and
 * saving it again re-attempts the link.
 *
 * @module server/services/cmc/link-to-module3
 */
import type express from 'express';
import { createScopedLogger } from '../../utils/logger';
/* metrics.js is plain JavaScript — the same import routes/c2c/shared.ts
   carries; the repo's check config resolves it without a declaration file. */
import * as metricsModule from '../../metrics.js';
import type { WriteThroughOutcome } from '../cmc-write-through';

const logger = createScopedLogger('cmc-module3-link');

/** A `writeThroughX` convenience wrapper from services/cmc-write-through. */
export type WriteThroughFn = (
  orgId: number,
  projectId: string,
  recordId: string,
  record: Record<string, any>,
) => Promise<WriteThroughOutcome>;

/**
 * A saved register row. `projectId` is the Drizzle column, `project_id` the
 * raw pg column the batch, specification and comparability routes return —
 * the id is only ever stringified into the source key, so a serial and a uuid
 * are both fine.
 */
export interface LinkableRow {
  id: number | string;
  projectId?: string | null;
  project_id?: string | null;
}

/** What the response says about the Module 3 link. */
export interface Module3Linkage {
  module3Linked: boolean;
  module3Warning?: string;
}

export const MODULE3_NO_PROJECT_WARNING =
  'Saved to the register only. No project is set on this record, so it does not feed Module 3 yet.';

export const MODULE3_WRITE_FAILED_WARNING =
  'Saved to the register. The Module 3 canonical write did not complete, so this record is not composed into the dossier yet; saving it again re-attempts the link.';

/**
 * Observe a failed canonical write-through to the Module 3 submission source
 * object: logged with the record and the propagation, and metered as a
 * `propagation_failed` error under `cmc_<propagation>`. The primary response
 * is never blocked on this, and a metric sink that throws never reaches the
 * request.
 * TODO(GA): consider retry/queue for guaranteed write-through.
 */
export function observeWriteThroughFailure(
  propagation: string,
  recordId: string | number,
  err: unknown,
): void {
  logger.error('Module 3 canonical write-through failed', {
    recordId: String(recordId),
    propagation,
    error: err instanceof Error ? err.message : String(err),
  });
  try {
    (metricsModule as any).metrics.concept2cureErrors.inc({
      operation: `cmc_${propagation}`,
      error_type: 'propagation_failed',
    });
  } catch {
    /* metric increment must never affect request flow */
  }
}

/**
 * Where the program comes from when the row does not carry it: the HTTP route
 * passes its request (the body's projectId is read); an in-process caller —
 * the interview commit projector — names it directly.
 */
export type ProjectSource = Pick<express.Request, 'body'> | { projectId?: string | null };

function isRequestSource(source: ProjectSource): source is Pick<express.Request, 'body'> {
  return 'body' in source;
}

/**
 * The project a canonical write-through is keyed on: the stored row first,
 * and the request body (or the named project) only when a source is given.
 *
 * The registers whose tables carry no project column (analytical methods,
 * process validation, stability, QC, change control, drug substance, drug
 * product) take the program from the body. The batch, specification and
 * comparability routes store it, and read it from the row alone — a caller
 * must not be able to link an unfiled record under a program it is not filed
 * in by naming one in the body.
 */
export function writeThroughProjectId(
  row: Pick<LinkableRow, 'projectId' | 'project_id'>,
  source?: ProjectSource,
): string | null {
  const stored = typeof row.projectId === 'string' ? row.projectId.trim() : '';
  if (stored) return stored;
  const raw = typeof row.project_id === 'string' ? row.project_id.trim() : '';
  if (raw) return raw;
  if (!source) return null;
  const sent = isRequestSource(source)
    ? (source.body as { projectId?: unknown } | undefined)?.projectId
    : source.projectId;
  return typeof sent === 'string' && sent.trim() ? sent.trim() : null;
}

/**
 * Link a saved register row into the Module 3 canonical layer and report what
 * actually happened.
 *
 * - No project: not linked, said so, NOT metered — a refusal is not a failure.
 * - `ok: true`: linked.
 * - `ok: false` (or a write-through that throws, e.g. a mapper on a bad row):
 *   not linked, with the warning, and metered under `cmc_<propagation>`.
 *
 * `module3Linked: true` over a write that failed would be the exact lie the
 * field exists to prevent, so the write is awaited and its real outcome is
 * what the response carries.
 */
export async function linkToModule3(
  propagation: string,
  orgId: number,
  row: LinkableRow,
  writeThrough: WriteThroughFn,
  source?: ProjectSource,
): Promise<Module3Linkage> {
  const projectId = writeThroughProjectId(row, source);
  if (!projectId) {
    return { module3Linked: false, module3Warning: MODULE3_NO_PROJECT_WARNING };
  }
  let outcome: WriteThroughOutcome;
  try {
    outcome = await writeThrough(orgId, projectId, String(row.id), row as Record<string, any>);
  } catch (err) {
    observeWriteThroughFailure(propagation, row.id, err);
    return { module3Linked: false, module3Warning: MODULE3_WRITE_FAILED_WARNING };
  }
  if (outcome.ok) return { module3Linked: true };
  if (outcome.code === 'no_project') {
    return { module3Linked: false, module3Warning: MODULE3_NO_PROJECT_WARNING };
  }
  observeWriteThroughFailure(propagation, row.id, outcome.reason);
  return { module3Linked: false, module3Warning: MODULE3_WRITE_FAILED_WARNING };
}
