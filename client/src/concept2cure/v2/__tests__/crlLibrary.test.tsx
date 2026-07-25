// @vitest-environment jsdom
/**
 * FDA CRL library — the honesty rules, pinned.
 *
 * This surface displays regulatory findings that a user may cite in a
 * submission. The tests below are therefore not cosmetic: each one pins a
 * work-order requirement whose violation would put a fabricated or mislabelled
 * regulatory claim in front of a regulatory affairs professional.
 *
 *   §8.1  counts carry denominators; constraints apply before ranking
 *   §7.2  explicit and inferred mappings are visually distinguishable
 *   §6.2  non-study-level findings are NOT attributed to a clinical study
 *   §13.2 verification state is visible per finding
 *   §6.1  an unresolved extraction conflict is surfaced, not hidden
 *         four honest states — loading, error, empty corpus, results
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { CrlLibrary } from '../surfaces/CrlLibrary';
import type {
  FindingSearchView,
  RegulatoryFindingView,
} from '../fixtures/clinical-regulatory-evidence';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}

const props = () => ({
  surface: { id: 'crl-library', label: 'FDA CRL library' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/* Test data below is TEST data — it exists only in this file and is never
   importable by a surface. The production view-model module deliberately ships
   no fixture at all. */

const STUDY_FINDING: RegulatoryFindingView = {
  findingId: 'f-1',
  severity: 'critical',
  discipline: 'clinical',
  category: 'endpoint validity',
  finding: 'Primary endpoint does not establish clinically meaningful benefit.',
  requestedAction: 'Provide anchor-based validation',
  applicability: 'study',
  epistemicStatus: 'explicit',
  verification: 'source_verified',
  reviewedAt: '2026-05-14',
  conflict: false,
  mappings: [
    { kind: 'ctd', value: '2.7.3', status: 'explicit' },
    { kind: 'ich_e3', value: '§11', status: 'inferred' },
  ],
  source: {
    sourceId: 's-1',
    applicationType: 'NDA',
    applicationNumber: '000000',
    letterDate: '2023-04-11',
    page: 3,
    locator: '¶2',
    excerpt: 'The Agency does not agree that the observed change supports a meaningful effect.',
    officialUrl: 'https://example.invalid/letter',
    checksum: 'sha256:test',
    version: 2,
  },
};

const FACILITY_FINDING: RegulatoryFindingView = {
  ...STUDY_FINDING,
  findingId: 'f-2',
  severity: 'high',
  discipline: 'facility',
  category: 'inspection',
  finding: 'Pre-approval inspection classification outstanding at the drug product site.',
  applicability: 'facility',
  verification: 'extracted_unreviewed',
  reviewedAt: null,
  conflict: true,
  mappings: [],
  source: { ...STUDY_FINDING.source, sourceId: 's-2', excerpt: null, page: null, locator: null },
};

const RESULT: FindingSearchView = {
  findings: [STUDY_FINDING, FACILITY_FINDING],
  coverage: {
    scanned: 412,
    eligible: 96,
    structured: 31,
    verified: 18,
    cited: 11,
    exclusionNote: null,
    freshness: '2026-07-19',
  },
};

const EMPTY_CORPUS: FindingSearchView = {
  findings: [],
  coverage: {
    scanned: 0,
    eligible: 0,
    structured: 0,
    verified: 0,
    cited: 0,
    exclusionNote: 'No regulatory evidence has been ingested into this corpus yet.',
    freshness: null,
  },
  insufficientEvidence: {
    reason: 'No regulatory evidence has been ingested into this corpus yet.',
    usable: 0,
    total: 0,
  },
};

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok(RESULT));
});

describe('CrlLibrary — results', () => {
  it('reads the shared evidence graph, not a CRL-specific endpoint', async () => {
    render(<CrlLibrary {...props()} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const url = String(apiRequest.mock.calls[0][1]);
    expect(url.startsWith('/api/clinical-regulatory-evidence/findings')).toBe(true);
  });

  it('shows every coverage count with its denominator, never a bare percentage', async () => {
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText(/96 of 412 eligible on these filters/)).toBeTruthy();
    expect(screen.getByText(/31 of 96 with structured findings/)).toBeTruthy();
    // "18 of 31 verified" appears in both the coverage row and the list header —
    // deliberately, so the denominator travels with the count in both places.
    expect(screen.getAllByText(/18 of 31 verified/).length).toBeGreaterThanOrEqual(1);
    // No standalone percentage anywhere in the coverage row.
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
  });

  it('makes the verification state of each finding visible', async () => {
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText('Source verified')).toBeTruthy();
    expect(screen.getByText('Extracted · not human reviewed')).toBeTruthy();
  });

  it('does not attribute a facility-level finding to a clinical study', async () => {
    render(<CrlLibrary {...props()} />);
    expect(
      await screen.findByText(/Facility-level — not attributed to any clinical study/),
    ).toBeTruthy();
  });

  it('surfaces an unresolved extraction conflict rather than hiding it', async () => {
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText('Extraction conflict')).toBeTruthy();
  });

  it('distinguishes a source-explicit mapping from an inferred one', async () => {
    render(<CrlLibrary {...props()} />);
    const explicit = await screen.findByText(/CTD 2\.7\.3 · source-explicit/);
    const inferred = screen.getByText(/ICH E3 §11 · inferred/);
    // Not merely different text — the inferred chip carries the styling hook
    // that renders it italic and dimmed, so the two cannot be confused.
    expect(inferred.className).toContain('crl-inferred');
    expect(explicit.className).not.toContain('crl-inferred');
  });

  it('renders the verbatim excerpt, and says so when there is none', async () => {
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText(/The Agency does not agree/)).toBeTruthy();

    fireEvent.click(screen.getByText(FACILITY_FINDING.finding));
    expect(await screen.findByText(/No verbatim excerpt could be extracted/)).toBeTruthy();
  });

  it('applies the §8.1 constraints to the query and commits them on Search', async () => {
    render(<CrlLibrary {...props()} />);
    await screen.findByText(/96 of 412 eligible/);
    const before = apiRequest.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText('e.g. clinically meaningful endpoint'), {
      target: { value: 'endpoint' },
    });
    // Editing alone must not refetch — the query is committed on Search.
    expect(apiRequest.mock.calls.length).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await waitFor(() => expect(apiRequest.mock.calls.length).toBeGreaterThan(before));
    expect(String(apiRequest.mock.calls[apiRequest.mock.calls.length - 1]![1])).toContain('text=endpoint');
  });
});

describe('CrlLibrary — the honest states', () => {
  it('reports an empty corpus as empty, never as a fabricated result set', async () => {
    apiRequest.mockImplementation(async () => ok(EMPTY_CORPUS));
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText('No regulatory evidence has been ingested yet')).toBeTruthy();
    // The reason appears both as the coverage exclusion note and as the empty
    // state's hint — the zero is explained wherever a reader meets it.
    expect(
      screen.getAllByText(/No regulatory evidence has been ingested into this corpus yet/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('distinguishes "no match on these filters" from "nothing ingested"', async () => {
    apiRequest.mockImplementation(async () =>
      ok({ findings: [], coverage: { ...RESULT.coverage } } satisfies FindingSearchView),
    );
    render(<CrlLibrary {...props()} />);
    expect(await screen.findByText('No findings match these constraints')).toBeTruthy();
  });

  it('shows an honest error and no cached sample when the service fails', async () => {
    apiRequest.mockImplementation(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as Response);
    render(<CrlLibrary {...props()} />);
    expect(
      await screen.findByText("Couldn't reach the regulatory evidence graph"),
    ).toBeTruthy();
    expect(screen.queryByText(STUDY_FINDING.finding)).toBeNull();
  });
});
