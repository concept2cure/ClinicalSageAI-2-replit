/**
 * The biostat continuum's three model-drafted deliverables — ADaM analysis
 * dataset specifications, TLF shells, CSR statistical sections — are drafted
 * only by an approved model, and a failed draft stores nothing.
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * Each call pinned gpt-4o with no task type, so it ran as 'general' and the
 * high-risk model rule never applied. And each failed open: an AI failure
 * became { datasets: [] } stored with a fresh generatedAt; an unreadable reply
 * became zero TLF shells, or empty CSR sections with status 'csr_generated'.
 * Routing them correctly would have made a model refusal land in exactly those
 * branches, so both halves are fixed together.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chat = vi.fn();
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: (...a: unknown[]) => chat(...a) } }));

/** A thread with every snapshot a generator reads. */
const THREAD = {
  id: 7,
  organizationId: 3,
  protocolSnapshot: { title: 'P', primaryEndpoint: 'ORR', phase: '2' },
  sapSnapshot: { content: 'SAP text' },
  analysisSpecSnapshot: { specifications: [{ datasetName: 'ADSL' }] },
  resultsSnapshot: { primary: { orr: 0.31 } },
};
const writes: string[] = [];
vi.mock('../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [THREAD],
    insert: () => {
      writes.push('insert');
      return { values: () => ({ returning: async () => [{ id: 1 }] }) };
    },
    update: () => {
      writes.push('update');
      return { set: () => ({ where: async () => undefined }) };
    },
  };
  return { db: chain };
});
vi.mock('../sap-generator-service', () => ({ SapGeneratorService: { getInstance: () => ({}) } }));

import { NoDraftProducedError, StatisticalContinuumService } from '../statistical-continuum-service';

const svc = new StatisticalContinuumService();
const GENERATORS = [
  ['analysis specifications', () => svc.generateAnalysisSpecs(7, 3)],
  ['TLF shells', () => svc.generateTLFShells(7, 3)],
  ['CSR sections', () => svc.generateCSRSections(7, 3)],
] as const;

function failNext(err: Error) {
  // mockImplementation, not mockRejectedValue — see real-time-validation-fail-closed.test.ts.
  chat.mockImplementation(async () => {
    throw err;
  });
}

beforeEach(() => {
  writes.length = 0;
});

describe.each(GENERATORS)('%s', (_name, generate) => {
  it('is routed as document_drafting with no model pinned', async () => {
    failNext(new Error('stop after the request is captured'));
    await generate().catch(() => undefined);
    const [req] = chat.mock.calls.at(-1) as [Record<string, unknown>];
    expect(req.taskType).toBe('document_drafting');
    expect(req.model).toBeUndefined();
  });

  it('a model failure (including a refusal) stores nothing and keeps its own type', async () => {
    // The caller's error mapper tells a refusal from an outage by the error's
    // class; wrapping it would turn both into one indistinct failure.
    const refusal = new Error('MODEL_NOT_APPROVED_FOR_HIGH_RISK');
    failNext(refusal);
    await expect(generate()).rejects.toBe(refusal);
    expect(writes).toEqual([]);
  });

  it('an unreadable reply stores nothing, and the parse failure is the cause', async () => {
    chat.mockImplementation(async () => ({ content: 'Here are some thoughts on the analysis…' }));
    const err = await generate().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoDraftProducedError);
    expect((err as NoDraftProducedError).causeError).toBeInstanceOf(SyntaxError);
    expect(writes).toEqual([]);
  });

  it('an empty draft stores nothing — empty is not generated', async () => {
    chat.mockImplementation(async () => ({ content: '{"datasets":[],"tlfs":[],"sections":{}}' }));
    const err = await generate().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoDraftProducedError);
    expect(String((err as NoDraftProducedError).causeError)).toMatch(/returned no/);
    expect(writes).toEqual([]);
  });
});

describe('control — a real draft is stored', () => {
  it('CSR sections with content are written', async () => {
    chat.mockImplementation(async () => ({ content: JSON.stringify({ sections: { '11.4.1': 'Primary efficacy …' } }) }));
    const r = await svc.generateCSRSections(7, 3);
    expect(Object.keys(r.sections)).toEqual(['11.4.1']);
    expect(writes).toContain('update');
  });
});
