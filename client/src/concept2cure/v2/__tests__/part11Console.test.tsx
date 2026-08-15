// @vitest-environment jsdom
/**
 * Part11Console — proves the compliance console renders the real /api/part11
 * data: the audit hash-chain integrity verdict, §11.10 section status, and the
 * SOC 2 control grid — never a fabricated "compliant" verdict or hash.
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
    if (url === '/api/part11/compliance-status') return ok({ disclaimer: 'Self-assessment only.', part11: { overallStatus: 'not_assessed', sections: { '§11.10(a)': { title: 'Validation of systems', status: 'not_assessed', platformControl: 'GAMP-5 kit' } } }, soc2: { certificationTarget: 'SOC 2 Type II', readinessScore: null }, gamp5: {} });
    if (url === '/api/part11/soc2/controls') return ok({ controls: [{ controlId: 'CC6.1', category: 'Security', title: 'Logical access', part11Mapping: '§11.10(d)', evidenceStatus: 'not_collected', evidenceCount: 0 }], summary: { totalControls: 10, part11MappedControls: 6, readinessScore: null, certificationTarget: 'SOC 2 Type II' } });
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

  it('renders §11.10 section status and the SOC 2 control grid', async () => {
    render(<Part11Console {...props()} />);
    expect(await screen.findByText('Validation of systems')).toBeTruthy();
    expect(screen.getByText('§11.10(a)')).toBeTruthy();
    expect(await screen.findByText('Logical access')).toBeTruthy(); // SOC 2 control
    expect(screen.getByText('CC6.1')).toBeTruthy();
  });
});
