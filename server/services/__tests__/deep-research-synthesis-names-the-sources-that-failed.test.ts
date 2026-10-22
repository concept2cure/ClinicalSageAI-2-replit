/**
 * The deep-research synthesis names the sources whose search failed.
 *
 * executeResearchJob persisted `status: 'error'` for a failed connector but
 * handed generateSynthesis only the aggregated results. A source that errored
 * therefore contributed nothing and was indistinguishable from a source that
 * was searched and found nothing: the model briefed on "the evidence" and the
 * template fallback printed "0 regulatory approval records found" for an FDA
 * read that never happened. The failed connector ids now reach the synthesis:
 * the model is told which sources failed, and the persisted synthesis states it
 * in a deterministic note, on the model path and on the template fallback alike.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, searchConnectors, aiComplete } = vi.hoisted(() => ({
  query: vi.fn(),
  searchConnectors: vi.fn(),
  aiComplete: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../connectors/connector-registry.js', () => ({ searchConnectors }));
vi.mock('../usage-metering.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true })),
  recordUsage: vi.fn(async () => undefined),
}));
vi.mock('../../lib/unified-ai-client.js', () => ({ aiComplete }));

import { launchResearchJob } from '../deep-research-orchestrator';

const JOB_ROW = {
  id: 7,
  uuid: 'job-7',
  organization_id: 1,
  project_id: null,
  user_id: 1,
  status: 'queued',
  query: { indication: 'second-line NSCLC' },
  progress: 0,
  results: null,
  synthesis: null,
  credits_used: 1,
  connector_logs: {},
  created_at: new Date(),
  completed_at: null,
};

/** The synthesis the final UPDATE persisted, once the async job settles. */
async function persistedSynthesis(): Promise<string> {
  await vi.waitFor(() => {
    expect(
      query.mock.calls.some(([sql]) => /SET\s+status = \$4, progress = 100/.test(String(sql))),
    ).toBe(true);
  });
  const call = query.mock.calls.find(([sql]) => /SET\s+status = \$4, progress = 100/.test(String(sql)));
  return String((call?.[1] as unknown[])[1]);
}

beforeEach(() => {
  query.mockReset();
  aiComplete.mockReset();
  searchConnectors.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (/INSERT INTO deep_research_jobs/.test(sql)) {
      return { rows: [{ id: 7, uuid: 'job-7', created_at: new Date() }], rowCount: 1 };
    }
    if (/SELECT/.test(sql)) return { rows: [JOB_ROW], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  // PubMed's search threw; FDA answered with one record.
  searchConnectors.mockResolvedValue([
    { connectorId: 'pubmed', results: [], error: 'PubMed returned HTTP 503' },
    {
      connectorId: 'fda_drugs',
      results: [
        {
          id: 'NDA-1',
          sourceConnector: 'fda_drugs',
          title: 'Approval letter',
          summary: 'Accelerated approval on ORR',
          sourceRank: 1,
          metadata: {},
        },
      ],
    },
  ]);
});

const REQUEST = {
  organizationId: 1,
  userId: 1,
  query: { indication: 'second-line NSCLC' },
  connectorIds: ['pubmed', 'fda_drugs'],
};

describe('deep-research synthesis — a failed source is named as failed', () => {
  it('tells the model which sources failed, and the persisted briefing names them', async () => {
    aiComplete.mockResolvedValue('## Executive Summary\nOne FDA approval record was returned.');
    await launchResearchJob(REQUEST);
    const synthesis = await persistedSynthesis();

    const prompt = JSON.stringify(aiComplete.mock.calls[0]?.[0]);
    expect(prompt).toContain('PubMed / MEDLINE');
    expect(synthesis).toContain('PubMed / MEDLINE');
    expect(synthesis).toMatch(/failed/i);
    // A source that answered is not reported as failed.
    expect(synthesis).not.toMatch(/failed[^\n]*FDA Drugs@FDA/);
  });

  it('the template fallback names the failed source too, never only a zero count', async () => {
    aiComplete.mockRejectedValue(new Error('gateway down'));
    await launchResearchJob(REQUEST);
    const synthesis = await persistedSynthesis();

    expect(synthesis).toContain('AI-powered synthesis was unavailable');
    expect(synthesis).toContain('PubMed / MEDLINE');
    expect(synthesis).toMatch(/failed/i);
  });

  it('control: with no failed source, no failure note is written', async () => {
    searchConnectors.mockResolvedValue([{ connectorId: 'fda_drugs', results: [] }]);
    aiComplete.mockResolvedValue('## Executive Summary\nNothing was returned.');
    await launchResearchJob({ ...REQUEST, connectorIds: ['fda_drugs'] });
    const synthesis = await persistedSynthesis();
    expect(synthesis).toBe('## Executive Summary\nNothing was returned.');
  });
});
