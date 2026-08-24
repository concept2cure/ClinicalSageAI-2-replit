// @vitest-environment jsdom
/**
 * A registration row that offers to expand actually has something to expand.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Registrations.tsx held `const REG_DOSSIERS: Record<string, RegDossier> = {}`
 * — a permanently empty object, written deliberately so that no fabricated
 * dossier would ever be shown. Honest, and completely inert: the lookup always
 * missed, so `dossier` was always undefined and clicking a registration row
 * expanded nothing. The caret and the clickable affordance rendered on every
 * row regardless, so every row in the grid looked expandable and none was.
 *
 * GET /api/rim/products/:id/market-dossier is the real source: the registration
 * record, the org's approved labels for that market, and the label type the
 * market requires with the rule that says so.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN. That expanding a row issues the dossier read keyed on the row's
 * PRODUCT, that the market's own record is what renders, that a market with no
 * approved label says the requirement is unmet rather than showing a blank
 * panel, and — the distinction that matters in a regulatory record — that a
 * FAILED read is never rendered as "this market has no labels".
 *
 * It also asserts the read is lazy, because that is the reason the whole thing
 * is keyed per row: a thirty-market grid must not fire thirty dossier reads to
 * draw a table nobody has opened.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Registrations } from '../surfaces/Registrations';

const Surface = Registrations as unknown as React.ComponentType<Record<string, unknown>>;

const REGISTRATIONS = [
  {
    id: 1, product_id: 42, product_name: 'Bexarone', country: 'US',
    market_status: 'approved', registration_number: 'NDA-214785',
    approval_date: '2024-03-11', renewal_due_date: null, marketing_auth_holder: 'Concept2Cure Inc',
  },
  {
    id: 2, product_id: 42, product_name: 'Bexarone', country: 'JP',
    market_status: 'under_review', registration_number: null,
    approval_date: null, renewal_due_date: null, marketing_auth_holder: 'Concept2Cure KK',
  },
];

const DOSSIER = [
  {
    country: 'US', marketStatus: 'approved', registrationNumber: 'NDA-214785',
    approvalDate: '2024-03-11', renewalDueDate: null,
    expectedLabelType: 'uspi', expectedLabelBasis: '21 CFR 201.56 requires a USPI for a US-marketed drug.',
    approvedLabels: [{ labelType: 'uspi', version: '4', approvedDate: '2024-03-20', country: 'US' }],
    labelGap: false,
  },
  {
    country: 'JP', marketStatus: 'under_review', registrationNumber: null,
    approvalDate: null, renewalDueDate: null,
    expectedLabelType: 'core_data_sheet', expectedLabelBasis: 'No local label type is mapped for JP; the company core data sheet applies.',
    approvedLabels: [],
    labelGap: true,
  },
];

const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

/** Every path the surface reads, with the dossier answer under test. */
function routes(dossier: () => unknown) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') throw new Error('unrouted ' + method + ' ' + path);
    if (path === '/api/rim/registrations') {
      return { ok: true, status: 200, json: async () => ({ registrations: REGISTRATIONS }) };
    }
    if (path === '/api/registrations/data-standards') return okJson([]);
    if (path.endsWith('/market-dossier')) return dossier();
    // Any other read this surface makes is not the subject here; a 200 with an
    // empty list keeps it from throwing without pretending to be data.
    return okJson([]);
  });
}

/** Dossier reads issued so far, by product id. */
const dossierCalls = () =>
  apiRequest.mock.calls.filter(([, p]) => String(p).endsWith('/market-dossier')).map(([, p]) => String(p));

const rowFor = (market: string) =>
  Array.from(document.querySelectorAll('tr.reg-row')).find(r => r.textContent?.includes(market)) as HTMLElement;

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('Registrations — an expandable row expands', () => {
  it('reads no dossier until a row is actually opened', async () => {
    routes(() => okJson(DOSSIER));
    render(<Surface />);
    await waitFor(() => expect(rowFor('US')).toBeTruthy());
    // Two markets on screen, zero dossier reads.
    expect(dossierCalls()).toEqual([]);
  });

  it('expands the row against GET /api/rim/products/:productId/market-dossier', async () => {
    routes(() => okJson(DOSSIER));
    render(<Surface />);
    await waitFor(() => expect(rowFor('US')).toBeTruthy());

    const row = rowFor('US');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);

    await waitFor(() => expect(dossierCalls().length).toBe(1));
    // Keyed on the PRODUCT the registration belongs to, not the registration id.
    expect(dossierCalls()[0]).toBe('/api/rim/products/42/market-dossier');
    expect(rowFor('US').getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the market\'s OWN record — not the first row of the dossier', async () => {
    routes(() => okJson(DOSSIER));
    render(<Surface />);
    await waitFor(() => expect(rowFor('JP')).toBeTruthy());

    fireEvent.click(rowFor('JP'));

    // JP's record, matched by country out of a dossier whose first entry is US.
    await waitFor(() => expect(screen.getByText(/JP label record/)).toBeTruthy());
    expect(screen.getByText(/company core data sheet applies/)).toBeTruthy();
    // JP has no approved label, and the panel says the requirement is unmet
    // rather than rendering an empty list and leaving the reader to infer it.
    expect(screen.getByText(/requires an approved/)).toBeTruthy();
    expect(screen.queryByText(/USPI v4/)).toBeNull();
  });

  it('shows the approved label the market actually has', async () => {
    routes(() => okJson(DOSSIER));
    render(<Surface />);
    await waitFor(() => expect(rowFor('US')).toBeTruthy());

    fireEvent.click(rowFor('US'));

    await waitFor(() => expect(screen.getByText(/USPI v4/)).toBeTruthy());
    expect(screen.getByText(/1 approved label/)).toBeTruthy();
    expect(screen.queryByText(/requires an approved/)).toBeNull();
  });

  it('reports a FAILED dossier read as a failed read, never as "no labels on file"', async () => {
    /* The two are different regulatory claims about the org's file, and only
       one of them is ever true at a time. An unreadable dossier rendered as an
       empty one tells a reviewer the company holds no approved label in a
       market where it may well hold one. */
    routes(() => ({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL', message: 'boom' } }) }));
    render(<Surface />);
    await waitFor(() => expect(rowFor('US')).toBeTruthy());

    fireEvent.click(rowFor('US'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/failed read, not an empty dossier/i);
    expect(screen.queryByText(/No label record is on file/)).toBeNull();
    expect(screen.queryByText(/No approved label is on file/)).toBeNull();
  });

  it('says so plainly when the dossier holds nothing for this market', async () => {
    // A successful read that simply has no row for US — the honest empty, and
    // the one state that IS allowed to say nothing is on file.
    routes(() => okJson([DOSSIER[1]]));
    render(<Surface />);
    await waitFor(() => expect(rowFor('US')).toBeTruthy());

    fireEvent.click(rowFor('US'));

    await waitFor(() => expect(screen.getByText(/No label record is on file for US/)).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
