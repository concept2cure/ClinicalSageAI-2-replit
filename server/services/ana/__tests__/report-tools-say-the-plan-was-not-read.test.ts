/**
 * AnA's report tools say the plan was not read, and name no plan, when the
 * report plan gate could not read it (2026-10-15).
 *
 * What the code used to do: get_portfolio_readiness, generate_report and
 * explain_report_blockers answered every refusal of requireReportEntitlement
 * with "… requires the <requiredTier> plan." and `tier: gate.tier`. On an
 * unread plan the gate refuses with its compatibility tier 'standard' and
 * tierResolved:false, so AnA told the user their plan was 'standard' and that a
 * plan they may hold was required.
 *
 * The gate and the capability resolver are the real ones; only the pool
 * answers are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../db/runtime';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

/** Stub every pool read; `tier: null` makes the organizations.tier read fail. */
function stubPool(tier: string | null) {
  const route: QueryFn = async (text) => {
    if (text.includes('SELECT tier FROM organizations')) {
      if (tier === null) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      return { rows: [{ tier }] };
    }
    return { rows: [] };
  };
  return vi.spyOn(getPool() as unknown as { query: QueryFn }, 'query').mockImplementation(route);
}

async function run(tool: string, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler(tool)!(input, { organizationId: 7 }));
}

const REPORT = { report_type_id: 'readiness.executive_digest', scope_type: 'project', scope_id: '11' };
const TOOLS = [
  {
    tool: 'get_portfolio_readiness', input: { program_group_id: 5 },
    unread: 'Your plan could not be read, so the portfolio rollup was not loaded.',
    read: 'Portfolio rollup requires the enterprise plan.',
  },
  {
    tool: 'generate_report', input: REPORT,
    unread: 'Your plan could not be read, so the report was not generated.',
    read: 'This report requires the standard plan.',
  },
  {
    tool: 'explain_report_blockers', input: REPORT,
    unread: "Your plan could not be read, so the report's blockers were not computed.",
    read: 'This report requires the standard plan.',
  },
];

afterEach(() => vi.restoreAllMocks());

describe('AnA report tools on a plan that could not be read', () => {
  it.each(TOOLS)('$tool says the plan could not be read and names no plan', async ({ tool, input, unread }) => {
    stubPool(null);
    const out = await run(tool, input);
    expect(out).toMatchObject({ ok: true, locked: true, message: unread });
    expect(out.tier, 'an unread plan was named as the organization’s plan').toBeNull();
  });

  it.each(TOOLS)('$tool still names the required plan when the plan was read (control)', async ({ tool, input, read }) => {
    stubPool('free');
    const out = await run(tool, input);
    expect(out).toMatchObject({ ok: true, locked: true, message: read, tier: 'free' });
  });
});
