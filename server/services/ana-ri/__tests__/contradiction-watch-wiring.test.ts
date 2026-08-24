/**
 * Contradiction watch reaches the chat — the wiring, not the rendering.
 *
 * WHAT WENT WRONG
 * contradiction-watch.ts had a tested renderer whose own docstring promised
 * "the proactive digest and (optionally) the chat context" — and
 * buildContradictionWatchBlock had ZERO production callers. Findings that
 * BLOCK PROMOTION were invisible in chat unless someone explicitly called the
 * scan/search API. The digest half was wired; the chat half was a docstring.
 *
 * The rendering itself is covered by contradiction-watch.test.ts. This suite
 * pins the CARRIAGE: the prefetch fetches and renders the block org-scoped,
 * and the block flows prefetch → orchestrator input → system prompt on the
 * live route. Carriage is exactly what was missing, so carriage is what the
 * test asserts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const CANNED_BLOCK =
  '<open_contradictions note="canned">Open contradictions: 1 critical (1 block promotion).</open_contradictions>';

const watch = vi.hoisted(() => ({
  getOpenContradictionsForOrg: vi.fn(async () => [] as unknown[]),
  buildContradictionWatchBlock: vi.fn((items: unknown[]) =>
    items.length > 0 ? CANNED_BLOCK : ''
  ),
}));

vi.mock('../../ana/contradiction-watch', () => watch);
vi.mock('../relational-profile-service', () => ({
  loadRelationalOverlay: vi.fn(async () => ''),
}));
vi.mock('../../external-intelligence/index', () => ({
  buildExternalIntelBlock: vi.fn(async () => ''),
}));
vi.mock('../../ana/deadline-radar', () => ({
  getDeadlineRadar: vi.fn(async () => ({ overdue: [], dueSoon: [] })),
  buildDeadlineRadarBlock: vi.fn(() => ''),
}));
vi.mock('../../ana/session-briefing', () => ({
  getSessionBriefing: vi.fn(async () => ({ block: '' })),
}));
vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
  db: {},
}));

import { prefetchRouteIntelligenceContext } from '../chat-context-builder';

const ORG = 31;

describe('prefetch carries the contradiction-watch block', () => {
  beforeEach(() => {
    watch.getOpenContradictionsForOrg.mockClear();
    watch.buildContradictionWatchBlock.mockClear();
  });

  it('open findings render into contradictionWatchBlock, org-scoped', async () => {
    watch.getOpenContradictionsForOrg.mockResolvedValueOnce([
      { title: 'Assumption drift', severity: 'critical', blocksPromotion: true },
    ]);

    const ctx = await prefetchRouteIntelligenceContext({ organizationId: ORG });

    expect(watch.getOpenContradictionsForOrg).toHaveBeenCalledWith(ORG);
    expect(ctx.contradictionWatchBlock).toBe(CANNED_BLOCK);
  });

  it('no open findings → empty block (quiet orgs pay no tokens)', async () => {
    const ctx = await prefetchRouteIntelligenceContext({ organizationId: ORG });
    expect(ctx.contradictionWatchBlock).toBe('');
  });

  it('no org context → the query is never made', async () => {
    const ctx = await prefetchRouteIntelligenceContext({});
    expect(watch.getOpenContradictionsForOrg).not.toHaveBeenCalled();
    expect(ctx.contradictionWatchBlock).toBe('');
  });
});

describe('the block flows through to the system prompt on the live route', () => {
  // Source-contract assertions, in the repo's source-scan gate style: the
  // orchestrator and the route are too heavy to boot here, and what broke
  // before was precisely a missing hand-off line. Pin each hand-off.
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

  it('the orchestrator injects _contradictionWatchBlock into the system prompt', () => {
    const src = read('server/services/ana-ri/orchestrator.ts');
    expect(src).toContain('_contradictionWatchBlock?: string | null');
    expect(src).toMatch(
      /if \(input\._contradictionWatchBlock && input\._contradictionWatchBlock\.trim\(\)\) \{\s*\n\s*systemPrompt \+= '\\n\\n' \+ input\._contradictionWatchBlock\.trim\(\);/
    );
  });

  it('the live route hands the prefetched block to the orchestrator', () => {
    // Was two routes; /api/ana-ri/chat was deleted (zero callers, degraded
    // surface) so stream.ts is now the only live AnA RI route.
    for (const route of ['server/routes/ana-ri/stream.ts']) {
      expect(read(route), route).toMatch(
        /_contradictionWatchBlock:\s*prefetched\w*Context\.contradictionWatchBlock/
      );
    }
  });

  it('the chat-context-builder orchestrator input carries it too', () => {
    const src = read('server/services/ana-ri/chat-context-builder.ts');
    expect(src).toMatch(
      /_contradictionWatchBlock:\s*prefetchedContext\.contradictionWatchBlock/
    );
  });
});
