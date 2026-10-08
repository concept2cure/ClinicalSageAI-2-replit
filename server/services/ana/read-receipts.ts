/**
 * Read receipts that wait for delivery (ANA-SUMMARY S1,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5; P-24 in
 * docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * A read receipt says the model was served a span of a document's text, and
 * catalog_project_document refuses until the receipts cover all of it.
 * read_project_document wrote its receipt as it returned — before the loop
 * host budgeted the round, and the budget cut a result (head and tail kept,
 * middle gone) whenever it ran over 8,000 characters, or the round over
 * 24,000. Coverage then passed on text the model never received, and the next
 * offset skipped the cut middle.
 *
 * Now a read registers its receipt here instead, keyed by its tool-use id and
 * holding the exact result it was issued with. The host budgets the round with
 * these as `wholeOrNothing` (budgetToolResultsForModel: such a result is sent
 * whole or replaced, never cut), then calls settleReadReceipts, which writes a
 * receipt only for a result the model is sent byte for byte as returned.
 *
 * fitReadWindow is the other half of the same rule: a windowed read sizes its
 * window so the serialized result fits RESULT_BUDGET, rather than let the cap
 * cut it.
 *
 * @module server/services/ana/read-receipts
 */

import { RESULT_BUDGET, type ToolResultEntry } from './agentic-loop.js';
import { computeCoverage, type Span, type SpanCoverageReport } from '../vault/document-catalog-core.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('read-receipts');

export interface DeferredReadReceipt {
  documentId: string;
  contentHash: string;
  span: Span;
  readBy: number | null;
  /** The serialized result this receipt was issued with: written only if the model is sent exactly this. */
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

/** True when this call runs in a host that settles receipts on delivery. */
export function canDeferReadReceipt(ctx: ReadReceiptContext | undefined): boolean {
  return Boolean(ctx?.toolUseId && ctx.readReceipts);
}

/** Register a read's receipt against its call. False, and nothing kept, outside a settling host. */
export function deferReadReceipt(ctx: ReadReceiptContext | undefined, receipt: DeferredReadReceipt): boolean {
  if (!ctx?.toolUseId || !ctx.readReceipts) return false;
  ctx.readReceipts.set(ctx.toolUseId, receipt);
  return true;
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

type ReceiptWriter = (receipt: DeferredReadReceipt) => Promise<void>;

/** The Vault's receipt write, loaded once per settlement (the service reaches the database). */
async function vaultReceiptWriter(): Promise<ReceiptWriter> {
  const svc = await import('../vault/document-catalog.service.js');
  return receipt =>
    svc.recordReadReceipt({
      documentId: receipt.documentId,
      contentHash: receipt.contentHash,
      span: receipt.span,
      readBy: receipt.readBy,
    });
}

/** The receipts whose read reached the model as returned: same string from handler to budget. */
function deliveredReceipts(
  original: readonly ToolResultEntry[],
  budgeted: readonly ToolResultEntry[],
  deferred: DeferredReadReceipts,
): DeferredReadReceipt[] {
  const sent = new Map(budgeted.map(e => [e.tool_use_id, e.content]));
  return original.flatMap(entry => {
    const receipt = deferred.get(entry.tool_use_id);
    const unchanged = receipt && entry.content === receipt.result && sent.get(entry.tool_use_id) === receipt.result;
    return unchanged ? [receipt] : [];
  });
}

/**
 * Write the receipt of every read the model is sent unchanged, after the host
 * budgeted the round.
 *
 * Unchanged means both: the call's result (`original`) is the very string the
 * receipt was issued with, and the budget passed it through (`budgeted`) byte
 * for byte. A result that was replaced as not delivered, answered as cancelled
 * or amended writes nothing. A write that fails is logged and skipped: the
 * catalog then refuses on the missing span and names it, which is the safe
 * direction. Never throws; clears `deferred`; returns how many were written.
 */
export async function settleReadReceipts(
  original: readonly ToolResultEntry[],
  budgeted: readonly ToolResultEntry[],
  deferred: DeferredReadReceipts,
  write?: ReceiptWriter,
): Promise<number> {
  const receipts = deliveredReceipts(original, budgeted, deferred);
  deferred.clear();
  if (receipts.length === 0) return 0;
  let written = 0;
  try {
    const writer = write ?? (await vaultReceiptWriter());
    for (const receipt of receipts) {
      try {
        await writer(receipt);
        written++;
      } catch (err) {
        logger.warn('read receipt not written', { documentId: receipt.documentId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    logger.warn('read receipts not written', { count: receipts.length, error: err instanceof Error ? err.message : String(err) });
  }
  return written;
}
