// @vitest-environment jsdom
/**
 * ChangeAssessment — fixture-free contract.
 *
 * The surface was migrated off the `useLiveList(path, FIXTURE)` + SampleTag
 * (live-or-fixture) pattern onto the honest `useLiveRows` hook. There is no
 * inline fixture left: it renders the org's REAL change_assessments store
 * (GET /api/change-assessment), an honest EMPTY state, or an honest ERROR
 * state — never a fabricated stand-in.
 *
 * This locks that in:
 *   • real rows from the `{ data }` envelope render (list + first-item detail),
 *     and the KPIs are DERIVED from those rows;
 *   • a genuinely empty store shows the honest empty affordance — and crucially
 *     NOT the retired inline fixture ids (CH-118 / CH-121);
 *   • a failed load shows the honest error affordance, again with no fixture.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { ChangeAssessment } from '../surfaces/ChangeAssessment';

/* Two REAL-shaped rows (the mocked server response — not a surface fixture):
   one that triggers a filing (FDA new-submission), one that documents to file. */
const ROWS = [
  {
    id: 'CA-901', title: 'Add closed-loop dosing mode', device: 'AX-9 pump',
    area: 'Software / labeling', raised: '2026-07-01', owner: 'T. Lin',
    fda: { steps: [{ q: 'Safety issue?', basis: 'Flowchart A', a: 'no', detail: 'Enhancement.' }], outcome: 'new-submission', label: 'New 510(k) required', rationale: 'New functional claim.' },
    eu: { steps: [{ q: 'Intended purpose?', basis: 'MDCG 2020-3', a: 'yes', gate: true, detail: 'Significant.' }], outcome: 'nb-notify', label: 'Significant change -- NB notification', rationale: 'NB must assess.' },
    doc: { kind: 'New 510(k) + MDR significant-change file', status: 'draft' },
  },
  {
    id: 'CA-902', title: 'Swap tubing supplier (equivalent material)', device: 'AX-9 pump',
    area: 'Manufacturing / materials', raised: '2026-06-20', owner: 'D. Osei',
    fda: { steps: [{ q: 'Safety issue?', basis: 'Flowchart A', a: 'no', detail: 'Supply change.' }], outcome: 'letter-to-file', label: 'Document to file (no new 510(k))', rationale: 'Equivalent chemistry.' },
    eu: { steps: [{ q: 'Adverse effect?', basis: 'Chart C', a: 'no', gate: true, detail: 'Maintained.' }], outcome: 'record-only', label: 'Non-significant -- internal change record', rationale: 'Record under QMS.' },
    doc: { kind: 'Letter to File + QMS change record', status: 'in-review' },
  },
];

const props = () => ({
  surface: { id: 'change-assessment', label: 'Change assessment' } as any,
  onAsk: vi.fn(), onNav: vi.fn(), segment: 'medical-device',
});

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

function mockGet(body: unknown, ok = true, status = 200) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/change-assessment') {
      return { ok, status, json: async () => body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

describe('ChangeAssessment — fixture-free', () => {
  it('renders the org REAL rows and derives KPIs from them', async () => {
    mockGet({ data: ROWS, meta: { count: 2 } });
    render(<ChangeAssessment {...props()} />);

    // Real rows drive the list. The first item's title also appears in the
    // detail header (it is auto-selected), so it resolves to >1 node.
    expect((await screen.findAllByText('Add closed-loop dosing mode')).length).toBeGreaterThan(0);
    expect(screen.getByText('Swap tubing supplier (equivalent material)')).toBeTruthy();
    expect(document.querySelectorAll('.chg-row')).toHaveLength(2);

    // org-scoped contract path was read.
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/change-assessment');

    // First item's real determination shows in the detail pane.
    expect(screen.getByText('New 510(k) required')).toBeTruthy();

    // KPIs are derived from the real rows, not hardcoded: 2 open, 1 triggers a
    // filing, 1 documents to file, 2 jurisdictions assessed.
    const kpis = Array.from(document.querySelectorAll('.reg-kpi')).map(
      (k) => k.querySelector('.reg-kpi-v')?.textContent,
    );
    expect(kpis).toEqual(['2', '1', '1', '2']);
  });

  it('shows the honest empty state (no fixture) when the store is empty', async () => {
    mockGet({ data: [], meta: { count: 0 } });
    render(<ChangeAssessment {...props()} />);

    await screen.findByText('No change assessments yet');
    // The retired inline fixtures must be GONE — never rendered as a stand-in.
    expect(screen.queryByText(/CH-118|CH-121/)).toBeNull();
    expect(screen.queryByText('Add predictive-low glucose alert algorithm')).toBeNull();
    expect(document.querySelectorAll('.chg-row')).toHaveLength(0);
    // KPIs derive to zero on an empty store — no fabricated counts.
    const openKpi = document.querySelector('.reg-kpi .reg-kpi-v')?.textContent;
    expect(openKpi).toBe('0');
  });

  it('shows the honest error state (no fixture) when the load fails', async () => {
    mockGet({ error: { code: 'INTERNAL' } }, false, 500);
    render(<ChangeAssessment {...props()} />);

    await waitFor(() =>
      expect(screen.getByText(/Couldn’t load change assessments/)).toBeTruthy(),
    );
    expect(document.querySelectorAll('.chg-row')).toHaveLength(0);
    expect(screen.queryByText(/CH-118|CH-121/)).toBeNull();
  });
});
