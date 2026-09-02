// @vitest-environment jsdom
/**
 * CmModule3Build — the Contradictions card HEADER must not claim a count
 * over an unsettled or failed read.
 *
 * useLiveRows hands back empty rows on a failed read exactly as on a genuinely
 * empty one; only loading/error tell them apart. The card body branched on
 * both; the header rendered "0 open -- across specifications, …" regardless,
 * so a reviewer skimming a filing-blocking gate read a clean sweep that had
 * not happened. Revert-proven: with the unconditional header restored, the
 * first two cases fail.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CmModule3Build } from '../surfaces/CmcModule3Build';

const CONTRA = /\/api\/cmc\/module3-os\/contradictions\//;

function mockServer(contradictions: 'pending' | 'failed' | 'empty') {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (CONTRA.test(url)) {
      if (contradictions === 'pending') return new Promise<Response>(() => {});
      if (contradictions === 'failed') return { ok: false, status: 500, json: async () => ({ message: 'boom' }) } as Response;
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response;
  });
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'P-1' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const header = () => screen.getByText('Contradictions').parentElement!.textContent ?? '';

describe('CmModule3Build — contradictions header honesty', () => {
  it('claims no count while the read is in flight', async () => {
    mockServer('pending');
    render(<CmModule3Build ask={() => {}} />);
    await waitFor(() => expect(header()).toMatch(/Loading/));
    expect(header()).not.toMatch(/\d+ open/);
  });

  it('claims no count after the read failed', async () => {
    mockServer('failed');
    render(<CmModule3Build ask={() => {}} />);
    await waitFor(() => expect(header()).toMatch(/Couldn’t load/));
    expect(header()).not.toMatch(/\d+ open/);
  });

  it('reports 0 open only from a settled, successful, empty read', async () => {
    mockServer('empty');
    render(<CmModule3Build ask={() => {}} />);
    await waitFor(() => expect(header()).toMatch(/0 open/));
  });
});
