/**
 * A registered tool handler, called as if an APPROVED model produced the call.
 *
 * Tools that store model-authored text in a governed record refuse unless the
 * serving model is approved for high-risk work (governed-write-tools.ts, the
 * gate in registerToolHandler). Tests of such a tool's own behaviour — its
 * tenant scoping, its audit atomicity, its lineage — are not tests of model
 * governance, so they call it through this and state which model that is.
 * A context the test passes still wins, including its own servingModel.
 *
 * The governance itself is tested in governed-write-gate.test.ts.
 */
import { getToolHandler } from '../../AnaToolExecutor';

type ToolHandler = NonNullable<ReturnType<typeof getToolHandler>>;

export const APPROVED_SERVING_MODEL = { provider: 'anthropic', model: 'claude-opus-5' } as const;

export function approvedToolHandler(name: string): ToolHandler | undefined {
  const handler = getToolHandler(name);
  if (!handler) return undefined;
  return (input, ctx) => handler(input, { servingModel: APPROVED_SERVING_MODEL, ...(ctx ?? {}) } as never);
}
