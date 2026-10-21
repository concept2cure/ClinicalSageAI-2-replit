// @vitest-environment jsdom
/**
 * A deep-research source whose search failed is shown as failed in the fan-out.
 *
 * The fan-out row read `hits: log?.resultCount ?? 0` and counted any log with a
 * resultCount as done. The orchestrator persists a failed search as
 * `{ status: 'error', resultCount: 0, error }`, so the row said
 * "0 results returned" for a source that was never read. It now says the
 * source failed, with the persisted error, and gives no result count.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { DeepResearch } from '../surfaces/DeepResearch';
import { __resetSurfaceActionBus } from '../surfaceActions';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

const connector = (id: string, name: string) => ({
  id, name, type: 'api', cat: 'literature', tier: 'free', creds: false, icon: 'book',
  desc: name, cf: [], configured: true,
});

const BOARD = {
  credits: null,
  connectors: [connector('pubmed', 'PubMed / MEDLINE'), connector('fda_drugs', 'FDA Drugs@FDA')],
  connectorCount: 2,
  configuredCount: 2,
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (path === '/api/deep-research/board') return ok({ data: BOARD });
    if (method === 'POST' && path === '/api/deep-research/jobs') return ok({ id: 9, status: 'queued' });
    if (path === '/api/deep-research/jobs/9') {
      // Exactly what executeResearchJob persists: PubMed's search threw, FDA answered.
      return ok({
        id: 9,
        status: 'running',
        connectorLogs: {
          pubmed: { status: 'error', resultCount: 0, error: 'PubMed returned HTTP 503' },
          fda_drugs: { status: 'success', resultCount: 4 },
        },
      });
    }
    return ok({});
  });
});

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

describe('DeepResearch fan-out — a failed source is a failure, not "0 results"', () => {
  it('shows the failed source as failed with its error, and the answered one with its count', async () => {
    render(
      <DeepResearch
        {...({ surface: { id: 'deep-research', label: 'Deep Research' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' } as any)}
      />,
    );
    await screen.findByText('PubMed / MEDLINE');
    fireEvent.change(screen.getByLabelText('Research question'), {
      target: { value: 'Accelerated approvals on ORR in second-line NSCLC' },
    });
    fireEvent.click(screen.getByText('Launch deep research'));

    expect(await screen.findByText('4 results returned')).toBeTruthy();
    expect(screen.queryByText('0 results returned')).toBeNull();
    expect(screen.getByText(/Failed — PubMed returned HTTP 503/)).toBeTruthy();
  });
});
