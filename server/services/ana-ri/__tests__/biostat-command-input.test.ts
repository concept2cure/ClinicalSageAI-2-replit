/**
 * BS4 (2026-09-25): AnA's statistics commands pass the user's inputs to the
 * normalizer as given, so it can refuse what is missing and disclose what it
 * fills.
 *
 * `generate_sap` and `compute_sample_size` each built the engine input
 * themselves and filled effectSize = 0.5, alpha, power and 15% attrition BEFORE
 * the normalizer ran. That defeated its "Effect size is required" refusal and
 * emptied its prefilled disclosure. They passed no variance, so every continuous
 * design was sized with SD = effect size, i.e. a standardised effect of 1: "Generate
 * a SAP for our Phase 2 oncology trial" produced N = 38 from numbers nobody gave.
 * And the catalog's advertised `dropoutRate` was never read.
 *
 * Only the project lookup is stubbed; the normalizer, orchestrator and engine
 * are the real ones.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => {
  const query = vi.fn(async () => ({ rows: [{ id: 7 }], rowCount: 1 }));
  return { db: {}, pool: { query }, getPool: () => ({ query }), getDb: () => ({}) };
});

import { computeSampleSize, generateSAP, type CommandContext } from '../command-executor.js';

const ctx: CommandContext = { userId: 3, organizationId: 1, activeProjectId: 7 };

describe('compute_sample_size', () => {
  it('refuses when no effect size is given, instead of sizing on an invented 0.5', async () => {
    const res = await computeSampleSize(ctx, { endpointType: 'continuous', studyType: 'superiority', objectiveType: 'efficacy' });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Effect size is required/);
  });

  it('reads the dropoutRate its catalog entry advertises', async () => {
    const res = await computeSampleSize(ctx, {
      endpointType: 'continuous', studyType: 'superiority', objectiveType: 'efficacy',
      effectSize: 0.5, variance: 1, dropoutRate: 0.25,
    });
    expect(res.success).toBe(true);
    const data = res.data as { sampleSize: { total: number }; adjustedTotal: number };
    // 25% dropout: adjusted = ceil(n / 0.75), not ceil(n / 0.85)
    expect(data.adjustedTotal).toBe(Math.ceil(data.sampleSize.total / 2 / 0.75) * 2);
  });

  it('passes the variance through, so the effect size is not silently divided by itself', async () => {
    const wide = await computeSampleSize(ctx, {
      endpointType: 'continuous', studyType: 'superiority', objectiveType: 'efficacy', effectSize: 0.5, variance: 4,
    });
    const narrow = await computeSampleSize(ctx, {
      endpointType: 'continuous', studyType: 'superiority', objectiveType: 'efficacy', effectSize: 0.5, variance: 1,
    });
    const n = (r: typeof wide) => (r.data as { sampleSize: { perGroup: number } }).sampleSize.perGroup;
    expect(n(wide)).toBeGreaterThan(n(narrow) * 3.5); // SD 2 vs 1: four times the subjects
  });
});

describe('generate_sap', () => {
  const FULL = {
    indication: 'NSCLC', phase: 'II', endpointType: 'continuous', studyType: 'superiority',
    objectiveType: 'efficacy', effectSize: 0.5, variance: 1,
  };

  it('refuses when no effect size is given, instead of reporting "SAP generated"', async () => {
    const res = await generateSAP(ctx, { indication: 'NSCLC', phase: 'II' });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/[Ee]ffect size/);
  });

  /* PF-14 (producers MISSED-5). The drafted SAP is stored as a project artifact
     by the workflow's create_artifact action; generate_sap ignored that
     action's outcome and reported "SAP generated … Document prepared" with the
     id of an in-memory draft, whether or not anything was stored. Here the
     artifact write fails (the stubbed db cannot insert). */
  it('reports that the SAP was not stored when the artifact write fails', async () => {
    const res = await generateSAP(ctx, FULL);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not stored/i);
    // The computed figures are still returned; only the claim of a stored SAP is withheld.
    expect((res.data as { sampleSize?: number } | undefined)?.sampleSize).toBeGreaterThan(0);
  });

  it('names the stored artifact when the write succeeds', async () => {
    const { anaBiostatsOrchestrator } = await import('../../ana-biostats/orchestrator.js');
    const real = anaBiostatsOrchestrator.executeWorkflow.bind(anaBiostatsOrchestrator);
    const spy = vi.spyOn(anaBiostatsOrchestrator, 'executeWorkflow').mockImplementation(async (req) => ({
      ...(await real(req)),
      workflowActions: [{ action: 'create_artifact', success: true, artifactId: 4242, message: 'persisted' }],
    }));
    try {
      const res = await generateSAP(ctx, FULL);
      expect(res.success).toBe(true);
      expect((res.data as { documentId: unknown }).documentId).toBe(4242);
    } finally {
      spy.mockRestore();
    }
  });
});
