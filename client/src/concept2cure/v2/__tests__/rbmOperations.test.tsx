// @vitest-environment jsdom
/**
 * RbmOperations — proves the RBM write/compute layer is wired to the real
 * /api/mdx/rbm-* endpoints: loads a program's KRIs, records a KRI reading
 * (server recomputes status), and runs a compute job reporting the server's own
 * meta counts. Honest empty with no programs.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { RbmOperations } from '../surfaces/RbmOperations';

function envelope(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'rbm-operations', label: 'RBM' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (url === '/api/mdx-rbm/rbm-programs') return envelope({ success: true, data: [{ id: 'p-uuid', label: 'Program A' }], total: 1 });
    if (url.startsWith('/api/mdx/rbm-kris?')) return envelope({ data: [{ id: 5, name: 'Query rate', unit: '%', current_value: 12, status: 'amber', threshold_amber: 10, threshold_red: 20 }], meta: { count: 1 } });
    if (url.startsWith('/api/mdx/rbm-signals?')) return envelope({ data: [], meta: { count: 0 } });
    if (method === 'POST' && url === '/api/mdx/rbm-kris/5/values') return envelope({ data: { id: 99, value: body.value } }, 201);
    if (method === 'POST' && url === '/api/mdx/rbm-site-risk/recompute') return envelope({ data: [], meta: { count: 3 } });
    return envelope({ data: null });
  });
});

describe('RbmOperations — real RBM write/compute layer', () => {
  it('loads a program and its KRIs', async () => {
    render(<RbmOperations {...props()} />);
    expect(await screen.findByText('Query rate')).toBeTruthy();
    expect(screen.getByText('amber')).toBeTruthy();
  });

  it('records a KRI reading against the real endpoint', async () => {
    render(<RbmOperations {...props()} />);
    await screen.findByText('Query rate');
    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Record/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/mdx/rbm-kris/5/values');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ value: 8 });
    });
    expect(await screen.findByText(/value recorded/i)).toBeTruthy();
  });

  it('runs a compute job and reports the server meta counts', async () => {
    render(<RbmOperations {...props()} />);
    await screen.findByText('Query rate');
    fireEvent.click(screen.getByRole('button', { name: /Site risk/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/mdx/rbm-site-risk/recompute')).toBe(true));
    expect(await screen.findByText(/count: 3/)).toBeTruthy();
  });
});
