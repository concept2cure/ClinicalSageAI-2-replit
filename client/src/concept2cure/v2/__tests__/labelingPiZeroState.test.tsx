// @vitest-environment jsdom
/**
 * BP-W0-3, on the surface the fix did not reach.
 *
 * The KPI row renders ABOVE the loading/error branch, so on a failed read
 * `rows` is [] and every metric derived from it reads zero — including "Boxed
 * warning proposed". A boxed warning is the most serious element of a US label.
 * Reporting zero proposed when the read failed tells a regulatory director the
 * label carries none, in the neutral tone, on the strength of nothing. The
 * ErrorState below it says the read failed; the number above it contradicts
 * that, and the number is the part that gets quoted.
 *
 * This is the same defect commit e66bd21 fixed on the NDA cockpit's identical
 * pattern. Three surfaces adopted assessmentState; this one is a fourth.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { LabelingPI } from '../surfaces/LabelingPi';
import { Registrations } from '../surfaces/Registrations';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(impl: () => Promise<Partial<Response>>) {
  vi.stubGlobal('fetch', vi.fn(impl) as unknown as typeof fetch);
}

const KPI_LABELS = ['Full PI sections', 'Open agency edits', 'Boxed warning proposed'];

/** Only `onAsk` is read by this surface; the rest satisfy the shared prop type. */
const props = {
  surface: { id: 'labeling-pi' },
  onAsk: () => {},
  onNav: () => {},
  segment: 'biopharma',
} as unknown as React.ComponentProps<typeof LabelingPI>;

/** The value rendered beside a KPI label. */
function kpiValue(label: string): string {
  const el = screen.getByText(label);
  const card = el.closest('.reg-kpi');
  return card?.querySelector('.reg-kpi-v')?.textContent?.trim() ?? '';
}

describe('LabelingPi KPIs on a FAILED read', () => {
  it('states no count at all, rather than zero', async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: 'INTERNAL_ERROR' }) }));
    render(<LabelingPI {...props} />);

    await waitFor(() => expect(screen.queryByText(/Loading the label worklist/)).toBeNull());
    for (const label of KPI_LABELS) {
      expect(kpiValue(label), `${label} asserted a count over a failed read`).toBe('--');
    }
  });

  it('never renders a bare 0 next to "Boxed warning proposed" when the read failed', async () => {
    mockFetch(async () => ({ ok: false, status: 503, json: async () => ({ error: 'PENDING_STORE' }) }));
    render(<LabelingPI {...props} />);

    await waitFor(() => expect(screen.queryByText(/Loading the label worklist/)).toBeNull());
    expect(kpiValue('Boxed warning proposed')).not.toBe('0');
  });

  it('still surfaces the failure itself — the row going quiet is not the whole fix', async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: 'INTERNAL_ERROR' }) }));
    render(<LabelingPI {...props} />);
    expect(await screen.findByText(/Couldn't load the label/i)).toBeTruthy();
  });
});

describe('LabelingPi KPIs on a SUCCESSFUL read', () => {
  it('reports the real counts — the fix must not mute a surface that has an answer', async () => {
    const rows = [
      { n: '1', label: 'Indications and usage', st: 'draft' },
      { n: '2', label: 'Dosage and administration', st: 'draft' },
      { n: 'BW', label: 'Boxed warning', st: 'proposed' },
    ];
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ data: rows }) }));
    render(<LabelingPI {...props} />);

    await waitFor(() => expect(kpiValue('Full PI sections')).toBe('2'));
    expect(kpiValue('Boxed warning proposed')).toBe('1');
  });

  it('reports a genuine zero as zero when the read succeeded and returned nothing', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    render(<LabelingPI {...props} />);
    await waitFor(() => expect(kpiValue('Boxed warning proposed')).toBe('0'));
  });
});

describe('Registrations KPIs — the same defect, found by auditing for it', () => {
  const regProps = {
    surface: { id: 'registrations' },
    onAsk: () => {},
    onNav: () => {},
    segment: 'biopharma',
  } as unknown as React.ComponentProps<typeof Registrations>;

  it('does not report zero approvals when the read failed', async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: 'INTERNAL_ERROR' }) }));
    render(<Registrations {...regProps} />);
    await waitFor(() => expect(kpiValue('Approved / cleared')).toBe('—'));
    // "0 approvals" reads as a fact about the portfolio, not about the request.
    expect(kpiValue('Approved / cleared')).not.toBe('0');
  });


  /* The positive direction — a surface that HAS an answer still reports it —
     is asserted on LabelingPi above. Both surfaces gate on the same
     hasAnswer(assessmentStateFor(...)) expression, so it is covered once
     rather than re-fixtured here; Registrations' grid takes several reads
     and mocking them all would test the fixture, not the rule. */
});
