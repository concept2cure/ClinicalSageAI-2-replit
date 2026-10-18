/**
 * The governed-decision ledger's write path.
 *
 * Two things the repository needs and that belong together: the queue that
 * keeps a ledger write off the request's critical section, and the lookup that
 * finds a row by the id its caller was actually handed. Split out of
 * governed-decision-repository.ts, which keeps the query and summary API.
 * Nothing here imports that module, so the dependency runs one way.
 *
 * @module server/services/governed-decision-ledger
 */

import { createScopedLogger } from '../utils/logger';
import { governanceMetrics } from './governance-observability';
import type { DecisionRecord } from './decision-record-service.js';
import type { GovernedDecisionReference } from '../../shared/types/governed-document-fabric';

const log = createScopedLogger('governed-decision-ledger');

/**
 * The prefix this writer puts on `decision_code`.
 *
 * Not the discriminator — that is the JSONB `kind` above. This exists because
 * `create` lets the database mint the primary key while the caller is handed an
 * id minted here, so `decision_code` is the only column that holds the id every
 * caller actually has. See resolveGovernedDecisionRow.
 */
export const GOVERNED_FABRIC_CODE_PREFIX = 'governed-fabric:';

/**
 * Ledger writes run one at a time, and never inside the caller's critical
 * section.
 *
 * ## Why this queue exists
 *
 * These writes used to be free, because they all failed: the row violated two
 * CHECK constraints and PostgreSQL rejected it before touching a page. Making
 * them succeed made them real work, and real work fired unawaited — the
 * evaluator's hot path calls `recordGovernedDecisionSync`, which deliberately
 * does not await — competes for the same 20-connection pool as the request
 * that triggered it.
 *
 * That competition is not theoretical. A Module 3 compile holds a transaction
 * open while it calls `resolveSubmissionSpine`, which reads through the shared
 * pool. With a compile's worth of ledger writes in flight there was no
 * connection left to serve that read, so the compile's transaction sat idle
 * holding its locks, every other writer queued behind it on
 * `Lock/transactionid`, and the 30s `statement_timeout` cancelled them.
 * Measured: the CMC staff simulation went from 118 passed / 0 failed to 114/4,
 * all four cascading from one compile that waited 30.0s on an INSERT into
 * `cmc_module3_sections`.
 *
 * So the ledger gets exactly one connection's worth of concurrency, taken
 * after the current turn of the event loop. A governance record is not worth a
 * millisecond of the transaction it describes, and an audit writer that can
 * starve the thing it audits is a worse failure than a slow one.
 *
 * Failures stay data: they are counted and logged here, exactly as the inline
 * catch did, so `governanceMetrics` remains the honest signal.
 *
 * Resolves true when the row was written and false when it was not. It resolved
 * the same either way until 2026-10-15, so a caller handed out the decisionId
 * of a row that might not exist.
 */
let ledgerQueue: Promise<void> = Promise.resolve();

export function enqueueLedgerWrite(write: () => Promise<void>, decisionId: string): Promise<boolean> {
  const written = ledgerQueue.then(async () => {
    // Yield first, so the write can never run synchronously inside the
    // caller's transaction on the same tick.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    try {
      await write();
      return true;
    } catch (err) {
      governanceMetrics.recordPersistenceFailure('recordGovernedDecision', err);
      log.warn('Governed decision durable write failed', {
        decisionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  });
  ledgerQueue = written.then(() => undefined);
  return written;
}

/**
 * The pending ledger write behind each reference the evaluator's hot path
 * (recordGovernedDecisionSync) hands out. That reference is returned before
 * its queued insert has run, and the insert can fail or be refused; a caller
 * that shows the decisionId, or files it in another record, asks
 * governedDecisionPersisted first. Keyed by the reference object, so an entry
 * lives exactly as long as the reference does.
 */
const decisionWrites = new WeakMap<GovernedDecisionReference, Promise<boolean>>();

/**
 * Register the background write behind a hot-path reference. A refusal (no
 * valid organization, no actor) is thrown before the queue, so nothing else has
 * counted or logged it: it is counted and logged here, and answers false. The
 * hot path's catch read "Already logged" and was silent until 2026-10-15.
 */
export function trackGovernedDecisionWrite(
  reference: GovernedDecisionReference,
  write: Promise<{ persisted: boolean }>,
): void {
  decisionWrites.set(reference, write.then(
    (recorded) => recorded.persisted,
    (err: unknown) => {
      governanceMetrics.recordPersistenceFailure('recordGovernedDecision', err);
      log.warn('Governed decision not recorded', {
        decisionId: reference.decisionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    },
  ));
}

/**
 * Whether the decision_records row behind a hot-path reference was written.
 * False when the write failed or was refused — and for a reference no write
 * was registered for, since nothing then shows that one was recorded.
 */
export function governedDecisionPersisted(reference: GovernedDecisionReference): Promise<boolean> {
  return decisionWrites.get(reference) ?? Promise.resolve(false);
}

/**
 * The actor an evaluation names, or null when it names no one: absent, blank,
 * a stringified absent value, or user 0 (no user has id 0). recordGovernedDecision
 * refuses such an evaluation; it filed it as decided by 'system' until 2026-10-15.
 */
export function statedActorId(actorId: unknown): string | null {
  if (typeof actorId !== 'string') return null;
  const value = actorId.trim();
  return value === '' || value === 'undefined' || value === 'null' || value === '0' ? null : value;
}

/**
 * Find the decision_records row a governed-fabric decisionId names.
 *
 * `recordGovernedDecision` mints the decisionId itself and hands it to the
 * caller, but `create` lets the database mint the primary key — so the id
 * every caller holds is stored only in `decision_code`, and a `WHERE id = $1`
 * lookup on it could never match. Resolve by the code first; fall back to the
 * primary key so a row addressed by its real id still resolves.
 */
export async function resolveGovernedDecisionRow(
  decisionId: string,
  organizationId: number,
): Promise<DecisionRecord | null> {
  const { decisionRecordService } = await import('./decision-record-service.js');
  const byCode = await decisionRecordService.getByDecisionCode(
    `${GOVERNED_FABRIC_CODE_PREFIX}${decisionId}`,
    organizationId,
  );
  if (byCode) return byCode;
  return decisionRecordService.getById(decisionId, organizationId);
}

/**
 * Which project column a search should filter on.
 *
 * decision_records.project_id is INTEGER NOT NULL, and this platform's projects
 * are uuid-keyed programs. Number(uuid) is NaN, which search() reads as "no
 * project filter" and answers with every project's decisions — so a uuid is
 * matched on decision_context->>'projectRef', which the writer stamps, and only
 * a genuine integer goes to the column.
 */
export function projectFilterFor(
  projectId: string | undefined,
): { projectId?: number; projectRef?: string } {
  if (!projectId) return {};
  const asNumber = Number(projectId);
  return Number.isFinite(asNumber) ? { projectId: asNumber } : { projectRef: String(projectId) };
}
