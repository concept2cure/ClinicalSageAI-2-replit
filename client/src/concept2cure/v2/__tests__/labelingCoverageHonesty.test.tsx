// @vitest-environment jsdom
/**
 * Labeling — translation coverage is claimed only from a settled read.
 *
 * The AnswerLead body printed "Add the target-language IFU/label translations
 * to start tracking…" and the section caption "0/0 approved / 0
 * back-translation verified" while the translations read was pending or had
 * failed — directly under a headline that said "Reading…" / "Couldn't read".
 * Revert-proven: both cases fail with the ungated copy restored.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Labeling } from '../surfaces/Labeling';

const DOC = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, status: 'draft' };

function serve(translations: 'pending' | 'failed') {
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (path === '/api/mdx/labeling') return { ok: true, status: 200, json: async () => ({ data: [DOC] }) } as Response;
    if (path.endsWith('/translations')) {
      if (translations === 'pending') return new Promise<Response>(() => {});
      return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
}

const mount = () => render(<Labeling {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
const text = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Labeling — coverage honesty', () => {
  it('claims no coverage and offers no "start tracking" CTA while translations are still being read', async () => {
    serve('pending');
    mount();
    await waitFor(() => expect(text()).toMatch(/Reading this label's translation coverage/));
    expect(text()).not.toMatch(/Add the target-language IFU\/label translations to start tracking/);
    expect(text()).not.toMatch(/0\/0 approved/);
  });

  it('claims no coverage figure after the translations read failed', async () => {
    serve('failed');
    mount();
    await waitFor(() => expect(text()).toMatch(/Couldn't read this label's translation coverage/));
    expect(text()).not.toMatch(/Add the target-language IFU\/label translations to start tracking/);
    expect(text()).not.toMatch(/0\/0 approved/);
    expect(text()).toMatch(/Coverage not read/);
  });
});
