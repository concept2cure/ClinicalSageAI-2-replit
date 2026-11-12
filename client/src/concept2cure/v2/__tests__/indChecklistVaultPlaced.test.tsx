// @vitest-environment jsdom
/**
 * GA-D7-13 (2026-11-10): the IND checklist called the Investigator's Brochure,
 * QOS and Tox summary placed from the Vault "Not started", and each module card
 * said "0/18 required sections approved" while the headline said 48 required
 * sections in all. The cards count every section of the module's outline, not
 * the required set, so "required" on them contradicted the headline.
 *
 * Now a section the server reports placed reads "Placed, not yet approved",
 * and a module card says "sections approved", the set it actually counts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: vi.fn() }));

import { IndLifecycle } from '../surfaces/IndLifecycle';

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

const IB = { code: 'm1.14.4.1', title: "Investigator's Brochure", module: 'M1', status: 'placed', regulatoryRef: '21 CFR 312.23(a)(5)' };

function mockChecklist() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: [{
            code: 'C2C-101', drugName: 'C2C-101', productName: 'C2C-101 IND', indication: null, sponsorName: 'Acme',
            submissionType: 'IND', targetReceiptDate: null, forms: [],
            sections: [{ code: IB.code, title: IB.title, module: 'M1', ref: IB.regulatoryRef, ai: false, status: 'placed' }],
            readiness: {
              filingType: 'initial', ready: false, overallPercentage: 0,
              moduleProgress: [{ module: 'M1', title: 'Administrative information', total: 18, completed: 0, inProgress: 1, percentage: 0 }],
              requiredSections: { total: 48, completed: 0, incomplete: [IB] },
              forms: { required: [], completed: [], missing: [] },
              blockers: [{ kind: 'required_section', code: IB.code, message: 'x' }],
              warnings: [],
            },
          }],
          meta: { count: 1 },
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}
const props = () => ({ surface: { id: 'ind-lifecycle' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as Parameters<typeof IndLifecycle>[0]);

describe('the IND checklist reads a placed section as placed', () => {
  it('a section placed from the Vault reads "Placed, not yet approved", never "Not started" or a raw value', async () => {
    mockChecklist();
    const view = render(<IndLifecycle {...props()} />);
    await waitFor(() => expect(view.container.textContent).toMatch(/Investigator's Brochure/));
    const text = view.container.textContent ?? '';
    expect(text).toMatch(/Placed, not yet approved/);
    expect(text).not.toMatch(/Not started/);
    expect(text).not.toMatch(/\bplaced\b(?!, not yet approved)/);
  });

  it('a module card names the set it counts: sections approved, not "required sections approved"', async () => {
    mockChecklist();
    const { container } = render(<IndLifecycle {...props()} />);
    await waitFor(() => expect(container.querySelector('.indl-mod-m')).toBeTruthy());
    const card = container.querySelector('.indl-mod-m')!.textContent ?? '';
    expect(card).toBe('0/18 sections approved');
    expect(card).not.toMatch(/required/);
  });
});
