/**
 * Legacy read-span history that waits for host admission (ANA-SUMMARY S1,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5; P-24 in
 * docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * Default legacy history records an original-byte-bound span admitted unchanged
 * by the host budget. The opt-in V2 ledger also pins extraction, actor and
 * exact payload identity. Neither history proves provider delivery.
 * read_project_document wrote its receipt as it returned — before the loop
 * host budgeted the round, and the budget cut a result (head and tail kept,
 * middle gone) whenever it ran over 8,000 characters, or the round over
 * 24,000. Coverage then passed on text the model never received, and the next
 * offset skipped the cut middle.
 *
 * Now a read registers its receipt here instead, keyed by its tool-use id and
 * holding the exact result it was issued with. The host budgets the round with
 * these as `wholeOrNothing` (budgetToolResultsForModel: such a result is sent
 * whole or replaced, never cut). The host revalidates current actor/source
 * before handoff; settlement accepts only an unchanged result and its writer
 * repeats current source checks inside a short transaction.
 *
 * fitReadWindow is the other half of the same rule: a windowed read sizes its
 * window so the serialized result fits RESULT_BUDGET, rather than let the cap
 * cut it.
 *
 * @module server/services/ana/read-receipts
 */

import type { RequestSqlClient } from '../../db/requestDb.js';
import { RESULT_BUDGET, CANCELLED_TOOL_RESULT, notDeliveredResult, type ToolResultEntry } from './agentic-loop.js';
import { computeCoverage, type Span, type SpanCoverageReport } from '../vault/document-catalog-core.js';
import { createScopedLogger } from '../../utils/logger.js';
import { snapshotDeferredReadReceipt, SourceReadCommitUnconfirmedError, SourceReadSnapshotError } from './source-read-receipt.js';
import type { SourceAdmissionWriteOutcome } from './source-read-receipt.js';
import type { AnaSourceReadSnapshot } from './source-read-receipt.js';
export type { AnaSourceReadSnapshot } from './source-read-receipt.js';

const logger = createScopedLogger('read-receipts');

export interface DeferredReadReceipt {
  /** Request read context only; guarded settlement owns its short transaction. */
  executor?: RequestSqlClient;
  documentId: string;
  contentHash: string;
  span: Span;
  readBy: number | null;
  sourceSnapshot: AnaSourceReadSnapshot;
  /** Server-computed when privately snapshotting; never a provider receipt. */
  resultSha256?: string;
  /** Private server deferral identity, never adopted from tool input/result fields. */
  admissionId?: string;
  toolUseId?: string | null;
  /** Exact handler payload eligible for unchanged host admission. */
  result: string;
}

/** One round's receipts waiting on delivery, by tool_use_id. A loop host makes one per round. */
export type DeferredReadReceipts = Map<string, DeferredReadReceipt>;

/** The two ToolContext fields this rides on. Set by a loop host, per call; never from input. */
export interface ReadReceiptContext {
  toolUseId?: string | null;
  readReceipts?: DeferredReadReceipts | null;
}

/** What a loop host adds to one call's tool context. */
export function readReceiptContext(deferred: DeferredReadReceipts, toolUseId: string): ReadReceiptContext {
  return { toolUseId, readReceipts: deferred };
}

/** True when this call runs in a host that settles legacy span history. */
export function canDeferReadReceipt(ctx: ReadReceiptContext | undefined): boolean {
  return Boolean(ctx?.toolUseId && ctx.readReceipts);
}

/** Privately pin source and payload before any await or caller mutation. */
export function deferReadReceipt(ctx: ReadReceiptContext | undefined, receipt: DeferredReadReceipt): boolean {
  if (!ctx?.toolUseId || !ctx.readReceipts) return false;
  try {
    ctx.readReceipts.set(ctx.toolUseId, snapshotDeferredReadReceipt(receipt, ctx.toolUseId));
    return true;
  } catch {
    ctx.readReceipts.delete(ctx.toolUseId);
    return false;
  }
}

/** Coverage as it will stand once `span` is recorded beside the receipts `before` counted. */
export function coverageAfter(before: SpanCoverageReport, span: Span, charCount: number): SpanCoverageReport {
  const covered: Span[] = [];
  let cursor = 0;
  for (const gap of before.uncovered) {
    if (gap.start > cursor) covered.push({ start: cursor, end: gap.start });
    cursor = Math.max(cursor, gap.end);
  }
  if (before.charCount > cursor) covered.push({ start: cursor, end: before.charCount });
  return computeCoverage([...covered, span], charCount);
}

/**
 * The largest window whose serialized result fits RESULT_BUDGET, found by
 * bisecting its size between 1 and `asked`. `render(size)` builds the whole
 * result for a window of that many characters.
 *
 * A window's text length is not its weight: quotes, backslashes, newlines and
 * control characters grow when serialized (a control character to six bytes).
 * Cutting one character per byte over dropped a control-heavy text to
 * 1-character windows, which is why this bisects. A window of 1 is returned
 * even if it does not fit: a reader must always advance.
 */
export function fitReadWindow(render: (size: number) => string, asked: number): { size: number; result: string } {
  const full = render(asked);
  if (full.length <= RESULT_BUDGET || asked <= 1) return { size: asked, result: full };
  let lo = 1;
  let best = render(1);
  if (best.length > RESULT_BUDGET) return { size: 1, result: best };
  let hi = asked - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const out = render(mid);
    if (out.length <= RESULT_BUDGET) {
      lo = mid;
      best = out;
    } else hi = mid - 1;
  }
  return { size: lo, result: best };
}

type ReceiptWriter = (receipt: DeferredReadReceipt) => Promise<void | SourceAdmissionWriteOutcome>;
export type ReceiptSettlementOutcome = SourceAdmissionWriteOutcome | { checkpoint: 'legacy_byte_history'; outcome: 'recorded'; legacyReceipt: 'recorded' };

/** One canonical guarded writer; existing stored rows remain byte-bound legacy history. */
async function vaultReceiptWriter(signal?: AbortSignal): Promise<ReceiptWriter> {
  const helper = await import('./source-read-receipt.js');
  return receipt => helper.writeGuardedReadReceipt(receipt, undefined, { signal });
}

/** The unchanged handler payloads admitted by the host budget. */
function hostAdmittedReceipts(
  original: readonly ToolResultEntry[],
  budgeted: readonly ToolResultEntry[],
  deferred: DeferredReadReceipts,
): Array<{ toolUseId: string; receipt: DeferredReadReceipt }> {
  const sent = new Map(budgeted.map(e => [e.tool_use_id, e.content]));
  const seen = new Set<string>();
  return original.flatMap(entry => {
    if (seen.has(entry.tool_use_id)) return [];
    seen.add(entry.tool_use_id);
    const receipt = deferred.get(entry.tool_use_id);
    const unchanged = receipt && entry.content === receipt.result && sent.get(entry.tool_use_id) === receipt.result;
    return unchanged ? [{ toolUseId: entry.tool_use_id, receipt }] : [];
  });
}

type ReceiptVerifier = (receipt: DeferredReadReceipt) => Promise<void>;
const handoffRefusal = (cancelled: boolean): string => JSON.stringify({
  ok: false, code: cancelled ? 'ANA_SOURCE_READ_CANCELLED' : 'ANA_SOURCE_READ_NOT_ADMITTED',
  ...(cancelled ? { cancelled: true } : {}),
  sourceContext: 'not_admitted', receiptRecorded: false,
  error: cancelled ? 'The source read was cancelled before host handoff.'
    : 'Current source access or exact source text could not be verified. Read the current source again.',
});

/** An observed source refusal during insertion withdraws new source context.
 * Receipt outcome is unconfirmed: this never invents rollback after a real commit. */
export function withdrawSourceReadResult(entries: ToolResultEntry[], toolUseId: string,
  opts: { signal?: AbortSignal } = {}): void {
  const cancelled = Boolean(opts.signal?.aborted);
  const content = JSON.stringify({ ok: false,
    code: cancelled ? 'ANA_SOURCE_READ_CANCELLED' : 'ANA_SOURCE_READ_NOT_ADMITTED',
    ...(cancelled ? { cancelled: true } : {}), sourceContext: 'not_admitted',
    legacyReceiptOutcome: 'unconfirmed',
    error: cancelled ? 'The source read was cancelled before host handoff.'
      : 'Current source access or exact source text could not be verified. Read the current source again.',
  });
  for (const entry of entries) if (entry.tool_use_id === toolUseId) entry.content = content;
}

function notifySourceRefusal(onSourceRefused: ((toolUseId: string) => void) | undefined, toolUseId: string): void {
  try { onSourceRefused?.(toolUseId); }
  catch { logger.warn('source refusal notification failed', { toolUseId }); }
}

async function guardReadEntry(entry: ToolResultEntry, originalById: Map<string, string>,
  deferred: DeferredReadReceipts, verifier: ReceiptVerifier, signal?: AbortSignal): Promise<ToolResultEntry> {
  const receipt = deferred.get(entry.tool_use_id);
  if (!receipt) return { ...entry };
  const unchanged = originalById.get(entry.tool_use_id) === receipt.result && entry.content === receipt.result;
  if (!unchanged) {
    deferred.delete(entry.tool_use_id);
    const safeReplacement = entry.content === notDeliveredResult(receipt.span.start)
      || entry.content === JSON.stringify(CANCELLED_TOOL_RESULT(entry.name));
    return { ...entry, content: safeReplacement ? entry.content : handoffRefusal(Boolean(signal?.aborted)) };
  }
  try {
    if (signal?.aborted) throw new Error('cancelled');
    await verifier(receipt);
    if (signal?.aborted) throw new Error('cancelled');
    return { ...entry };
  } catch {
    deferred.delete(entry.tool_use_id);
    return { ...entry, content: handoffRefusal(Boolean(signal?.aborted)) };
  }
}

/** Last controlled, point-in-time check before new source context is staged.
 * Never exposes refused source text/metadata or claims provider service.
 * Retained candidates still require unchanged settlement and guarded insertion. */
export async function guardReadResultsForHandoff(
  original: readonly ToolResultEntry[],
  budgeted: readonly ToolResultEntry[],
  deferred: DeferredReadReceipts,
  opts: { signal?: AbortSignal; verify?: ReceiptVerifier } = {},
): Promise<ToolResultEntry[]> {
  const sourceReadIds = new Set(deferred.keys());
  const originalById = new Map(original.map(entry => [entry.tool_use_id, entry.content]));
  const helper = await import('./source-read-receipt.js');
  const verifier = opts.verify ?? (receipt => helper.verifyDeferredReadReceipt(receipt, undefined, { signal: opts.signal }));
  const guarded: ToolResultEntry[] = [];
  for (const entry of budgeted) {
    guarded.push(await guardReadEntry(entry, originalById, deferred, verifier, opts.signal));
  }
  // A cancellation while a later read was checked also withdraws earlier
  // candidates in this round; a late completion cannot revive them.
  if (opts.signal?.aborted) {
    for (const entry of guarded) if (sourceReadIds.has(entry.tool_use_id)) {
      deferred.delete(entry.tool_use_id); entry.content = handoffRefusal(true);
    }
  }
  return guarded;
}

function settlementOutcome(receipt: DeferredReadReceipt, result: void | SourceAdmissionWriteOutcome): ReceiptSettlementOutcome {
  if (result === undefined) return { checkpoint: 'legacy_byte_history', outcome: 'recorded', legacyReceipt: 'recorded' };
  if (!result || result.checkpoint !== 'host_budget_admitted' || result.receiptId !== receipt.admissionId ||
      !['recorded', 'already_recorded'].includes(result.outcome) ||
      !['recorded', 'not_recorded_permission_denied'].includes(result.legacyReceipt)) {
    throw new Error('Read-admission persistence outcome could not be confirmed.');
  }
  return result;
}

function notifyReceiptSettlement(callback: ((toolUseId: string, outcome: ReceiptSettlementOutcome) => void) | undefined,
  toolUseId: string, outcome: ReceiptSettlementOutcome): void {
  try { callback?.(toolUseId, outcome); }
  catch { logger.warn('read receipt settlement notification failed', { toolUseId }); }
}

function logReceiptFailure(error: unknown, documentId: string): void {
  if (error instanceof SourceReadCommitUnconfirmedError) {
    const recovery = error.recovery;
    logger.warn('read receipt outcome unconfirmed', { code: error.code, outcome: error.outcome,
      recovery: { organizationId: recovery.organizationId, actorId: recovery.actorId, documentId: recovery.documentId,
        ...(recovery.receiptId === undefined ? {} : { receiptId: recovery.receiptId }),
        ...(recovery.legacyReceiptId === undefined ? {} : { legacyReceiptId: recovery.legacyReceiptId }) } });
    return;
  }
  logger.warn('read receipt not written', { documentId, error: error instanceof Error ? error.message : String(error) });
}

/**
 * Record unchanged host-budget admission: legacy spans by default, or the
 * opt-in exact-source ledger. This is never provider delivery or comprehension.
 *
 * Unchanged means both: the call's result (`original`) is the very string the
 * receipt was issued with, and the budget passed it through (`budgeted`) byte
 * for byte. A result that was replaced as not delivered, answered as cancelled
 * or amended writes nothing. A write that fails is logged and skipped: the
 * catalog retains its existing legacy coverage meaning. Never throws; clears
 * `deferred`; counts acknowledged NEW logical receipts, excluding identical
 * durable retries and never adding legacy+durable rows together. Optional
 * notifications distinguish durable idempotence and absent legacy history.
 */
export async function settleReadReceipts(
  original: readonly ToolResultEntry[],
  budgeted: readonly ToolResultEntry[],
  deferred: DeferredReadReceipts,
  write?: ReceiptWriter,
  opts: { signal?: AbortSignal; onSourceRefused?: (toolUseId: string) => void; onReceiptSettled?: (toolUseId: string, outcome: ReceiptSettlementOutcome) => void } = {},
): Promise<number> {
  const receipts = hostAdmittedReceipts(original, budgeted, deferred);
  deferred.clear();
  if (receipts.length === 0 || opts.signal?.aborted) return 0;
  let written = 0;
  try {
    const writer = write ?? (await vaultReceiptWriter(opts.signal));
    for (const { toolUseId, receipt } of receipts) {
      if (opts.signal?.aborted) break;
      try {
        const result = await writer(receipt);
        const outcome = settlementOutcome(receipt, result);
        if (outcome.outcome === 'recorded') written++;
        notifyReceiptSettlement(opts.onReceiptSettled, toolUseId, outcome);
      } catch (err) {
        logReceiptFailure(err, receipt.documentId);
        if (err instanceof SourceReadSnapshotError) {
          notifySourceRefusal(opts.onSourceRefused, toolUseId);
          // A locally observed source/scope refusal ends this round's new
          // receipt attempts. Earlier real commits remain counted as history.
          break;
        }
      }
    }
  } catch (err) {
    logger.warn('read receipts not written', { count: receipts.length, error: err instanceof Error ? err.message : String(err) });
  }
  return written;
}
