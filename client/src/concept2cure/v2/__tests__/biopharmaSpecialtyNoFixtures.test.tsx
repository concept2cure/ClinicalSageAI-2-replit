// @vitest-environment jsdom
/**
 * BiopharmaSpecialty (Pediatric / Orphan / Lifecycle / Pharmacovigilance) —
 * fixture-free contract (GA real-data standard). Mirrors
 * submissionCenterNoFixtures.
 *
 * These four surfaces carried the kit's `live ?? fixture` seeds through the
 * retired useLiveList/useLive helpers: invented BX-* programs, sNDA numbers,
 * orphan designations ('BX-256 / RPE65'), PDUFA dates, a '$100M+' voucher sale,
 * and an invented pneumonitis safety signal — all rendered as the tenant's own
 * portfolio whenever the backend was unreachable or empty. That is retired.
 *
 * These tests pin the honest states each list may now render — REAL org-scoped
 * rows from the real read routes, an honest EMPTY state, or an honest ERROR
 * state — and prove no retired fixture content, no provenance pill, and no
 * fixture/SampleTag/useLiveList symbol survives in the surface source.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Pediatric, Orphan, Lifecycle, Pharmacovigilance } from '../surfaces/BiopharmaSpecialty';

const props = () => ({ onAsk: vi.fn() }) as any;

/* Retired kit sample-content strings that must NEVER appear once the fixtures
   are gone. Every one lived only in the deleted PED_/ORPH_/LCM_/PV_ constants —
   none is reference config. */
const RETIRED = [
  'BX-256',
  'RPE65',
  'BX-204',
  'BX-301',
  'BX-420',
  'BX-115',
  'BX-099',
  'sNDA-211990-001',
  '$100M+',
  'Immune-mediated pneumonitis',
  'AltexaTab',
  'Sample data',
];

function expectNoFixtureArtifacts() {
  expect(document.querySelector('.c2c-sample-tag')).toBeNull();
  expect(document.querySelector('.sp-sample')).toBeNull();
  for (const s of RETIRED) {
    expect(document.body.textContent, `retired fixture content "${s}" leaked back in`).not.toContain(s);
  }
}

/* REAL org-scoped payloads — deliberately NOT the kit fixtures, so anything
   rendered proves the response was adopted rather than a codebase constant.
   The biopharma read routes return the canonical { data, meta } envelope; the
   PV board returns { success, data: { signals, aggregateReports } }. */
const ROWS: Record<string, unknown[]> = {
  '/api/biopharma/pediatric': [
    { id: 1, product: 'ZX-9', kind: 'FDA iPSP', ageRange: '6--17', deferrals: 1, waivers: 0, milestones: 3, due: '2027-01-01', status: 'review' },
  ],
  '/api/biopharma/prea-milestones': [
    { product: 'ZX-9', ms: 'Adolescent PK substudy', due: 'Jan 2027' },
  ],
  '/api/biopharma/orphan': [
    { id: 1, product: 'ZX-9', agency: 'FDA', indication: 'Rare inherited myopathy', date: '2026-02-01', prevalence: '<20k US', benefit: '7-yr exclusivity', status: 'designated' },
  ],
  '/api/biopharma/orphan-rpd': [],
  '/api/biopharma/orphan-advocacy': [],
  '/api/biopharma/supplements': [
    { id: 'sNDA-000001-9', agency: 'FDA', product: 'ZX-9', subject: 'Manufacturing site addition', filed: '2026-03-01', due: 'CBE-30', status: 'review' },
  ],
  '/api/lifecycle/renewals': [],
  '/api/cmc-changes': [],
};

const PV_BOARD = {
  success: true,
  data: {
    signals: [
      { product: 'ZX-9', term: 'Hepatic enzyme elevation', count: 4, prr: 1.4, owner: null, age: null, status: 'monitoring' },
    ],
    aggregateReports: [
      { product: null, cycle: 'PSUR 2026-01-01–2026-06-30', due: 'EMA · 2026-08-29', by: null, reviewers: null, status: 'drafting' },
    ],
  },
};

function mockRealRows() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/pharmacovigilance/board') {
      return { ok: true, status: 200, json: async () => PV_BOARD } as Response;
    }
    if (method === 'GET' && url in ROWS) {
      return { ok: true, status: 200, json: async () => ({ data: ROWS[url], meta: { count: ROWS[url].length } }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [], meta: { count: 0 } }) } as Response;
  });
}

function mockAllEmpty() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/pharmacovigilance/board') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { signals: [], aggregateReports: [] } }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [], meta: { count: 0 } }) } as Response;
  });
}

function mockAllFailed() {
  apiRequest.mockImplementation(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: 'AUTH_REQUIRED' } }),
  }) as Response);
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('BiopharmaSpecialty — real rows render (no fixture)', () => {
  beforeEach(mockRealRows);

  it('Pediatric renders the REAL plan and milestone rows', async () => {
    render(<Pediatric {...props()} />);
    expect(await screen.findByText('FDA iPSP · ages 6--17')).toBeTruthy();
    expect(screen.getByText('Adolescent PK substudy')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Orphan renders the REAL designation row', async () => {
    render(<Orphan {...props()} />);
    expect(await screen.findByText('Rare inherited myopathy')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Lifecycle renders the REAL supplement row', async () => {
    render(<Lifecycle {...props()} />);
    expect(await screen.findByText('ZX-9 · Manufacturing site addition')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Pharmacovigilance renders the REAL board signals and aggregate reports', async () => {
    render(<Pharmacovigilance {...props()} />);
    expect(await screen.findByText('Hepatic enzyme elevation')).toBeTruthy();
    expect(screen.getByText('PSUR 2026-01-01–2026-06-30')).toBeTruthy();
    expectNoFixtureArtifacts();
  });
});

describe('BiopharmaSpecialty — honest empty states', () => {
  beforeEach(mockAllEmpty);

  it('Pediatric shows EmptyStates — never a fixture — when the org has nothing', async () => {
    render(<Pediatric {...props()} />);
    expect(await screen.findByText('No pediatric plans yet')).toBeTruthy();
    expect(screen.getByText('No PREA milestones recorded')).toBeTruthy();
    expect(screen.getByText('No pediatric plans are on file for this organization yet.')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Orphan shows EmptyStates — never a fixture', async () => {
    render(<Orphan {...props()} />);
    expect(await screen.findByText('No designations yet')).toBeTruthy();
    expect(screen.getByText('No vouchers or grants recorded')).toBeTruthy();
    expect(screen.getByText('No advocacy engagements recorded')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Lifecycle shows EmptyStates — never a fixture', async () => {
    render(<Lifecycle {...props()} />);
    expect(await screen.findByText('No supplements or variations yet')).toBeTruthy();
    expect(screen.getByText('No renewal cycles recorded')).toBeTruthy();
    expect(screen.getByText('No post-approval records are on file for this organization yet.')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Pharmacovigilance shows EmptyStates — never a fixture', async () => {
    render(<Pharmacovigilance {...props()} />);
    expect(await screen.findByText('No active signals')).toBeTruthy();
    expect(screen.getByText('No aggregate reports in cycle')).toBeTruthy();
    expect(screen.getByText('No safety-surveillance data is on file for this organization yet.')).toBeTruthy();
    expectNoFixtureArtifacts();
  });
});

describe('BiopharmaSpecialty — honest error states', () => {
  beforeEach(mockAllFailed);

  it('Pediatric shows an error EmptyState — never a fixture — when the read fails', async () => {
    render(<Pediatric {...props()} />);
    expect(await screen.findByText("Couldn't load pediatric plans")).toBeTruthy();
    expect(document.querySelector('.c2c-error-state')).toBeTruthy();
    expectNoFixtureArtifacts();
  });

  it('Pharmacovigilance shows an error EmptyState — never a fixture — when the board fails', async () => {
    render(<Pharmacovigilance {...props()} />);
    expect(await screen.findByText("Couldn't load safety signals")).toBeTruthy();
    expect(document.querySelector('.c2c-error-state')).toBeTruthy();
    expectNoFixtureArtifacts();
  });
});

/**
 * The tables were always honest about a failed read. The AnswerLead ABOVE each
 * table was not: it derived its headline from `rows.length`, and `rows` is
 * equally empty in flight, on failure, and on a genuine empty. So on a failed
 * load the most prominent sentence on the surface stated a fact about the
 * organization's regulatory record that nobody had established — while the
 * table 40px below it said the read had failed.
 *
 * These assert the LEAD, which is why they read the `.al-h` headline directly
 * rather than any-text-on-the-page: the error EmptyState tested above would
 * satisfy a looser query and the regression would pass unnoticed.
 */
describe('BiopharmaSpecialty — a failed read is never narrated as an empty one', () => {
  beforeEach(mockAllFailed);

  const headline = () => document.querySelector('.al-h')?.textContent ?? '';

  /**
   * Wait for the lead to LEAVE the loading state.
   *
   * `waitFor(() => expect(headline()).not.toBe(''))` was not that, and the
   * difference is a real flake rather than a nicety. UnresolvedLead renders a
   * headline in BOTH unresolved states — "Reading the {subject}…" while in
   * flight, "The {subject} could not be read." once it fails — so a
   * non-empty-headline predicate is satisfied on the FIRST render, while the
   * reads are still pending, and the assertion then runs against the loading
   * sentence.
   *
   * It passed locally and failed in CI on `Lifecycle does not claim "no
   * post-approval records"`, reporting exactly that:
   *
   *   expected 'Reading the post-approval records on …' to contain 'could not be read'
   *
   * Lifecycle lost the race first because its lead waits on THREE reads
   * (supplements, CMC changes, renewals) and may only speak once all three
   * have answered, so its loading window is the widest. Orphan carried the
   * same weak predicate and had simply not lost yet.
   *
   * Waiting on "not loading" rather than on the asserted text keeps the
   * assertions below non-vacuous: this settles the state, they check what it
   * says.
   */
  const settled = () =>
    waitFor(() => {
      const h = headline();
      expect(h).not.toBe('');
      expect(h, 'lead is still loading — the read has not answered yet').not.toContain('Reading the');
    });

  it('Pediatric does not claim "no plans on file" when the plan read failed', async () => {
    render(<Pediatric {...props()} />);
    await screen.findByText("Couldn't load pediatric plans");
    expect(headline()).toContain('could not be read');
    expect(headline()).not.toContain('No pediatric plans are on file');
  });

  it('Orphan does not claim "no designations on file" when the read failed', async () => {
    render(<Orphan {...props()} />);
    await settled();
    expect(headline()).toContain('could not be read');
    expect(headline()).not.toContain('No orphan or rare-disease designations are on file');
  });

  it('Lifecycle does not claim "no post-approval records" when the reads failed', async () => {
    render(<Lifecycle {...props()} />);
    await settled();
    expect(headline()).toContain('could not be read');
    expect(headline()).not.toContain('No post-approval records are on file');
  });

  it('Pharmacovigilance does not report safety standing off an unread board', async () => {
    render(<Pharmacovigilance {...props()} />);
    await screen.findByText("Couldn't load safety signals");
    // The sharpest case: "no disproportionality screen has been run" is a claim
    // about patient safety, and it was being derived from a network failure.
    expect(document.body.textContent).not.toContain('no disproportionality screen has been run');
    expect(headline()).toContain('could not be read');
  });

  it('offers no next step and no reassurance over a record it could not read', async () => {
    render(<Pharmacovigilance {...props()} />);
    await screen.findByText("Couldn't load safety signals");
    const lead = document.querySelector('.al-lead');
    expect(lead).toBeTruthy();
    // Reassurance is the one thing an absent answer can never justify, and an
    // action invites work on a premise that may not hold.
    expect(lead!.querySelector('.al-re')).toBeNull();
    expect(lead!.querySelector('.al-btn')).toBeNull();
  });
});

describe('BiopharmaSpecialty — no fixture/SampleTag symbol remains in source', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx'),
    'utf8',
  );

  it('defines no retired sample-content fixture constant', () => {
    for (const sym of [
      'PED_PLANS',
      'PED_PREA',
      'ORPH_DES',
      'ORPH_RPD',
      'ORPH_ADV',
      'LCM_SUPP',
      'LCM_REN',
      'PV_SIG',
      'PV_AGG',
    ]) {
      expect(src, `${sym} must not appear in the surface`).not.toMatch(new RegExp(`\\b${sym}\\b`));
    }
  });

  it('no longer uses the retired live-or-fixture helpers or SampleTag', () => {
    expect(src).not.toMatch(/\buseLiveList\b/);
    expect(src).not.toMatch(/\buseLive\b\(/);
    expect(src).not.toContain('<SampleTag');
    expect(src).not.toMatch(/import\s*{[^}]*\bSampleTag\b[^}]*}\s*from/);
  });

  it('stays on the honest data path (useLiveRows/useLiveData + EmptyState)', () => {
    expect(src).toContain('useLiveRows');
    expect(src).toContain('useLiveData');
    expect(src).toContain('EmptyState');
  });
});
