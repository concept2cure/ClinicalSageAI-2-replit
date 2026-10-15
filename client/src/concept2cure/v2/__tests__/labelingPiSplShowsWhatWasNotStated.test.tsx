// @vitest-environment jsdom
/**
 * The SPL tab says what the downloaded SPL carries that nobody stated, and lets
 * the version and effective date be stated.
 *
 * Until 2026-10-15 buildSpl read only `xml`, `sectionCount` and `validation`
 * from POST /api/labeling-pi/spl. The server began returning `warnings` — each
 * document element not stated and the value the SPL carries instead (version 1,
 * the generation date as effectiveTime) — and the surface dropped them, so a
 * download that passed the structural check toasted "It passes the structural
 * check." with nothing about an effective date nobody gave. The form had no
 * version or effective-date field, so there was no way to state either.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let splResponse: unknown;

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const json =
      path === '/api/labeling-pi/spl'
        ? splResponse
        : path.startsWith('/api/labeling-pi')
          ? { data: [SECTION] }
          : { data: {} };
    return { ok: true, status: 200, json: async () => json, blob: async () => new Blob(['x']), headers: { get: () => null } };
  }),
  serverMessage: (p: unknown) => (p as { error?: { message?: string } } | null)?.error?.message ?? null,
  redactInternals: (s: string) => s,
}));

const downloaded: string[] = [];
vi.mock('../download', () => ({
  downloadBlob: (name: string) => { downloaded.push(name); return true; },
  downloadText: (name: string) => { downloaded.push(name); return true; },
  safeFileName: (s: string, f = 'download') => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || f,
}));

const SECTION = {
  n: '1', label: 'Indications and usage', st: 'approved', flag: null, program: 'ZX-991 (larotinib)',
  content: { heading: '1  Indications and usage', body: ['Indicated for the treatment of X.'] },
  negotiation: null,
};

const WARNINGS = [
  'version not stated — the document carries versionNumber 1. FDA expects the version to advance with each new version of the same labeling (setId); state it for anything but the first.',
  "effective date not stated — the document carries 20261015, the date it was generated, as its effectiveTime; state the labeling's effective date.",
];

import { LabelingPI } from '../surfaces/LabelingPi';

beforeEach(() => {
  calls.length = 0;
  downloaded.length = 0;
  splResponse = { data: { xml: '<document/>', sectionCount: 5, validation: { valid: true, findings: [] }, warnings: WARNINGS } };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function openSplTab() {
  render(
    <LabelingPI
      {...({ surface: { id: 'labeling-pi' }, onAsk: () => {}, onNav: () => {}, segment: 'biopharma' } as unknown as React.ComponentProps<typeof LabelingPI>)}
    />,
  );
  await screen.findByText('Indications and usage');
  fireEvent.click(screen.getByRole('button', { name: /SPL — submission/ }));
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'ZX-991' } });
  fireEvent.change(screen.getByPlaceholderText(/Labeler/), { target: { value: 'Concept2Cure' } });
  fireEvent.change(screen.getByPlaceholderText(/Established/), { target: { value: 'larotinib' } });
}

describe('LabelingPI — the SPL says what it was not told', () => {
  it('shows each element the downloaded SPL carries that was not stated', async () => {
    await openSplTab();
    fireEvent.click(screen.getByRole('button', { name: /Build and download SPL XML/ }));
    await waitFor(() => expect(downloaded.some((n) => n.endsWith('-spl.xml'))).toBe(true));

    expect(await screen.findByText(WARNINGS[0])).toBeTruthy();
    expect(screen.getByText(WARNINGS[1])).toBeTruthy();
  });

  it('sends the version and effective date the user states', async () => {
    splResponse = { data: { xml: '<document/>', sectionCount: 5, validation: { valid: true, findings: [] }, warnings: [] } };
    await openSplTab();
    fireEvent.change(screen.getByLabelText(/^Version/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/^Effective date/), { target: { value: '2026-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Build and download SPL XML/ }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/labeling-pi/spl')).toBe(true));
    const body = calls.find((c) => c.path === '/api/labeling-pi/spl')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ version: '3', effectiveDate: '2026-03-01' });
    await waitFor(() => expect(downloaded.some((n) => n.endsWith('-spl.xml'))).toBe(true));
    expect(screen.queryByText(/not stated/)).toBeNull();
  });
});
