/**
 * Call an AnA tool the way her turn does (ANA-SUMMARY S1).
 *
 * A read's receipt waits on delivery (server/services/ana/read-receipts.ts):
 * the read registers it, and the loop host writes it only once the model has
 * the result unchanged. A bare handler call therefore records no coverage, by
 * design. This resolves the handler through the real executor registry, gives
 * it the turn's receipt context, and settles the round as delivered whole —
 * what a turn whose round fits its budget does. Run it inside the tenant scope
 * the receipt write needs.
 */
import type { ToolContext } from '../../server/services/ana/AnaToolExecutor';

export async function callToolAsTurn(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, any>> {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const { readReceiptContext, settleReadReceipts } = await import('../../server/services/ana/read-receipts');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`tool ${name} is not registered`);
  const deferred = new Map();
  const out = await handler(input, { ...ctx, ...readReceiptContext(deferred, 'dbtest') });
  const sent = [{ tool_use_id: 'dbtest', name, content: out }];
  await settleReadReceipts(sent, sent, deferred);
  return JSON.parse(out);
}
