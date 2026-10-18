/**
 * AnA's capability tools say the plan was not read (2026-10-15).
 *
 * What the code used to do: get_org_capabilities spread the resolver's answer,
 * in which a failed organizations.tier read had become tier 'standard' with the
 * standard-tier features enabled, and a failed toggle or module read had become
 * [] with nothing saying so. list_report_types caught any failure as
 * 'standard' and decided each report type's `entitled` on that plan, returning
 * ok:true, tier:'standard'.
 *
 * The resolver here is the real one; only the pool answers are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../db/runtime';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const REGISTRY = [
  { type_id: 'readiness.executive_digest', label: 'Executive digest', family: 'readiness', allowed_scopes: ['project'], allowed_personas: [], allowed_client_segments: [] },
  { type_id: 'portfolio.board_pack', label: 'Board pack', family: 'portfolio', allowed_scopes: ['project'], allowed_personas: [], allowed_client_segments: [] },
];

/** Stub every pool read; `tier: null` makes the organizations.tier read fail. */
function stubPool(opts: { tier: string | null; failToggles?: boolean }) {
  const route: QueryFn = async (text) => {
    if (text.includes('SELECT tier FROM organizations')) {
      if (opts.tier === null) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      return { rows: [{ tier: opts.tier }] };
    }
    if (text.includes('FROM feature_toggles')) {
      if (opts.failToggles) throw new Error('relation "feature_toggles" does not exist');
      return { rows: [] };
    }
    if (text.includes('FROM report_type_registry')) return { rows: REGISTRY };
    return { rows: [] };
  };
  return vi.spyOn(getPool() as unknown as { query: QueryFn }, 'query').mockImplementation(route);
}

async function run(tool: string, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler(tool)!(input, { organizationId: 7 }));
}

afterEach(() => vi.restoreAllMocks());

describe('get_org_capabilities', () => {
  it('names no plan and enables nothing by it when the plan could not be read', async () => {
    stubPool({ tier: null });
    const out = await run('get_org_capabilities', {});
    expect(out.tier, 'an unread plan was named').toBeNull();
    expect(out.tierResolved).toBe(false);
    expect(out.notRead).toEqual(['plan tier']);
    const byTier = out.features.filter((f: { enabled: boolean; source: string }) => f.enabled && f.source === 'tier');
    expect(byTier, 'features were enabled by a plan nobody read').toEqual([]);
  });

  it('says a feature-toggle read failed instead of returning "no flags"', async () => {
    stubPool({ tier: 'professional', failToggles: true });
    const out = await run('get_org_capabilities', {});
    expect(out).toMatchObject({ tier: 'professional', tierResolved: true, togglesResolved: false, toggles: [] });
    expect(out.notRead).toEqual(['feature toggles']);
  });

  it('control: everything read carries no not-read marker', async () => {
    stubPool({ tier: 'professional' });
    const out = await run('get_org_capabilities', {});
    expect(out).toMatchObject({ ok: true, tier: 'professional', tierResolved: true, togglesResolved: true, modulesResolved: true });
    expect(out.notRead).toBeUndefined();
  });
});

describe('list_report_types', () => {
  it('decides no entitlement on a plan nobody read, and says the plan was not read', async () => {
    stubPool({ tier: null });
    const out = await run('list_report_types', { scope: 'project' });
    expect(out.tier, 'an unread plan was named').toBeNull();
    expect(out.tierResolved).toBe(false);
    expect(out.reportTypes).toHaveLength(2);
    for (const t of out.reportTypes) {
      expect(t.entitled, `${t.typeId} was decided on a plan nobody read`).toBeNull();
    }
    expect(out.note).toMatch(/plan could not be read/i);
  });

  it('control: a read plan annotates each type with its verdict', async () => {
    stubPool({ tier: 'standard' });
    const out = await run('list_report_types', { scope: 'project' });
    expect(out).toMatchObject({ ok: true, tier: 'standard', tierResolved: true });
    const entitled = Object.fromEntries(out.reportTypes.map((t: { typeId: string; entitled: boolean }) => [t.typeId, t.entitled]));
    expect(entitled).toEqual({ 'readiness.executive_digest': true, 'portfolio.board_pack': false });
  });
});
