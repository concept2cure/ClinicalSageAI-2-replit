/**
 * AnA's RIM pattern tools report an unreadable store as unavailable, never as
 * "no patterns learned" (finding 10, 2026-10-15).
 *
 * What the code used to do: the pattern store turned a failed database read
 * into an empty list, so recall_rim_patterns told AnA "No RIM patterns have
 * been learned for this organization yet — proceed with generic guidance", and
 * summarize_rim_intelligence returned a computed summary of 0 patterns.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../db')>()),
  pool: { query: h.query },
}));

import { getToolHandler } from '../AnaToolExecutor.js';

type Handler = NonNullable<ReturnType<typeof getToolHandler>>;
type Ctx = Parameters<Handler>[1];

const NONE_LEARNED = /No RIM patterns have been learned/;

beforeEach(() => {
  h.query.mockReset();
  h.query.mockImplementation(async (sql: string) => {
    if (/FROM rim_learned_patterns/.test(sql)) {
      throw Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' });
    }
    return { rows: [] };
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function run(tool: string, input: Record<string, unknown>, orgId: number) {
  const handler = getToolHandler(tool);
  expect(handler).toBeDefined();
  return JSON.parse(await handler!(input, { organizationId: orgId } as Ctx)) as Record<string, unknown>;
}

describe('RIM pattern tools on an unreadable store', () => {
  it('recall_rim_patterns reports the store unavailable', async () => {
    const out = await run('recall_rim_patterns', {}, 4401);
    expect(JSON.stringify(out)).not.toMatch(NONE_LEARNED);
    expect(out.count).toBeUndefined();
    expect(String(out.error)).toMatch(/RIM pattern store unavailable/);
  });

  it('summarize_rim_intelligence returns no computed summary', async () => {
    const out = await run('summarize_rim_intelligence', {}, 4402);
    expect(out.status).not.toBe('computed');
    expect(JSON.stringify(out)).not.toMatch(NONE_LEARNED);
    expect(String(out.error)).toMatch(/RIM pattern store unavailable/);
  });

  it('query_rim_patterns_by_domain returns no computed list', async () => {
    const out = await run('query_rim_patterns_by_domain', { domain: 'fda' }, 4403);
    expect(out.status).not.toBe('computed');
    expect(String(out.error)).toMatch(/RIM pattern store unavailable/);
  });
});
