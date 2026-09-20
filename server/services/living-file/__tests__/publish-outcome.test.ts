/**
 * A regulatory-change propagation that failed on every channel must not be
 * indistinguishable from one that ran and affected nothing.
 *
 * WO-16C #133, the same shape one layer out from the audit rows. This helper's
 * own docstring called it "fire-and-await" with a result that is "informational
 * only", and all five callers took it at its word:
 *
 *     await publishRegulatoryChange({ … });     // gspr.service.ts:191
 *     await publishRegulatoryChange({ … });     // post-market.service.ts:374, :430
 *     await publishRegulatoryChange({ … });     // pccp.service.ts:160, :260
 *
 * — no assignment at any of them. The chain underneath reports in detail:
 * `propagateRegulatoryChange` runs four handlers, catches each one's error into
 * `outcomes[].detail.error`, and returns `totalAffected`. All of that was thrown
 * away, so a document approval whose downstream propagation failed on every
 * channel — defense packets never marked stale, GSPR mappings never updated,
 * dependent artifacts never flagged for review — answered exactly like one where
 * propagation succeeded and nothing needed changing. `totalAffected: 0` means both.
 *
 * The docstring also said "errors are caught and logged". The catch did not log;
 * it returned `{ error }` and nothing else. That claim is why nobody looked.
 *
 * Failure is injected at the dependency: `propagateRegulatoryChange` throws, and
 * separately returns outcomes whose channels each carry an error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROUTER = vi.hoisted(() => ({
  result: null as unknown,
  throws: null as string | null,
}));

vi.mock('../change-router.service', () => ({
  propagateRegulatoryChange: async () => {
    if (ROUTER.throws) throw new Error(ROUTER.throws);
    return ROUTER.result;
  },
}));

import { publishRegulatoryChange } from '../publish';

const ARGS = {
  organizationId: 1,
  programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  event: 'evidence_changed' as never,
  sourceId: 'src-1',
  reason: 'Annual PSUR update',
};

beforeEach(() => {
  ROUTER.throws = null;
  ROUTER.result = null;
});

describe('publishRegulatoryChange reports what the propagation did', () => {
  it('a clean propagation that affected nothing says so, and says it succeeded', async () => {
    ROUTER.result = {
      event: 'evidence_changed',
      programId: ARGS.programId,
      sourceId: 'src-1',
      outcomes: [{ channel: 'defense_packet.evidence', detail: { updated: 0 } }],
      totalAffected: 0,
    };

    const out = await publishRegulatoryChange(ARGS);

    expect(out.published).toBe(true);
    expect(out.totalAffected).toBe(0);
    expect(out.failedChannels).toEqual([]);
  });

  it('a propagation where every channel errored is NOT reported as a clean no-op', async () => {
    // This is the case the old shape could not express: totalAffected is 0
    // because nothing worked, not because nothing needed to change.
    ROUTER.result = {
      event: 'evidence_changed',
      programId: ARGS.programId,
      sourceId: 'src-1',
      outcomes: [
        { channel: 'defense_packet.evidence', detail: { error: 'relation "defense_packets" does not exist' } },
        { channel: 'gspr_mapping', detail: { error: 'connection terminated unexpectedly' } },
      ],
      totalAffected: 0,
    };

    const out = await publishRegulatoryChange(ARGS);

    expect(out.published).toBe(false);
    expect(out.failedChannels).toEqual(['defense_packet.evidence', 'gspr_mapping']);
    // And the underlying store text does not travel.
    expect(JSON.stringify({ published: out.published, failedChannels: out.failedChannels }))
      .not.toMatch(/does not exist|connection terminated/);
  });

  it('a partial failure is reported as partial, not as success', async () => {
    ROUTER.result = {
      event: 'evidence_changed',
      programId: ARGS.programId,
      sourceId: 'src-1',
      outcomes: [
        { channel: 'defense_packet.evidence', detail: { updated: 3 } },
        { channel: 'gspr_mapping', detail: { error: 'timeout' } },
      ],
      totalAffected: 3,
    };

    const out = await publishRegulatoryChange(ARGS);

    expect(out.published).toBe(false);
    expect(out.totalAffected).toBe(3);
    expect(out.failedChannels).toEqual(['gspr_mapping']);
  });

  it('a throwing router is reported, and still does not throw out of here', async () => {
    ROUTER.throws = 'change router unavailable';

    const out = await publishRegulatoryChange(ARGS);

    expect(out.published).toBe(false);
    expect(out.code).toBe('PROPAGATION_FAILED');
    expect(out.message).toBeTruthy();
    // The caller's mutation must never be broken by a publish failure, and the
    // thrown text is the router's own — it belongs in the log, not the result.
    expect(JSON.stringify(out)).not.toContain('change router unavailable');
  });
});

/*
 * The hop. Every previous round of this work order found the same defect one
 * layer up — an outcome produced, returned, and dropped by its caller — so the
 * five callers are pinned rather than trusted. Each is asserted through its own
 * declared return type: if any of them stops carrying `publish`, this fails to
 * compile or fails here.
 */
describe('the five callers carry the publish outcome out', () => {
  it('every caller of publishRegulatoryChange returns it', async () => {
    const { readFileSync } = await import('node:fs');
    const CALLERS = [
      'server/services/gspr-postmarket/gspr.service.ts',
      'server/services/gspr-postmarket/post-market.service.ts',
      'server/services/ai-ml-pccp/pccp.service.ts',
    ];
    for (const rel of CALLERS) {
      const src = readFileSync(new URL(`../../../../${rel}`, import.meta.url), 'utf8');
      // No bare `await publishRegulatoryChange(` — the form that discarded it.
      const bare = src.match(/^\s*await publishRegulatoryChange\(/gm) ?? [];
      expect(bare, `${rel} still discards a publish outcome`).toEqual([]);
      // And the outcome type is in its signature, so a caller cannot quietly
      // stop returning it.
      expect(src, `${rel} does not surface PublishOutcome`).toContain('PublishOutcome');
    }
  });
});
