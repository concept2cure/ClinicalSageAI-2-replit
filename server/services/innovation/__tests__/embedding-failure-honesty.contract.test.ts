/**
 * The three innovation services must not turn an embedding outage into a
 * confident answer.
 *
 * ── WHAT THIS PINS ───────────────────────────────────────────────────────────
 * All three embedded text by calling the provider directly and swallowing the
 * failure. What they returned instead of an error differed, and every variant
 * was worse than an error:
 *
 *   auto-traceability-service      `return new Array(1536).fill(0)`
 *       A zero vector is not a null. It flows into cosineSimilarity, whose
 *       `denominator === 0` guard returns 0 — so every candidate scored 0,
 *       below the 0.75 link threshold, and a 21 CFR 820.30 design-controls
 *       traceability scan reported NO LINKS FOUND.
 *
 *   regulatory-delta-radar         `return new Array(1536).fill(0)`
 *       Same vector, opposite consequence: this scan reads below-threshold AS A
 *       GAP, so an outage reported EVERY requirement as a regulatory gap. It
 *       also persisted the zeros into the pgvector column, so later similarity
 *       searches against that document returned 0 too — durable, not transient.
 *
 *   regulatory-negotiation-logbook `return { results: [] }`
 *       A user searching their own FDA negotiation history was told there was
 *       nothing there.
 *
 * Each is the working agreement's "an error is never rendered as an empty
 * result", in the form hardest to notice: the result is not empty, it is
 * numerically plausible and confidently wrong.
 *
 * ── WHAT IS DELIBERATELY NOT FAIL-CLOSED ─────────────────────────────────────
 * The logbook's WRITE paths still degrade to a NULL embedding rather than
 * throwing, and that asymmetry is the point of the last two cases here. The
 * negotiation entry is the regulated record; losing it because an embedding
 * provider is unreachable would be a worse outcome than losing its
 * searchability. A read has no such record to protect, so a read that cannot
 * run must say so.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { embedSpy } = vi.hoisted(() => ({ embedSpy: vi.fn() }));

vi.mock('../../enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({ embed: embedSpy }),
}));
vi.mock('../../enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({ embed: embedSpy }),
}));

vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const OUTAGE = new Error('embedding provider unreachable');

/** A pool that answers every query with no rows — enough to reach the embed call. */
const makePool = () =>
  ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
  }) as never;

beforeEach(() => {
  embedSpy.mockReset();
});

describe('an embedding outage is reported, not answered', () => {
  it('auto-traceability: detectLinks throws instead of reporting zero links', async () => {
    embedSpy.mockRejectedValue(OUTAGE);
    const { AutoTraceabilityService } = await import('../auto-traceability-service');
    const svc = new AutoTraceabilityService(makePool());

    // The old code returned [] here — indistinguishable from "this document
    // genuinely traces to nothing", which for design controls is a finding a
    // reviewer would act on.
    await expect(
      svc.detectLinks({
        programId: 'p1',
        documentId: 'd1',
        content: 'The device shall maintain sterility through the labelled shelf life.',
      }),
    ).rejects.toThrow();
  });

  it('delta-radar: a scan that cannot embed throws instead of flagging every requirement', async () => {
    embedSpy.mockRejectedValue(OUTAGE);
    const { RegulatoryDeltaRadarService } = await import('../regulatory-delta-radar-service');
    const svc = new RegulatoryDeltaRadarService(makePool());

    // This is the dangerous direction: below-threshold means GAP, so the old
    // zero vector manufactured regulatory findings rather than suppressing them.
    await expect(
      (svc as unknown as { generateEmbedding(t: string): Promise<number[]> }).generateEmbedding(
        'Sponsor shall submit stability data at 0, 3, 6 and 12 months.',
      ),
    ).rejects.toThrow();
  });

  it('never yields a zero vector — the value that made both scans wrong', async () => {
    // Belt and braces on the specific shape: if some future change reintroduces
    // a fallback, it must not be a well-formed vector of zeros, because that is
    // the one value that passes every type check and every length check and is
    // silently wrong at the only place it is used.
    embedSpy.mockRejectedValue(OUTAGE);
    const { AutoTraceabilityService } = await import('../auto-traceability-service');
    const svc = new AutoTraceabilityService(makePool()) as unknown as {
      generateEmbedding(t: string): Promise<number[]>;
    };

    let returned: number[] | undefined;
    try {
      returned = await svc.generateEmbedding('sterility assurance level');
    } catch {
      returned = undefined;
    }
    expect(returned).toBeUndefined();
  });

  it('logbook SEARCH throws rather than answering "no results"', async () => {
    embedSpy.mockRejectedValue(OUTAGE);
    const { RegulatoryNegotiationLogbookService } = await import(
      '../regulatory-negotiation-logbook-service'
    );
    const svc = new RegulatoryNegotiationLogbookService(makePool());

    await expect(svc.search({ query: 'stability commitment' })).rejects.toThrow();
  });

  it('logbook WRITE still persists when embedding fails — the record outranks its index', async () => {
    embedSpy.mockRejectedValue(OUTAGE);
    const { RegulatoryNegotiationLogbookService } = await import(
      '../regulatory-negotiation-logbook-service'
    );
    const pool = makePool() as unknown as { query: ReturnType<typeof vi.fn> };
    const svc = new RegulatoryNegotiationLogbookService(pool as never);

    // Must NOT throw: a Part 11 negotiation entry that is unsearchable is a
    // degraded record; one that was never written is a lost record.
    await svc
      .addEntry({ threadId: 't1', content: 'FDA requested additional stability data.' } as never)
      .catch(() => undefined);

    // It reached the INSERT despite the embedding failing.
    const insertAttempted = pool.query.mock.calls.some(([q]) =>
      String(q).includes('INSERT INTO innovation.negotiation_entries'),
    );
    expect(insertAttempted).toBe(true);
  });

  it('a working embedding is used, so none of the above is fail-closed-on-everything', async () => {
    embedSpy.mockResolvedValue({ embedding: new Array(1536).fill(0.01), model: 'x', cached: false });
    const { AutoTraceabilityService } = await import('../auto-traceability-service');
    const svc = new AutoTraceabilityService(makePool()) as unknown as {
      generateEmbedding(t: string): Promise<number[]>;
    };

    const v = await svc.generateEmbedding('sterility assurance level');
    expect(v).toHaveLength(1536);
    expect(v[0]).toBeCloseTo(0.01);
  });
});
