// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CroPortfolio } from '../surfaces/CroPortfolio';

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('CRO sponsor company type reflects its recorded value', () => {
  it.each([
    ['medical_device', 'Medical device'],
    ['diagnostic', 'Diagnostics'],
    ['medtech', 'Medical device'],
    ['biotech', 'Biotech'],
    ['pharma', 'Pharma'],
    ['full-service', 'full-service'],
    ['constructor', 'constructor'],
    ['__proto__', '__proto__'],
    ['', 'Not recorded'],
    [null, 'Not recorded'],
  ])('%s is labeled %s in the roster and selected sponsor', async (type, expected) => {
    apiRequest.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 's1', name: 'Recorded Sponsor', type,
        lead: null, sowNote: null, studies: [], subs: [] }] }),
    });
    const { container } = render(<CroPortfolio surface={{ id: 'cro-portfolio', label: 'CRO portfolio' } as never}
      onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await waitFor(() => expect(container.querySelector('.cro-detail-name')?.textContent).toContain('Recorded Sponsor'));
    expect(container.querySelector('.cro-spn-top .rd-chip')?.textContent).toBe(expected);
    expect(container.querySelector('.cro-detail-name .rd-chip')?.textContent).toBe(expected);
    if (expected !== 'Biotech') expect(container.querySelector('.cro-split')?.textContent).not.toContain('Biotech');
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
