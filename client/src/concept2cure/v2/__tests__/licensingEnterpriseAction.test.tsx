// @vitest-environment jsdom
/**
 * Settings/integrity audit 2026-10-17, finding 3.
 *
 * The Enterprise plan's button read "Contact sales" and, on click, sent AnA a
 * chat prompt and toasted "Enterprise · routed to sales". Nothing was routed:
 * no request was stored and no one was told. The repository configures no
 * sales contact address or URL, so the honest action is the one that actually
 * happens — asking AnA — labelled as that, with no toast claiming otherwise.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { LicensingSurface } from '../surfaces/LicensingSurface';

const props = (onAsk = vi.fn()) => ({ surface: { id: 'licensing', label: 'Plans' } as any, onAsk, onNav: vi.fn(), segment: 'biotech' });

afterEach(() => { cleanup(); apiRequest.mockReset(); });

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/status') {
      return { ok: true, status: 200, json: async () => ({ tier: 'free', status: 'active' }) } as Response;
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
}

describe('Licensing — the Enterprise action says what it does', () => {
  it('is labelled as asking AnA, asks AnA, and claims no routing', async () => {
    serve();
    const onAsk = vi.fn();
    const { container } = render(<LicensingSurface {...props(onAsk)} />);
    expect(screen.queryByText('Contact sales')).toBeNull();
    const btn = await screen.findByRole('button', { name: /Ask AnA about Enterprise/ });
    fireEvent.click(btn);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(String(onAsk.mock.calls[0][0])).not.toMatch(/connect me with sales/i);
    expect(container.textContent).not.toMatch(/routed to sales/i);
    // Nothing was sent to a server on the customer's behalf.
    expect(apiRequest.mock.calls.filter(([m]) => m !== 'GET')).toHaveLength(0);
  });
});
