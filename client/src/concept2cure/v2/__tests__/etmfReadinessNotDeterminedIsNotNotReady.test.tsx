// @vitest-environment jsdom
/**
 * eTMF: a readiness the server could not determine is shown as not determined.
 *
 * GET /api/etmf/trials/:id/completeness returns `ready: boolean | null` with a
 * `basis` and `summary.totalUnverified` (server tmf-completeness.ts). `null`
 * means every remaining gap is a filing against an off-platform reference the
 * service cannot check — readiness is undetermined, not "no".
 *
 * Until 2026-10-15 the client typed `ready` as boolean and rendered null as the
 * negative verdict: the cover badge read "NOT INSPECTION-READY", section 1 "not
 * yet inspection-ready", AnA was told "NOT ready", the offline report's verdict
 * line said NOT INSPECTION-READY and an `X-TMF-Ready: undetermined` package was
 * toasted as "gaps remain". The basis and the filed-without-a-verified-document
 * count were not shown anywhere.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob,
}));

import { Etmf } from '../surfaces/Etmf';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

function completeZone(n: number) {
  const codes = ['z' + n + '_a', 'z' + n + '_b'];
  return { number: n, name: 'Zone ' + n, required: codes, present: codes, missing: [], unverified: [], complete: true };
}

/** Both open essentials are filed against off-platform references: ready is null. */
const UNDETERMINED = {
  ready: null,
  basis: 'verified_documents',
  scope: 'essential',
  zones: [
    completeZone(1),
    {
      number: 2, name: 'Central Trial Documents', required: ['protocol', 'sample_icf'], present: [],
      missing: ['protocol', 'sample_icf'],
      unverified: [{ code: 'protocol', evidence: 'unverifiable' }, { code: 'sample_icf', evidence: 'unverifiable' }],
      complete: false,
    },
    ...[3, 4, 5, 6, 7, 8].map(completeZone),
  ],
  summary: { zoneCount: 8, zonesComplete: 7, totalRequired: 16, totalMissing: 2, totalUnverified: 2 },
  documentEvidence: { protocol: 'unverifiable', sample_icf: 'unverifiable' },
};

/** One essential unfiled, one filed with no document: ready is false. */
const NOT_READY = {
  ...UNDETERMINED,
  ready: false,
  zones: [
    completeZone(1),
    {
      number: 2, name: 'Central Trial Documents', required: ['protocol', 'sample_icf'], present: [],
      missing: ['protocol', 'sample_icf'], unverified: [{ code: 'protocol', evidence: 'no_document' }], complete: false,
    },
    ...[3, 4, 5, 6, 7, 8].map(completeZone),
  ],
  summary: { zoneCount: 8, zonesComplete: 7, totalRequired: 16, totalMissing: 2, totalUnverified: 1 },
  documentEvidence: { protocol: 'no_document' },
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

let published: SurfaceContext | null = null;
function Probe() {
  published = useActiveSurfaceContext('etmf');
  return null;
}

function mount() {
  render(
    <>
      <Etmf {...({ surface: { id: 'etmf' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />
      <Probe />
    </>,
  );
}

function nameTrial(id: string) {
  fireEvent.change(screen.getByLabelText('Trial identifier'), { target: { value: id } });
}

const text = () => document.body.textContent ?? '';
/** jsdom's Blob has no text(). */
const readBlob = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

beforeEach(() => {
  apiRequest.mockReset();
  downloadBlob.mockClear();
  published = null;
});
afterEach(() => { cleanup(); });

describe('eTMF — ready: null is "readiness not determined", never NOT INSPECTION-READY', () => {
  it('says readiness is not determined, with the filed-without-a-verified-document count and the basis', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok(UNDETERMINED)));
    mount();
    nameTrial('TRIAL-ND');
    await waitFor(() => expect(screen.getByText(/Zone completeness/i)).toBeTruthy());

    const seen = text();
    expect(/NOT INSPECTION-READY/.test(seen), 'ready: null must not be badged NOT INSPECTION-READY').toBe(false);
    expect(/not yet inspection-ready/i.test(seen), 'ready: null must not read as "not yet inspection-ready"').toBe(false);
    expect(/readiness not determined/i.test(seen)).toBe(true);
    expect(/2 filed, no verified document/i.test(seen)).toBe(true);
    expect(/counts as filed only when its filing references a vault document/i.test(seen), 'the basis is stated').toBe(true);
    expect(/INSPECTION-READY\b/.test(seen.replace(/READINESS NOT DETERMINED/g, '')), 'no ready verdict either').toBe(false);

    await waitFor(() => expect(published?.summary).toMatch(/readiness not determined/i));
    expect(published?.summary).not.toMatch(/NOT ready/);
    expect((published?.facts as Record<string, unknown>).inspectionReady).toBeNull();
    expect((published?.facts as Record<string, unknown>).basis).toBe('verified_documents');
  });

  it('writes READINESS NOT DETERMINED, the count and the basis into the offline report', async () => {
    apiRequest.mockImplementation((_m: string, url: string) =>
      String(url).includes('inspection-package')
        ? Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
        : Promise.resolve(ok(UNDETERMINED)),
    );
    mount();
    nameTrial('TRIAL-ND');
    await waitFor(() => expect(screen.getByText(/Zone completeness/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Generate package/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const [name, blob] = downloadBlob.mock.calls[0] as unknown as [string, Blob];
    expect(name).toBe('TRIAL-ND_inspection-readiness.md');
    const md = await readBlob(blob);
    expect(md).toMatch(/\*\*Verdict \(completeness\):\*\* READINESS NOT DETERMINED/);
    expect(md).not.toMatch(/NOT INSPECTION-READY/);
    expect(md).toMatch(/Filed, no verified document 2/);
    expect(md).toMatch(/\*\*Basis:\*\* An artifact counts as filed only when its filing references a vault document/);
  });

  it('toasts an X-TMF-Ready: undetermined package as not determined, not "gaps remain"', async () => {
    apiRequest.mockImplementation((_m: string, url: string) =>
      String(url).includes('inspection-package')
        ? Promise.resolve({
            ok: true,
            status: 200,
            blob: async () => new Blob(['zip']),
            headers: new Headers({ 'X-TMF-Ready': 'undetermined', 'X-TMF-SHA256': 'abcdef0123456789' }),
          })
        : Promise.resolve(ok(UNDETERMINED)),
    );
    mount();
    nameTrial('TRIAL-ND');
    await waitFor(() => expect(screen.getByText(/Zone completeness/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Generate package/i }));
    await waitFor(() => expect(screen.getByText(/Inspection index generated/i)).toBeTruthy());
    expect(text()).toMatch(/Inspection index generated — readiness not determined/);
    expect(text()).not.toMatch(/gaps remain/);
  });

  it('still says NOT INSPECTION-READY when the server says ready: false, and counts the filing with no document', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok(NOT_READY)));
    mount();
    nameTrial('TRIAL-NR');
    await waitFor(() => expect(screen.getByText(/Zone completeness/i)).toBeTruthy());

    const seen = text();
    expect(/NOT INSPECTION-READY/.test(seen)).toBe(true);
    expect(/readiness not determined/i.test(seen)).toBe(false);
    expect(/1 filed, no verified document/i.test(seen)).toBe(true);
    await waitFor(() => expect(published?.summary).toMatch(/NOT ready/));
  });
});
