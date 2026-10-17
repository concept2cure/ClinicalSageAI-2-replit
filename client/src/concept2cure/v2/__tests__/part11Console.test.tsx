// @vitest-environment jsdom
/**
 * Part11Console — proves the compliance console renders the real /api/part11
 * data: the audit hash-chain integrity verdict — never a fabricated "compliant"
 * verdict or hash. (The §11.10 and SOC 2 tables it once rendered were server
 * constants and were removed 2026-10-17; see part11ConsoleHonesty.test.tsx.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Part11Console } from '../surfaces/Part11Console';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
}
const props = () => ({ surface: { id: 'part11-console', label: 'P11' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === '/api/part11/audit-trail/chain-integrity') return ok({ chainStatus: 'intact', integrityValid: true, totalEntries: 4210, brokenLinks: 0, lastHash: 'abcdef1234567890', hashAlgorithm: 'SHA-256', chainType: 'linear-hash-chain' });
    return ok(null);
  });
});

describe('Part11Console — real compliance data', () => {
  it('renders the hash-chain integrity verdict from the server', async () => {
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('intact')).toBeTruthy();
    expect(screen.getByText('4210')).toBeTruthy();       // chained entries
    expect(screen.getByText('Integrity valid')).toBeTruthy();
  });

  it('requests neither removed static-table route', async () => {
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('intact')).toBeTruthy();
    const urls = apiRequest.mock.calls.map((c) => c[1]);
    expect(urls).not.toContain('/api/part11/compliance-status');
    expect(urls).not.toContain('/api/part11/soc2/controls');
  });
});
