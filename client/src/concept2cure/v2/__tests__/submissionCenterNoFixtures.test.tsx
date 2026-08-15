// @vitest-environment jsdom
/**
 * SubmissionCenter — fixture-free contract (GA real-data standard).
 *
 * The Submission Center is the eCTD submission core's UI. Its portfolio list
 * binds to GET /api/submissions and each submission's sequences to
 * GET /api/submissions/:id/sequences (both DB-backed, org-scoped via
 * submission-service). Earlier in the port it carried the kit's sample program
 * (BX-204 …) behind a "Sample data" pill; that has been retired.
 *
 * These tests pin the four honest states the surface may render — a loading
 * note, REAL rows from the two GETs, an honest EMPTY state, or an honest ERROR
 * state — and prove:
 *   • the portfolio table renders the REAL submission (not a constant);
 *   • the AnswerLead sequence COUNT is derived from the REAL sequences array
 *     (a fixture would read the kit's two-sequence sample);
 *   • the Sequences workspace renders the REAL sequence rows;
 *   • empty → EmptyState "No submissions yet", error → EmptyState
 *     "Couldn't load the submissions" — never a fixture, never a pill;
 *   • no retired sample-content string and no fixture/SampleTag SYMBOL survives
 *     in the surface source.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn() });

/* REAL, org-scoped payloads — deliberately NOT the kit's BX-204 sample, so
   anything rendered proves the response was adopted, not a codebase constant.
   The real routes return BARE ARRAYS (res.json(await listSubmissions(ctx)) /
   listSequences(...)), so the mocks do too. */
const SUBS = [
  {
    id: 7,
    title: 'ZX-9 First-in-Human',
    productName: 'Zexanib',
    applicationType: 'ind',
    clientType: 'biotech',
    primaryRegion: 'fda',
    status: 'active',
    lifecycleStage: 'original',
  },
];

const SEQS = [
  {
    id: 21,
    sequenceNumber: '0000',
    type: 'original',
    status: 'assembling',
    region: 'fda',
    validationStatus: 'pending',
  },
];

const SUB_SEQ_URL = '/api/submissions/7/sequences';

/* Kit sample-content strings that must NEVER appear once the fixtures are gone.
   (Every one lives only in the retired SC_SUBMISSIONS/SC_SEQUENCES/SC_FINDINGS/
   SC_SHADOW/SC_LEAVES content constants — none is reference config, so its
   presence would mean a fixture leaked back in.) */
const RETIRED = [
  'BX-204',
  'BX-301',
  'define.xml — ADaM ADTTE dataset',
  'Comparability protocol',
  'Form FDA 356h',
  'ISS — integrated safety',
  '2 days ago',
  'Sample data',
];

function expectNoFixtureArtifacts() {
  // No provenance pill anywhere on the page …
  expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  // … and no retired sample-content string.
  for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('SubmissionCenter — real rows render (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/submissions') {
        return { ok: true, status: 200, json: async () => SUBS } as Response;
      }
      if (method === 'GET' && url === SUB_SEQ_URL) {
        return { ok: true, status: 200, json: async () => SEQS } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
  });

  it('renders the REAL submission in the portfolio table (not a constant)', async () => {
    render(<SubmissionCenter {...props()} />);

    // The portfolio table appears only on a successful non-empty load.
    await waitFor(() => expect(document.querySelector('.ub-inv')).toBeTruthy());
    const table = document.querySelector('.ub-inv')!;
    expect(table.textContent).toContain('ZX-9 First-in-Human'); // real title
    expect(table.textContent).toContain('Zexanib'); // real productName

    expectNoFixtureArtifacts();
  });

  it('derives the AnswerLead sequence count from the REAL sequences array', async () => {
    render(<SubmissionCenter {...props()} />);

    // One real sequence → the singular "1 eCTD sequence tracked". The kit
    // fixture shipped two sequences, so this positively proves derivation from
    // the live GET rather than a constant.
    await waitFor(() =>
      expect(document.body.textContent).toContain('1 eCTD sequence tracked'),
    );

    expect(apiRequest).toHaveBeenCalledWith('GET', SUB_SEQ_URL);
    expectNoFixtureArtifacts();
  });

  it('renders the REAL sequence rows in the Sequences workspace', async () => {
    render(<SubmissionCenter {...props()} />);

    // Open the submission → the Sequences workspace (portfolio row click sets
    // both the selected submission and ws='sequences').
    await waitFor(() => expect(document.querySelector('.sc-subrow')).toBeTruthy());
    fireEvent.click(document.querySelector('.sc-subrow')!);

    // The real sequence number + type render from the live list.
    expect(await screen.findByText('0000')).toBeTruthy();
    expect(document.body.textContent).toContain('original sequence');

    expectNoFixtureArtifacts();
  });
});

describe('SubmissionCenter — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/submissions') {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
  });

  it('shows an EmptyState — never a fixture — when the org has no submissions', async () => {
    render(<SubmissionCenter {...props()} />);

    expect(await screen.findByText('No submissions yet')).toBeTruthy();
    // No table, and no submission was selected (so no per-submission fetch).
    expect(document.querySelector('.ub-inv')).toBeNull();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', SUB_SEQ_URL);
    expectNoFixtureArtifacts();
  });
});

describe('SubmissionCenter — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/submissions') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { code: 'AUTH_REQUIRED' } }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
  });

  it("shows an error EmptyState — never a fixture — when the read fails", async () => {
    render(<SubmissionCenter {...props()} />);

    expect(await screen.findByText("Couldn't load the submissions")).toBeTruthy();
    // The error-toned honest panel, not a table and not a fixture.
    expect(document.querySelector('.c2c-empty-state.tone-error')).toBeTruthy();
    expect(document.querySelector('.ub-inv')).toBeNull();
    expectNoFixtureArtifacts();
  });
});

describe('SubmissionCenter — no fixture/SampleTag symbol remains in source', () => {
  // Vitest runs from the repo root; resolve the surface source from there.
  const src = readFileSync(
    resolve(process.cwd(), 'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx'),
    'utf8',
  );

  it('imports and renders no retired sample-content fixture constant', () => {
    // The sample-content constants are the fixtures the surface used to render.
    // Only the canonical enum/label/state-machine maps may remain (asserted
    // below), so none of these content symbols may appear anywhere in the file.
    for (const sym of [
      'SC_SUBMISSIONS',
      'SC_SEQUENCES',
      'SC_FINDINGS',
      'SC_SHADOW',
      'SC_CROSSREGION',
      'SC_LEAVES',
    ]) {
      expect(src, `${sym} must not appear in the surface`).not.toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });

  it('neither imports nor renders SampleTag', () => {
    // (The header comment documents that SampleTag was removed — that mention is
    //  fine; what must not exist is an import binding or a JSX usage.)
    expect(src).not.toContain('<SampleTag');
    expect(src).not.toMatch(/import\s*{[^}]*\bSampleTag\b[^}]*}\s*from/);
  });

  it('stays on the honest data path (useLiveRows + EmptyState)', () => {
    expect(src).toContain('useLiveRows');
    expect(src).toContain('EmptyState');
  });
});
