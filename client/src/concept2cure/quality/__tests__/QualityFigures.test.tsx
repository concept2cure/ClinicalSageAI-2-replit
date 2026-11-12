// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): Quality's figures as one quiet line of numbers under its header, every number the server's.
 * The four KPI tiles went in a65f886a7 (2026-11-06) and each register kept a sentence of its own; nothing said the
 * quality system's state at a glance. The line reads only server-computed figures: the QMS readiness read
 * (GET /api/mdx/qms/readiness), the review schedule, the change-control summary and the CAPA / complaint / MDR triage
 * queue. A figure with no server source is left out; a read that failed says so and is never shown as zero.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

type Read = { data: unknown; loading: boolean; error: string | null; failure: null; refresh: () => void };
const H = vi.hoisted(() => ({ reads: {} as Record<string, Read>, refreshed: [] as string[] }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string | null) => (url && H.reads[url])
    ?? { data: null, loading: true, error: null, failure: null, refresh: () => H.refreshed.push(String(url)) },
}));

import { QualityFigures, QUALITY_FIGURE_READS } from '../QualityFigures';
import { qualityWritten } from '../qmsWrites';

const ok = (data: unknown, url: string): Read => ({ data, loading: false, error: null, failure: null, refresh: () => H.refreshed.push(url) });
const failed = (url: string): Read => ({ data: null, loading: false, error: 'The server did not answer.', failure: null, refresh: () => H.refreshed.push(url) });

const READINESS = {
  data: {
    documents: { available: true, effective: 9, underRevision: 1, reviewOverdue: 2, draft: 3 },
    suppliers: { available: true, total: 5, criticalUnapproved: 1, auditOverdue: 0 },
    training: { available: true, acknowledged: 40, expired: 3 },
    audits: { available: true, open: 2, openMajorFindings: 1 },
    nonconforming: { available: true, undispositioned: 1 },
  },
  meta: { scope: 'organization' },
};
const REVIEW = { data: [{ id: 1, doc_number: 'SOP-1', overdue: true }, { id: 2, doc_number: 'SOP-2', overdue: true }, { id: 3, doc_number: 'SOP-3', overdue: false }] };
const CHANGES = { data: { total: 6, open: 4, awaitingApproval: 1, inImplementation: 2, awaitingVerification: 0, closed: 2, overdueImplementation: 1, byStatus: {} } };
const TRIAGE = {
  items: [
    { kind: 'capa', overdue: true }, { kind: 'capa', overdue: false }, { kind: 'capa', overdue: false },
    { kind: 'complaint', overdue: false }, { kind: 'complaint', overdue: false },
    { kind: 'mdr', overdue: true },
  ],
  count: 6,
};

function serve(over: Partial<Record<keyof typeof QUALITY_FIGURE_READS, Read>> = {}) {
  const P = QUALITY_FIGURE_READS;
  H.reads = {
    [P.readiness]: ok(READINESS, P.readiness),
    [P.review]: ok(REVIEW, P.review),
    [P.changes]: ok(CHANGES, P.changes),
    [P.triage]: ok(TRIAGE, P.triage),
  };
  for (const [k, v] of Object.entries(over)) H.reads[P[k as keyof typeof P]] = v as Read;
}
afterEach(() => { cleanup(); H.reads = {}; H.refreshed = []; });

describe("Quality's figures", () => {
  it('reads only the server routes that compute them', () => {
    expect(QUALITY_FIGURE_READS).toEqual({
      readiness: '/api/mdx/qms/readiness',
      review: '/api/mdx/qms/documents/review-due?within=120',
      changes: '/api/mdx/qms/changes/summary',
      triage: '/api/capa-mdr/triage?open_only=true&limit=500',
    });
  });

  it('says the quality system as one line of the server\'s numbers, not tiles', () => {
    serve();
    const { container } = render(<QualityFigures organisationWide={false} />);
    const line = screen.getByTestId('quality-figures');
    expect(line.tagName).toBe('P');
    expect(line.textContent).toBe(
      '9 documents in force · 3 due for review within 120 days (2 overdue) · 4 open changes (1 past its implementation date) · '
      + '3 open CAPAs (1 past target close) · 1 nonconformance awaiting disposition · 2 open complaints · 1 MDR report overdue · '
      + '1 critical supplier not approved · 2 open internal audits (1 major finding) · 3 lapsed acknowledgements',
    );
    expect(container.querySelector('.metric-card, .kpi, .tile, .stat')).toBeNull();
    // Meaning, not decoration: only an overdue or unapproved figure takes a tone.
    const toned = [...line.querySelectorAll('[data-tone]')].map((n) => `${n.getAttribute('data-tone')}:${n.textContent}`);
    expect(toned).toEqual(['err:2 overdue', 'warn:1 past its implementation date', 'err:1 past target close', 'warn:1 nonconformance awaiting disposition',
      'err:1 MDR report overdue', 'err:1 critical supplier not approved', 'warn:1 major finding', 'warn:3 lapsed acknowledgements']);
  });

  it('leaves out a figure whose server read failed, and says which, with a retry; never a zero in its place', () => {
    serve({ triage: failed(QUALITY_FIGURE_READS.triage), changes: failed(QUALITY_FIGURE_READS.changes) });
    render(<QualityFigures organisationWide={false} />);
    const line = screen.getByTestId('quality-figures');
    expect(line.textContent).not.toMatch(/CAPA|complaint|MDR|change/);
    expect(screen.getByTestId('quality-figures-unread').textContent).toBe('Not read: change control; CAPA, complaints and MDR reports.');
    fireEvent.click(screen.getByRole('button', { name: 'Read the figures again' }));
    expect(H.refreshed.sort()).toEqual([QUALITY_FIGURE_READS.changes, QUALITY_FIGURE_READS.triage].sort());
  });

  /* Walked 2026-11-11 (w39): after a complaint was recorded the line still said "0 open complaints" beside a register
     saying "Open: 1", until the page was reloaded. The line is the server's numbers, so a confirmed write re-reads them. */
  it("re-reads the server's figures when a Quality write is confirmed", () => {
    serve();
    render(<QualityFigures organisationWide={false} />);
    expect(H.refreshed).toEqual([]);
    act(() => qualityWritten());
    expect(H.refreshed.sort()).toEqual(Object.values(QUALITY_FIGURE_READS).sort());
  });

  it('leaves out a readiness block the server could not read', () => {
    const partial = { data: { ...READINESS.data, suppliers: { available: false, total: 0, criticalUnapproved: 0, auditOverdue: 0 } } };
    serve({ readiness: ok(partial, QUALITY_FIGURE_READS.readiness) });
    render(<QualityFigures organisationWide={false} />);
    expect(screen.getByTestId('quality-figures').textContent).not.toMatch(/supplier/);
    expect(screen.getByTestId('quality-figures-unread').textContent).toBe('Not read: suppliers.');
  });

  it('says it is reading while nothing has answered, and states no number', () => {
    render(<QualityFigures organisationWide={false} />);
    expect(screen.getByTestId('quality-figures').textContent).toBe('Reading the quality figures…');
  });

  it('says a capped queue is a floor, not a count', () => {
    serve({ triage: ok({ items: Array.from({ length: 500 }, () => ({ kind: 'capa', overdue: false })), count: 500 }, QUALITY_FIGURE_READS.triage) });
    render(<QualityFigures organisationWide={false} />);
    expect(screen.getByTestId('quality-figures').textContent).toContain('500+ open CAPAs');
    expect(screen.getByTestId('quality-figures').textContent).not.toMatch(/open complaints|MDR report/);
  });

  it('says the figures are the organisation\'s while the registers are narrowed to a project', () => {
    serve();
    render(<QualityFigures organisationWide />);
    expect(screen.getByTestId('quality-figures').textContent).toMatch(/^Organisation-wide · 9 documents in force/);
  });
});
