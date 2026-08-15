// @vitest-environment jsdom
/**
 * Global filing strategy — proves the surface reaches the previously orphaned
 * cross-jurisdictional engine and reports it honestly.
 *
 * ── The property that matters most here ──────────────────────────────────────
 * "No recorded divergence between FDA and EMA" and "these agencies agree" are
 * completely different claims, and only one of them is supportable from an empty
 * result set. A sponsor who reads the first as the second files on an assumption
 * the data never made. Several tests below exist only to pin that distinction.
 *
 * ── Why the tables are asserted loosely ──────────────────────────────────────
 * `RecordTable` derives its columns from the rows the service actually returns,
 * so these tests assert on VALUES appearing, not on a fixed column set. Pinning
 * a column list here would re-introduce exactly the staleness the derivation
 * avoids: the service gains a field, the table shows it, and the test that
 * "passes" would be describing a UI that no longer exists.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { FilingStrategy } from '../surfaces/FilingStrategy';

const props = () => ({ surface: { id: 'filing-strategy', label: 'Filing strategy' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const BASE = '/api/regulatory-precedent-intelligence';

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
function fail(status: number, error?: string) {
  return { ok: false, status, json: async () => ({ error }) } as Response;
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({}));
});

function toast() {
  const el = document.querySelector('.de-toast');
  return el as HTMLElement | null;
}

describe('filing sequence', () => {
  it('posts the selected agencies and optimisation goal to the real endpoint', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.endsWith('/optimize-filing')
        ? ok({ recommendedSequence: [{ agency: 'FDA', order: 1, rationale: 'Largest market, strongest precedent' }] })
        : ok({}));

    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'monoclonal antibody' } });
    fireEvent.click(screen.getByRole('button', { name: 'PMDA' }));
    fireEvent.change(screen.getByLabelText(/Optimise for/), { target: { value: 'speed' } });
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find(c => c[1] === `${BASE}/cross-jurisdictional/optimize-filing`);
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({
        productType: 'monoclonal antibody',
        targetAgencies: ['FDA', 'EMA', 'PMDA'],
        optimizeFor: 'speed',
      });
      // A blank optional field is omitted, not sent as an empty string.
      expect('therapeuticArea' in call![2]).toBe(false);
    });
    expect(await screen.findByText(/Largest market, strongest precedent/)).toBeTruthy();
  });

  it('refuses to sequence a single agency', async () => {
    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'EMA' })); // deselect, leaving only FDA
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));

    await waitFor(() => expect(toast()?.textContent).toContain('at least two agencies'));
    expect(apiRequest.mock.calls.some(c => String(c[1]).endsWith('/optimize-filing'))).toBe(false);
  });

  it('says the record is empty rather than inventing a sequence', async () => {
    apiRequest.mockImplementation(async () => ok({ recommendedSequence: [] }));
    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));
    expect(await screen.findByText(/No sequence returned/)).toBeTruthy();
  });

  it('surfaces the server’s own error text', async () => {
    apiRequest.mockImplementation(async () => fail(500, 'cross-jurisdictional store unavailable'));
    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));
    expect(await screen.findByText('cross-jurisdictional store unavailable')).toBeTruthy();
    // Distinct from "no sequence": a failed call is not an empty record.
    expect(screen.queryByText(/No sequence returned/)).toBeNull();
  });
});

describe('agency divergence', () => {
  it('does not report an empty result as agreement', async () => {
    // The load-bearing test in this file. A sponsor reading "no divergences" as
    // "the agencies agree" files on an assumption the data never made.
    apiRequest.mockImplementation(async () => ok([]));
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agency divergence' }));
    fireEvent.click(screen.getByRole('button', { name: /Find divergences/ }));

    const empty = await screen.findByText(/No recorded divergences/);
    expect(empty).toBeTruthy();
    expect(screen.getByText(/absence of evidence, not evidence the agencies agree/)).toBeTruthy();
  });

  it('posts both agencies and renders what came back', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.endsWith('/divergences/search')
        ? ok([{ domain: 'clinical', severity: 'high', description: 'EMA requires a paediatric investigation plan at MAA' }])
        : ok({}));
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agency divergence' }));
    fireEvent.change(screen.getByLabelText(/Agency B/), { target: { value: 'PMDA' } });
    fireEvent.click(screen.getByRole('button', { name: /Find divergences/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find(c => String(c[1]).endsWith('/divergences/search'));
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ agencyA: 'FDA', agencyB: 'PMDA' });
    });
    expect(await screen.findByText(/paediatric investigation plan/)).toBeTruthy();
  });

  it('refuses to compare an agency with itself', async () => {
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agency divergence' }));
    fireEvent.change(screen.getByLabelText(/Agency B/), { target: { value: 'FDA' } });
    fireEvent.click(screen.getByRole('button', { name: /Find divergences/ }));

    await waitFor(() => expect(toast()?.textContent).toContain('two different agencies'));
    expect(apiRequest.mock.calls.some(c => String(c[1]).endsWith('/divergences/search'))).toBe(false);
  });
});

describe('calibration', () => {
  it('distinguishes "nothing measured yet" from "well calibrated"', async () => {
    apiRequest.mockImplementation(async () => ok({ buckets: [] }));
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prediction calibration' }));
    fireEvent.click(screen.getByRole('button', { name: /Load calibration report/ }));

    expect(await screen.findByText(/No resolved predictions yet/)).toBeTruthy();
    expect(screen.getByText(/different from being well calibrated/)).toBeTruthy();
  });

  it('renders the overall accuracy the server computed', async () => {
    apiRequest.mockImplementation(async () =>
      ok({ overallAccuracy: 0.73, totalPredictions: 412, buckets: [{ bucket: '0.9-1.0', predicted: 0.94, actual: 0.61, n: 88 }] }));
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prediction calibration' }));
    fireEvent.click(screen.getByRole('button', { name: /Load calibration report/ }));

    expect(await screen.findByText(/73% overall accuracy/)).toBeTruthy();
    expect(screen.getByText(/412 resolved predictions/)).toBeTruthy();
    // The over-confident bucket must be visible — that is the point of the report.
    expect(screen.getByText('0.61')).toBeTruthy();
  });
});

describe('robustness and accessibility', () => {
  it('survives every panel answering with a non-array', async () => {
    // Same class as the ectd-compile and Mission Control crashes: `?? []` does
    // not coerce a truthy `{…}`, so list access must go through asArray().
    apiRequest.mockImplementation(async () => ok({ unexpected: 'shape' }));
    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));
    expect(await screen.findByText(/No sequence returned/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Agency divergence' }));
    fireEvent.click(screen.getByRole('button', { name: /Find divergences/ }));
    expect(await screen.findByText(/No recorded divergences/)).toBeTruthy();
  });

  it('says to sign in on a 401', async () => {
    apiRequest.mockImplementation(async () => fail(401));
    render(<FilingStrategy {...props()} />);
    fireEvent.change(screen.getByLabelText(/Product type/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));
    expect(await screen.findByText(/Sign in to your tenant/)).toBeTruthy();
  });

  it('marks agency and tab selection for assistive technology, not by colour alone', () => {
    render(<FilingStrategy {...props()} />);
    expect(screen.getByRole('button', { name: 'FDA' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'PMDA' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Filing sequence' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Agency divergence' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('announces refusals through a live region', async () => {
    render(<FilingStrategy {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Optimise sequence/ }));
    await waitFor(() => expect(toast()).toBeTruthy());
    expect(toast()!.getAttribute('role')).toBe('status');
    expect(toast()!.getAttribute('aria-live')).toBe('polite');
  });

  it('groups the agency toggles under a legend', () => {
    // Nine loose toggle buttons with no grouping give a screen-reader user no
    // indication that they belong to one multi-select.
    render(<FilingStrategy {...props()} />);
    expect(screen.getByRole('group', { name: /Target agencies/ })).toBeTruthy();
  });
});
