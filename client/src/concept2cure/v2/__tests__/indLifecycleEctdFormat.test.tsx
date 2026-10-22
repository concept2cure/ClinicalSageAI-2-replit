// @vitest-environment jsdom
/**
 * The IND screen names the format the platform actually builds for FDA.
 *
 * ── The finding (WO-9 lane re-walk, 2026-10-22, W5/D7) ───────────────────────
 * Click 2 of the IND demo opens this screen. Its subheading and the readiness
 * cover both said "eCTD v4.0 (FDA)", as fixed text. Every FDA package the
 * platform builds is eCTD v3.2.2 (the Submission Center says so, and
 * market-support.ts refuses v4.0-only markets because "this platform builds
 * eCTD v3.2.2 only"); FDA's production format is v3.2.2 with v4.0 optional. A
 * sponsor reading the readiness cover was told the filing would be in a format
 * nothing here produces.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: publish }));

import { IndLifecycle } from '../surfaces/IndLifecycle';

const props = () => ({ surface: { id: 'ind-lifecycle' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as Parameters<typeof IndLifecycle>[0]);

beforeEach(() => {
  apiRequest.mockReset();
  publish.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [{
            projectId: 1, code: 'BX-512', drugName: 'Vorelinib', productName: 'Vorelinib · BX-512',
            indication: 'KIT-mutant GIST', sponsorName: 'Concept2Cure Therapeutics', submissionType: 'IND',
            targetReceiptDate: null,
            forms: [{ id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true }],
            sections: [],
          }],
          meta: { count: 1 },
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
});
afterEach(cleanup);

describe('IndLifecycle — the format it names', () => {
  it('names eCTD v3.2.2, the format FDA packages are built in, and never v4.0', async () => {
    render(<IndLifecycle {...props()} />);
    await screen.findByRole('heading', { name: /Vorelinib — Initial IND/ });
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/eCTD v4\.0/);
    expect(body.match(/eCTD v3\.2\.2 \(FDA\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
