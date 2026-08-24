// @vitest-environment jsdom
/**
 * The labeling surface's controls do what they say.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Six controls on LabelingPi.tsx were inert, and one asserted a fact about a
 * product that did not exist:
 *
 *   line 126/127  <button className="reg-mini">{I.fileText} PDF</button>
 *                 <button className="reg-mini">{I.download} Word</button>
 *                 — no onClick. Both renderers existed and were never called.
 *   line 153      <button className="reg-btn pri">{I.check} Accept FDA text</button>
 *                 — the primary action of an agency labeling negotiation, with
 *                 no handler at all.
 *   line 155      <button className="reg-btn ghost">View full redline</button>
 *                 — no onClick; no redline was ever rendered.
 *   line 81       the format tabs — `fmt` was read nowhere except its own
 *                 highlight class, so "EU SmPC — QRD" and "SPL — submission"
 *                 showed the identical US label under a heading claiming
 *                 otherwise.
 *   line 85       the stage ladder — four buttons over a local
 *                 useState('Negotiation'), starting on "Negotiation" for every
 *                 organisation and persisting nothing.
 *   line 124      <span className="lp-doc-id">BX-204 (rezatinib) -- USPI — v3.2</span>
 *                 — an invented product, molecule and version number headed
 *                 above whatever real sections the tenant's store returned.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * Not that the buttons render — they always did, which is what made this
 * invisible. It asserts the CHAIN each one is supposed to complete: a click
 * reaches a transport, or changes what is on screen. A dead button fails at the
 * first step; a `setState` that nothing reads fails at the second.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/** Every request the surface makes, in order. */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
/** What each path answers with, keyed by path. */
let responder: (method: string, path: string, body?: unknown) => { ok: boolean; status: number; json?: unknown; blob?: Blob };

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const r = responder(method, path, body);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.json ?? {},
      blob: async () => r.blob ?? new Blob(['x']),
      headers: { get: () => null },
    };
  }),
  serverMessage: (p: unknown) =>
    (p as { error?: { message?: string } } | null)?.error?.message ?? null,
  redactInternals: (s: string) => s,
}));

const downloaded: string[] = [];
vi.mock('../download', () => ({
  downloadBlob: (name: string) => { downloaded.push(name); return true; },
  downloadText: (name: string) => { downloaded.push(name); return true; },
  safeFileName: (s: string, f = 'download') =>
    String(s).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || f,
}));

const SECTION_WITH_NEGOTIATION = {
  n: '5',
  label: 'Warnings and precautions',
  st: 'negotiation',
  flag: 'agency',
  program: 'ZX-991 (larotinib)',
  content: { heading: '5  Warnings and precautions', body: ['Sponsor paragraph as filed.'] },
  negotiation: {
    round: 'Labeling round 2',
    cycle: 'FDA — day 312',
    sponsor: 'Monitor liver enzymes periodically during treatment.',
    agency: 'Monitor liver enzymes prior to and monthly during treatment.',
    rationale: 'The agency asks for a defined monitoring interval.',
  },
};
const PLAIN_SECTION = {
  n: '1', label: 'Indications and usage', st: 'approved', flag: null,
  program: 'ZX-991 (larotinib)',
  content: { heading: '1  Indications and usage', body: ['Indicated for the treatment of X.'] },
  negotiation: null,
};

const SMPC = {
  sections: [
    { number: '1', title: 'Name of the medicinal product', depth: 0, required: true, status: 'final' },
    { number: '4.8', title: 'Undesirable effects', depth: 1, required: true, status: 'draft' },
  ],
  finalRequired: 1, totalRequired: 2, completenessPct: 50, ready: false, outstanding: ['4.8'],
};

import { LabelingPI, deriveLabelStage } from '../surfaces/LabelingPi';

beforeEach(() => {
  calls.length = 0;
  downloaded.length = 0;
  responder = (_m, path) => {
    if (path.startsWith('/api/labeling-pi') && !path.includes('accept') && !path.endsWith('/spl')) {
      return { ok: true, status: 200, json: { data: [PLAIN_SECTION, SECTION_WITH_NEGOTIATION] } };
    }
    if (path.startsWith('/api/labeling-smpc')) return { ok: true, status: 200, json: { data: SMPC } };
    return { ok: true, status: 200, json: { data: {} } };
  };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function mount() {
  /* LabelingPI destructures only onAsk, but it DECLARES the full
     SurfaceViewProps — the render site owes the whole contract. */
  render(
    <LabelingPI
      surface={{ id: 'labeling-pi', label: 'Labeling' } as never}
      segment="biopharma"
      onAsk={() => {}}
      onNav={() => {}}
    />,
  );
  await screen.findByText('Warnings and precautions');
}

describe('deriveLabelStage — the ladder reads the sections, not a useState', () => {
  it('reports Negotiation when any section carries an agency edit', () => {
    expect(deriveLabelStage([{ st: 'draft', flag: 'agency', negotiation: null }])).toBe(2);
  });
  it('reports Approved only when every live section is approved', () => {
    expect(deriveLabelStage([{ st: 'approved', flag: null, negotiation: null }])).toBe(3);
    expect(deriveLabelStage([
      { st: 'approved', flag: null, negotiation: null },
      { st: 'draft', flag: null, negotiation: null },
    ])).toBe(0);
  });
  it('reports FDA labeling review when a section is in review', () => {
    expect(deriveLabelStage([
      { st: 'review', flag: null, negotiation: null },
      { st: 'draft', flag: null, negotiation: null },
    ])).toBe(1);
  });
  it('asserts nothing about a label that has no sections', () => {
    expect(deriveLabelStage([])).toBe(-1);
    expect(deriveLabelStage([{ st: 'na', flag: null, negotiation: null }])).toBe(-1);
  });
});

describe('LabelingPI — the document bar', () => {
  it('heads the label with the product the org recorded, not a hardcoded molecule', async () => {
    await mount();
    expect(screen.getByText(/ZX-991 \(larotinib\)/)).toBeTruthy();
    expect(screen.queryByText(/BX-204/)).toBeNull();
    // The version number is gone entirely — the store carries none.
    expect(screen.queryByText(/v3\.2/)).toBeNull();
  });

  it('PDF reaches the renderer with the label assembled from the rows on screen', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('export-pdf'))).toBe(true));
    const c = calls.find((x) => x.path.includes('export-pdf'))!;
    const body = c.body as { title: string; content: string };
    expect(body.title).toContain('ZX-991');
    // Both authored sections travel, in the order the tree renders them.
    expect(body.content).toContain('Indicated for the treatment of X.');
    expect(body.content).toContain('Sponsor paragraph as filed.');
    await waitFor(() => expect(downloaded.some((n) => n.endsWith('.pdf'))).toBe(true));
  });

  it('Word reaches the DOCX renderer', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('export-docx'))).toBe(true));
    await waitFor(() => expect(downloaded.some((n) => n.endsWith('.docx'))).toBe(true));
  });
});

describe('LabelingPI — the agency negotiation', () => {
  async function openNegotiation() {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Warnings and precautions/ }));
    await screen.findByText(/Agency labeling negotiation/);
  }

  it('"View full redline" renders the sponsor-vs-agency diff', async () => {
    await openNegotiation();
    expect(screen.queryByText(/Full redline/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /View full redline/ }));
    await screen.findByText(/Full redline/);
    // The words the agency ADDED are marked as inserted, not merely repeated.
    const ins = document.querySelectorAll('ins');
    expect(ins.length).toBeGreaterThan(0);
    expect(Array.from(ins).map((e) => e.textContent).join(' ')).toMatch(/monthly|prior/);
  });

  it('refuses to accept agency text without an audited reason — nothing is sent', async () => {
    await openNegotiation();
    const accept = screen.getByRole('button', { name: /Accept FDA text/ });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(accept);
    expect(calls.some((c) => c.path.includes('accept-agency-text'))).toBe(false);
  });

  it('accepts the agency text, carrying the reason, and re-reads the label', async () => {
    await openNegotiation();
    fireEvent.change(screen.getByLabelText(/Reason for change/), {
      target: { value: 'Adopted at the day-312 labeling teleconference' },
    });
    const accept = screen.getByRole('button', { name: /Accept FDA text/ });
    await waitFor(() => expect((accept as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(accept);
    await waitFor(() => expect(calls.some((c) => c.path.includes('accept-agency-text'))).toBe(true));
    const c = calls.find((x) => x.path.includes('accept-agency-text'))!;
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/api/labeling-pi/5/accept-agency-text');
    expect((c.body as { reasonForChange: string }).reasonForChange)
      .toBe('Adopted at the day-312 labeling teleconference');
  });
});

describe('LabelingPI — the format tabs are three documents, not one', () => {
  it('EU SmPC reads the org’s own QRD statuses instead of re-showing the US label', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /EU SmPC/ }));
    await waitFor(() => expect(calls.some((c) => c.path.startsWith('/api/labeling-smpc'))).toBe(true));
    await screen.findByText('Undesirable effects');
    // The US section tree is gone — this is a different document.
    expect(screen.queryByText('Indications and usage')).toBeNull();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('SPL builds from the stored label once product identity is supplied', async () => {
    responder = (_m, path) => {
      if (path === '/api/labeling-pi/spl') {
        return { ok: true, status: 200, json: { data: { xml: '<document/>', sectionCount: 5, validation: { valid: true, findings: [] } } } };
      }
      if (path.startsWith('/api/labeling-pi')) return { ok: true, status: 200, json: { data: [PLAIN_SECTION, SECTION_WITH_NEGOTIATION] } };
      return { ok: true, status: 200, json: { data: {} } };
    };
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /SPL — submission/ }));
    const build = await screen.findByRole('button', { name: /Build and download SPL XML/ });
    // Refuses until the identity SPL requires is present.
    expect((build as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText?.('Product name') ?? screen.getByPlaceholderText(/ZX-991/), { target: { value: 'ZX-991' } });
    fireEvent.change(screen.getByPlaceholderText(/Labeler/), { target: { value: 'Concept2Cure' } });
    fireEvent.change(screen.getByPlaceholderText(/Established/), { target: { value: 'larotinib' } });
    await waitFor(() => expect((build as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(build);
    await waitFor(() => expect(calls.some((c) => c.path === '/api/labeling-pi/spl')).toBe(true));
    await waitFor(() => expect(downloaded.some((n) => n.endsWith('-spl.xml'))).toBe(true));
  });
});
