// @vitest-environment jsdom
/**
 * The editor's outline is the project's home filing (FILING_SPINE F22,
 * 2026-10-15). An added market is its own governed document holding only its
 * Module 1 and 3.2.R; the outline read the project's newest document, so after
 * a market was added the editor would have opened that partial outline. It now
 * asks the server for the home filing by name (scope=home).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn(async (_method: string, _url: string) => ({ ok: true, status: 200, json: async () => ({ documents: [] }) }) as Response));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useFilingOutline } from '../useFilingOutline';

function Probe({ pid }: { pid: string }) {
  useFilingOutline(pid);
  return null;
}

afterEach(cleanup);

describe("the editor's outline is the home filing (F22)", () => {
  it('asks for the project documents scoped to home', async () => {
    render(<Probe pid="22222222-2222-4222-8222-222222222222" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(apiRequest.mock.calls[0][1]).toBe('/api/c2c/documents?projectId=22222222-2222-4222-8222-222222222222&scope=home');
  });
});
