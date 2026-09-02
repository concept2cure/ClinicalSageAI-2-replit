// @vitest-environment jsdom
/**
 * EctdCompile — the compilation-history card must not render a FAILED read as
 * "No compilations yet".
 *
 * `loadHistory` discarded `ok` and collapsed a 401/500/empty body into [], the
 * same state as a tenant with genuinely zero compilations. A publisher asking
 * "was this sequence ever compiled?" got a false negative. Revert-proven: with
 * the discard restored, the first case fails.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';

function mockServer(history: 'failed' | 'empty') {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (/\/api\/ectd-compile\/.*\/history/.test(url)) {
      return history === 'failed'
        ? ({ ok: false, status: 401, json: async () => ({ message: 'expired' }) } as Response)
        : ({ ok: true, status: 200, json: async () => ({ compilations: [] }) } as Response);
    }
    return { ok: true, status: 200, json: async () => ({ modules: [] }) } as Response;
  });
}

const props = () => ({ onAsk: vi.fn() } as unknown as Parameters<typeof EctdCompile>[0]);

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'P-1', title: 'Program' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('EctdCompile — compilation history honesty', () => {
  it('a failed history read is reported as not loaded, never as "No compilations yet"', async () => {
    mockServer('failed');
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(screen.getByText(/Compilation history didn’t respond/)).toBeTruthy());
    expect(screen.queryByText('No compilations yet')).toBeNull();
  });

  it('a successful empty read is the only path to "No compilations yet"', async () => {
    mockServer('empty');
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(screen.getByText('No compilations yet')).toBeTruthy());
  });
});
