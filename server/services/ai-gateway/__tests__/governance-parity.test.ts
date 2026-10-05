/**
 * ADR-0015 §4 changes nothing on today's registry: every one of its rows is
 * its own approved-models entry, so holding every selection point to that
 * turns a CI coincidence into a runtime guarantee without moving a single
 * request.
 *
 * `gateway-selection-parity.json` is the table `selectionTable` produced
 * against the gateway before §3–§5 (HEAD 39b3027cc): strategy selection under
 * all five strategies, relaxed selection, the full fallback ladder and
 * explicit selection by id and by provider + wire model, for every task type
 * at every declared risk tier. The same table must come out now.
 *
 * Outside production that is the whole table. In production two changes are
 * the point of the ADR and are pinned in their own files — high-risk drafting
 * needs a passed PQ (pq-production-gate.test.ts) and `local-default` is not
 * selected (gateway-model-governance.test.ts) — so the production table
 * leaves out drafting and the self-hosted lane and must match the rest
 * exactly.
 *
 * The production half was re-recorded on 2026-10-04 from trunk's own gateway
 * (origin at the merge, without §3–§5): trunk's P1-45 (d29275b1b) stopped
 * serving OpenAI and Moonshot in production without the tenant's election,
 * which moved 198 production cells. The merged gateway reproduced trunk's
 * table in all 856 cells, so §3–§5 still change nothing outside drafting and
 * the self-hosted lane.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { ALL_PROVIDERS } from './support/governed-gateway';
import { PARITY_TASKS, selectionTable } from './support/selection-table';

const golden = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'gateway-selection-parity.json'), 'utf8'),
) as { nonProduction: Record<string, string>; productionWithoutLocalOrDrafting: Record<string, string> };

const saved = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  setOrgPlacementResolver({ resolve: async () => null });
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('selection parity over the real registry', () => {
  it('the golden table is the real one: every path, task and tier, and all 16 rows by id', () => {
    const keys = Object.keys(golden.nonProduction);
    expect(keys.filter((k) => k.startsWith('strategy|'))).toHaveLength(9 * 4 * 5);
    expect(keys.filter((k) => k.startsWith('fallback|'))).toHaveLength(9 * 4);
    expect(new Set(keys.filter((k) => k.startsWith('explicit-id|')).map((k) => k.split('|')[1])).size).toBe(16);
  });

  it('outside production, every cell is served exactly as before', async () => {
    expect(await selectionTable(ALL_PROVIDERS)).toEqual(golden.nonProduction);
  }, 60_000);

  it('in production, every cell but drafting and the self-hosted lane is served exactly as before', async () => {
    process.env.NODE_ENV = 'production';
    const providers = ALL_PROVIDERS.filter((p) => p !== 'local');
    const tasks = PARITY_TASKS.filter((t) => t !== 'document_drafting');
    expect(await selectionTable(providers, tasks)).toEqual(golden.productionWithoutLocalOrDrafting);
  }, 60_000);
});
