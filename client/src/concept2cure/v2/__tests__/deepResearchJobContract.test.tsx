// @vitest-environment jsdom
/**
 * Deep research — the client reads the job the engine actually writes.
 *
 * Audit 2026-10-17. The orchestrator settles a job as status 'complete' (or
 * 'failed', which is also what a stopped job becomes), and stores `results` as
 * an AggregatedResults object (`topResults`, `totalResults`, `byConnector` …),
 * not as an array (server/services/deep-research-orchestrator.ts). The surface
 * waited for 'completed' / 'done' / 'cancelled' — words the engine never
 * writes — so a finished run polled forever behind "Stop research", and
 * `(job.results || []).map` would have thrown on the object the moment it did
 * stop. These cases drive the surface with the server's own vocabulary.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DeepResearchJob } from '../../../../../server/services/deep-research-orchestrator';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DeepResearch } from '../surfaces/DeepResearch';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

const BOARD = {
  credits: { remaining: 10, limit: 60, tier: 'standard' },
  connectors: [
    { id: 'pubmed', name: 'PubMed', cat: 'literature', tier: 'standard', creds: false, configured: true, desc: 'Literature' },
  ],
  connectorCount: 1,
  configuredCount: 1,
};

type WireJob = Omit<DeepResearchJob, 'createdAt' | 'completedAt'> & { createdAt: string; completedAt: string | null };
const base: WireJob = {
  id: 7, uuid: 'u-7', organizationId: 1, projectId: null, userId: 2,
  status: 'running', query: { indication: 'q' }, progress: 30, results: null, synthesis: null,
  creditsUsed: 1, connectorLogs: {}, createdAt: '2026-10-17T00:00:00Z', completedAt: null,
};
const COMPLETE: WireJob = {
  ...base,
  status: 'complete',
  progress: 100,
  synthesis: 'Three precedents support an ORR endpoint [SRC-1].',
  connectorLogs: { pubmed: { status: 'success', resultCount: 1, durationMs: 40 } },
  results: {
    totalResults: 1,
    byConnector: {},
    topResults: [
      { id: 'pm-1', sourceConnector: 'pubmed', title: 'ORR as a surrogate in 2L NSCLC', summary: 'Meta-analysis', relevanceScore: 0.9, metadata: {}, url: 'https://pubmed.example/1' },
    ],
    csrMatches: [], regulatoryIntelligence: [], literatureResults: [],
  },
  completedAt: '2026-10-17T00:01:00Z',
};

let jobOnGet: WireJob;
beforeEach(() => {
  jobOnGet = COMPLETE;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/deep-research/board') return ok({ data: BOARD });
    if (method === 'POST' && url === '/api/deep-research/jobs') return ok({ ...base, status: 'queued', progress: 0 });
    if (method === 'GET' && url === '/api/deep-research/jobs/7') return ok(jobOnGet);
    return ok({});
  });
});
afterEach(() => cleanup());

async function launch() {
  render(<DeepResearch surface={{ id: 'deep-research' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
  await screen.findByRole('button', { name: /PubMed/ });
  fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), { target: { value: 'ORR precedents' } });
  fireEvent.click(screen.getByRole('button', { name: /Launch deep research/ }));
}

describe('deep research — the job contract is the engine\'s', () => {
  it("stops polling on the engine's 'complete' and renders its topResults", async () => {
    await launch();
    expect(await screen.findByText('ORR as a surrogate in 2L NSCLC')).toBeTruthy();
    expect(screen.getByText('Three precedents support an ORR endpoint [SRC-1].')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Stop research/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Launch deep research/ })).toBeTruthy();
    const polls = apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === '/api/deep-research/jobs/7');
    expect(polls).toHaveLength(1);
  });

  it("settles a 'failed' run and says so instead of polling or showing an empty result", async () => {
    jobOnGet = { ...base, status: 'failed', progress: 60 };
    await launch();
    expect(await screen.findByText(/research run failed/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Stop research/ })).toBeNull();
    expect(screen.queryByText('Aggregated results')).toBeNull();
  });
});
