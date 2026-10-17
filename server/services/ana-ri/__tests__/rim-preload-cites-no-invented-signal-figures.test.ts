/**
 * AnA's regulatory-intelligence preload states only signal figures something
 * computed (finding 6, 2026-10-15).
 *
 * What the code used to do: preloadRIMContext printed, under "cite as
 * [Signal: …]", "Trend: stable (insufficient, n=3)" — a direction the summary
 * had no data for — and "Average score: N", an average that included the
 * invented 80 / 95 of every artifact edit and the 90 / 60 / 20 / 10 of every
 * feedback click. The interceptors no longer invent those; this pins what the
 * prompt says about what remains.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), readiness: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/index.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../intelligence/index.js')>()),
  computeReadinessScore: h.readiness,
}));

import { preloadRIMContext } from '../orchestrator';
import { captureSignal } from '../../intelligence/signal-capture';
import { JUDGMENT_FRAMEWORK_VERSION } from '../../intelligence/judgment-framework';

const ORG = 8181;

function judgmentSignal(projectId: number, score: number, runId: string) {
  captureSignal({
    type: 'judgment',
    provenance: {
      judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
      patternRegistryVersion: 'test',
      runId,
      runType: 'full_assessment',
    },
    organizationId: ORG,
    projectId,
    riskLevel: 'medium',
    reviewerSensitivity: 'possible_question',
    defensibilityVerdict: 'needs_attention',
    score,
    confidence: null,
    action: 'Review the section',
    patternIds: [],
    metadata: {},
  });
}

beforeEach(() => {
  h.query.mockReset();
  h.readiness.mockReset();
  // Isolate the signal block: the readiness read is not under test here.
  h.readiness.mockRejectedValue(new Error('not under test'));
});

describe('preloadRIMContext — the signal block', () => {
  it('with three judgment signals states no trend and labels the mean for what it is', async () => {
    judgmentSignal(31, 40, 'r1');
    judgmentSignal(31, 50, 'r2');
    judgmentSignal(31, 60, 'r3');

    const block = await preloadRIMContext('31', ORG);

    expect(block).toContain('**3 intelligence signals**');
    expect(block).not.toMatch(/Trend: (stable|improving|declining)/);
    expect(block).toContain('Trend: not determined (insufficient data, n=3)');
    expect(block).toContain('Mean signal score: 50');
    expect(block).not.toMatch(/Average score:/);
  });

  it('with no signals says nothing about signals at all', async () => {
    const block = await preloadRIMContext('32', ORG);
    expect(block).toBe('');
  });
});
