// @vitest-environment jsdom
/**
 * SubmissionCenter — Device filings section (the eSTAR tracker journey).
 *
 * The Portfolio workspace shows the org's tracked eSTAR device filings from
 * GET /api/510k/estar/submissions (estar_submissions — a separate spine from
 * the eCTD core; eSTAR is not eCTD and never renders as a sequence), with the
 * section header carrying ONE org-wide device-assembly verdict from
 * POST /api/510k/estar/assemble (artifactKind + blocker count).
 *
 * These tests pin the honest states, mirroring submissionCenterNoFixtures:
 *   • REAL filings render from the mocked API — title, catalog key, status
 *     from the response (never a constant), FDA tracking number, review clock;
 *   • the assembly-readiness header line derives from the REAL assemble
 *     verdict (one POST, not per-row);
 *   • empty → honest "No device filings tracked yet";
 *   • error → honest error EmptyState, never rows;
 *   • no fabricated statuses: an unknown status renders as its raw value, and
 *     a decision renders only when the API carried one;
 *   • the deep link navigates to the 510(k) surface (surface id 'device-510k').
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() });

const ESTAR_SUBS_URL = '/api/510k/estar/submissions';
const ASSEMBLE_URL = '/api/510k/estar/assemble';

/* REAL, org-scoped payloads — deliberately distinctive values so anything
   rendered proves the response was adopted, not a codebase constant. */
const FILINGS = [
  {
    id: 'f1f1f1f1-0000-0000-0000-000000000001',
    catalogKey: 'k510_traditional',
    programType: '510k',
    variant: 'device',
    title: 'ZX-9 Glucose Sensor 510(k)',
    status: 'under_review',
    decision: null,
    fdaTrackingNumber: 'K261234',
    filedAt: '2026-07-01T00:00:00.000Z',
    decisionDueAt: '2026-10-29T00:00:00.000Z',
    projectId: 42,
  },
  {
    id: 'f1f1f1f1-0000-0000-0000-000000000002',
    catalogKey: 'de_novo_request',
    programType: 'de_novo',
    variant: 'ivd',
    title: null,
    status: 'draft',
    decision: null,
    fdaTrackingNumber: null,
    filedAt: null,
    decisionDueAt: null,
    projectId: null,
  },
];

const ASSEMBLY = {
  artifactKind: 'content-package-draft',
  blockers: ['official FDA template not vendored', 'field map not populated'],
};

function mockApi(overrides: {
  filings?: () => Promise<Partial<Response>> | Partial<Response>;
  assemble?: () => Promise<Partial<Response>> | Partial<Response>;
} = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') {
      return { ok: true, status: 200, json: async () => [] } as Response;
    }
    if (method === 'GET' && url === ESTAR_SUBS_URL) {
      if (overrides.filings) return (await overrides.filings()) as Response;
      return { ok: true, status: 200, json: async () => ({ submissions: FILINGS }) } as Response;
    }
    if (method === 'POST' && url === ASSEMBLE_URL) {
      if (overrides.assemble) return (await overrides.assemble()) as Response;
      return { ok: true, status: 200, json: async () => ASSEMBLY } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('SubmissionCenter — device filings render from the real API', () => {
  beforeEach(() => mockApi());

  it('renders the tracked filings with status, tracking number and review clock', async () => {
    render(<SubmissionCenter {...props()} />);

    await waitFor(() =>
      expect(document.body.textContent).toContain('ZX-9 Glucose Sensor 510(k)'),
    );
    const body = document.body.textContent ?? '';
    // Status label mapped from the response's enum value — not invented.
    expect(body).toContain('Under review');
    expect(body).toContain('K261234');
    // Review clock derives from the response's decisionDueAt.
    expect(body).toContain(
      `Decision due ${new Date(FILINGS[0].decisionDueAt as string).toLocaleDateString()}`,
    );
    // PM-spine attachment shown when present.
    expect(body).toContain('programme not resolved');
    // The untitled filing falls back to its catalog key, unfiled clock is honest.
    expect(body).toContain('de_novo_request');
    expect(body).toContain('Not filed yet');
    // Exactly one assemble call — the verdict is per-section, not per-row.
    const assembleCalls = apiRequest.mock.calls.filter(
      (c) => c[0] === 'POST' && c[1] === ASSEMBLE_URL,
    );
    expect(assembleCalls).toHaveLength(1);
  });

  it('derives the assembly-readiness header line from the REAL assemble verdict', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        '510(k) device assembly readiness: draft content package only — not submittable · 2 blockers',
      ),
    );
  });

  it('deep-links each filing row to the 510(k) surface via the surface router', async () => {
    const p = props();
    render(<SubmissionCenter {...p} />);
    const link = (await screen.findAllByTitle(
      'Open the 510(k) surface — the device filing workspace',
    ))[0];
    fireEvent.click(link);
    expect(p.onNav).toHaveBeenCalledWith('device-510k');
  });

  it('never fabricates a status: an unknown enum value renders raw, a decision only when present', async () => {
    mockApi({
      filings: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          submissions: [
            { ...FILINGS[0], status: 'somenewstatus', decision: 'SESE — substantially equivalent' },
          ],
        }),
      }),
    });
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('somenewstatus'));
    expect(document.body.textContent).toContain('SESE — substantially equivalent');
    // None of the known labels leaked in for a status the server never sent.
    for (const label of ['Under review', 'Withdrawn', 'Additional info']) {
      expect(document.body.textContent).not.toContain(label);
    }
  });
});

describe('SubmissionCenter — device filings honest empty state', () => {
  beforeEach(() =>
    mockApi({
      filings: () => ({ ok: true, status: 200, json: async () => ({ submissions: [] }) }),
    }),
  );

  it('shows the honest empty state — no rows, no fixture', async () => {
    render(<SubmissionCenter {...props()} />);
    expect(await screen.findByText('No device filings tracked yet')).toBeTruthy();
    expect(document.body.textContent).not.toContain('K261234');
  });
});

describe('SubmissionCenter — device filings honest error state', () => {
  beforeEach(() =>
    mockApi({
      filings: () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: 'upstream unavailable' }),
      }),
      assemble: () => ({ ok: false, status: 502, json: async () => ({ error: 'nope' }) }),
    }),
  );

  it('shows the error EmptyState and an unavailable readiness line — never fabricated rows', async () => {
    render(<SubmissionCenter {...props()} />);
    expect(await screen.findByText("Couldn't load the device filings")).toBeTruthy();
    await waitFor(() =>
      expect(document.body.textContent).toContain('510(k) device assembly readiness unavailable right now'),
    );
    expect(document.body.textContent).not.toContain('Assembly readiness:');
    expect(document.body.textContent).not.toContain('ZX-9 Glucose Sensor');
  });
});
