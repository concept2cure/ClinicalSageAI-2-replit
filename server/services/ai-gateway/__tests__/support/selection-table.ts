/**
 * What the gateway serves, path by path, over the real registry: the parity
 * oracle for ADR-0014 §4. Each cell drives the real `route()` on a fresh
 * gateway with the network call stubbed, and records the registry id that was
 * dispatched (or, for the fallback ladder, every id in the order it was
 * tried), or the terminal refusal's code.
 *
 * `gateway-selection-parity.json` was written by this function against the
 * gateway as it stood before §4 (HEAD 39b3027cc); governance-parity.test.ts
 * re-runs it and requires the same table.
 */
import { DEFAULT_MODELS } from '../../gateway';
import type { ProviderName, RoutingStrategy, TaskType } from '../../types';
import { governedGateway, request, stubDispatch } from './governed-gateway';

export const PARITY_TASKS: TaskType[] = [
  'chat',
  'document_analysis',
  'document_drafting',
  'structured_output',
  'regulatory_review',
  'code_generation',
  'summarization',
  'embedding',
  'general',
];
export const PARITY_STRATEGIES: RoutingStrategy[] = [
  'task_based',
  'quality_optimized',
  'cost_optimized',
  'latency_optimized',
  'round_robin',
];
export const PARITY_RISKS = ['none', 'low', 'medium', 'high'] as const;

type Risk = (typeof PARITY_RISKS)[number];
export type SelectionTable = Record<string, string>;

const ORG = 42;

function outcome(invoked: string[], err: unknown): string {
  if (err) {
    const e = err as { code?: string; reason?: string; name?: string };
    return `refused:${e.code ?? e.name}${e.reason ? `/${e.reason}` : ''}`;
  }
  return invoked.length ? invoked.join('>') : 'no-dispatch';
}

async function cell(
  providers: ProviderName[],
  req: Parameters<typeof request>[0],
  opts: { fail?: 'all'; unhealthy?: boolean } = {},
): Promise<string> {
  const gw = governedGateway({ providers });
  if (opts.unhealthy) {
    for (const health of (gw as any).providerHealth.values()) health.healthy = false;
  }
  const failAll = opts.fail === 'all' ? DEFAULT_MODELS.map((m) => m.id) : [];
  const invoked = stubDispatch(gw, failAll);
  let err: unknown = null;
  try {
    await gw.route(request({ organizationId: ORG, ...req }));
  } catch (e) {
    err = opts.fail === 'all' && (e as { name?: string }).name === 'GatewayAllProvidersFailedError' ? null : e;
  }
  return outcome(invoked, err);
}

const riskOf = (r: Risk) => (r === 'none' ? {} : { riskTier: r });

/**
 * The table for one provider set and task list: strategy selection
 * (`eligible`), relaxed selection (every provider unhealthy), the fallback
 * ladder (every rung fails) and explicit selection by registry id and by
 * provider + wire model.
 */
export async function selectionTable(providers: ProviderName[], tasks: TaskType[] = PARITY_TASKS): Promise<SelectionTable> {
  const table: SelectionTable = {};
  for (const taskType of tasks) {
    for (const risk of PARITY_RISKS) {
      for (const strategy of PARITY_STRATEGIES) {
        table[`strategy|${strategy}|${taskType}|${risk}`] = await cell(providers, { taskType, strategy, ...riskOf(risk) });
      }
      table[`relaxed|${taskType}|${risk}`] = await cell(providers, { taskType, ...riskOf(risk) }, { unhealthy: true });
      table[`fallback|${taskType}|${risk}`] = await cell(providers, { taskType, ...riskOf(risk) }, { fail: 'all' });
    }
  }
  for (const row of DEFAULT_MODELS) {
    for (const taskType of row.capabilities.filter((t) => tasks.includes(t))) {
      table[`explicit-id|${row.id}|${taskType}`] = await cell(providers, { taskType, model: row.id });
      table[`explicit-wire|${row.provider}/${row.model}|${taskType}`] = await cell(providers, {
        taskType,
        provider: row.provider,
        model: row.model,
      });
    }
  }
  return table;
}
