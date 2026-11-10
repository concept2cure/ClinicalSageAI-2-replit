// @vitest-environment jsdom
/**
 * Sequence QC in Submission Center's eCTD view (P-122, 2026-11-10).
 *
 * GET /api/ind-lifecycle/sequence/:id/diff and /manifest were built and never called (CLAUDE.md Rule 3 names them).
 * The eCTD view now shows, for the project's sequence, what changed against the sequence before it in the same
 * submission and every leaf by CTD module with its checksum, each with its PDF. A first sequence says there is
 * nothing earlier, and a failed read says so: neither is shown as "no changes". The server's tests are
 * sequence-qc-launch-claim.test.ts and tests/db/p122-sequence-qc.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdSequenceQc } from '../surfaces/EctdSequenceQc';
import { EctdCompile } from '../surfaces/EctdCompile';
import { ok, props, SPINE_STATUS } from './ectdCompile.fixtures';

const PID = '7c4e2a90-3333-4444-8555-666677778888';
const DIFF = {
  priorSequenceNumber: '0000', currentSequenceNumber: '0001',
  entries: [
    { sectionCode: 'm1.2', title: 'Cover letter', change: 'deleted', priorChecksum: 'a'.repeat(64), currentChecksum: null },
    { sectionCode: 'm2.5', title: 'Clinical overview', change: 'replaced', priorChecksum: 'b'.repeat(64), currentChecksum: 'c'.repeat(64) },
    { sectionCode: 'm3.2.p', title: 'Drug product', change: 'added', priorChecksum: null, currentChecksum: 'd'.repeat(64) },
    { sectionCode: 'm5.3.1', title: 'Study report', change: 'unchanged', priorChecksum: 'e'.repeat(64), currentChecksum: 'e'.repeat(64) },
  ],
  summary: { added: 1, replaced: 1, unchanged: 1, deleted: 1, total: 4 },
};
const MANIFEST = {
  sequenceNumber: '0001', applicationNumber: null, submissionType: 'amendment', totalLeaves: 3, missingChecksums: 0,
  modules: [
    { module: 'M2', label: 'Module 2 — CTD Summaries', leaves: [{ sectionCode: 'm2.5', title: 'Clinical overview', lifecycleOp: 'replace', checksum: 'c'.repeat(64) }] },
    { module: 'M3', label: 'Module 3 — Quality / CMC', leaves: [{ sectionCode: 'm3.2.p', title: 'Drug product', lifecycleOp: 'new', checksum: 'd'.repeat(64) }] },
  ],
};

function serve(over: { sequences?: unknown; diff?: () => Response } = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/submissions?programId=${PID}`) return ok([{ id: 41, title: 'C2C-101 IND' }]);
    if (url === '/api/submissions/41/sequences') return ok(over.sequences ?? [{ id: 1, sequenceNumber: '0000' }, { id: 2, sequenceNumber: '0001' }]);
    if (url === '/api/ind-lifecycle/sequence/2/diff?priorId=1') return over.diff ? over.diff() : ok(DIFF);
    if (url === '/api/ind-lifecycle/sequence/2/manifest' || url === '/api/ind-lifecycle/sequence/1/manifest') return ok(MANIFEST);
    if (url.startsWith('/api/ectd-compile/')) return ok(url.endsWith('/history') ? { compilations: [] } : SPINE_STATUS);
    return ok({});
  });
}

afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });
beforeEach(() => serve());

describe('the eCTD view checks a sequence before dispatch', () => {
  it('shows what changed since the previous sequence of the submission, leaf by leaf', async () => {
    render(<EctdSequenceQc programId={PID} openedSequence={null} />);
    const diff = await screen.findByTestId('ec-qc-diff');
    expect(within(diff).getByRole('heading', { name: 'What changed since sequence 0000' })).toBeTruthy();
    expect(diff.textContent).toContain('1 leaf added, 1 changed or not comparable, 1 only in sequence 0000, 1 unchanged.');
    const rows = within(diff).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['m1.2Cover letterOnly in sequence 0000', 'm2.5Clinical overviewChanged, or no checksum to compare',
      'm3.2.pDrug productAdded']);
    expect(apiRequest.mock.calls.map((c) => c[1])).toContain('/api/ind-lifecycle/sequence/2/diff?priorId=1');
  });

  it('shows the package manifest by CTD module, each leaf with its checksum', async () => {
    render(<EctdSequenceQc programId={PID} openedSequence={null} />);
    const man = await screen.findByTestId('ec-qc-manifest');
    expect(man.textContent).toContain('3 leaves, each with its checksum.');
    expect(within(man).getByRole('table', { name: 'Module 3 — Quality / CMC' }).textContent).toContain('Drug product');
    expect(within(man).getByTitle('d'.repeat(64)).textContent).toBe(`${'d'.repeat(12)}…`);
  });

  it('downloads each as its PDF', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/pdf') || url.includes('/diff/pdf?')) return { ok: true, status: 200, blob: async () => new Blob(['%PDF']) } as unknown as Response;
      if (url === `/api/submissions?programId=${PID}`) return ok([{ id: 41, title: 'C2C-101 IND' }]);
      if (url === '/api/submissions/41/sequences') return ok([{ id: 1, sequenceNumber: '0000' }, { id: 2, sequenceNumber: '0001' }]);
      if (url.includes('/diff?')) return ok(DIFF);
      return ok(MANIFEST);
    });
    render(<EctdSequenceQc programId={PID} openedSequence={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Comparison \(PDF\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Manifest \(PDF\)/ }));
    await waitFor(() => expect(apiRequest.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([
      '/api/ind-lifecycle/sequence/2/diff/pdf?priorId=1', '/api/ind-lifecycle/sequence/2/manifest/pdf',
    ])));
    vi.unstubAllGlobals();
  });

  it('a first sequence says there is nothing earlier, and asks no comparison', async () => {
    serve({ sequences: [{ id: 1, sequenceNumber: '0000' }] });
    render(<EctdSequenceQc programId={PID} openedSequence={null} />);
    expect(await screen.findByText(/Sequence 0000 is the first of this submission/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).includes('/diff'))).toBe(false);
  });

  it('a comparison that cannot be read says so, never "no changes"', async () => {
    serve({ diff: () => ({ ok: false, status: 503, json: async () => ({ error: 'down' }) }) as unknown as Response });
    render(<EctdSequenceQc programId={PID} openedSequence={null} />);
    expect(await screen.findByText('The comparison with sequence 0000 could not be read.')).toBeTruthy();
    expect(screen.queryByTestId('ec-qc-diff')).toBeNull();
  });
});

describe('it is part of the eCTD view', () => {
  it('Compile & export eCTD shows the sequence QC for the open project', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'C2C-101' };
    render(<EctdCompile {...props()} />);
    expect(await screen.findByTestId('ec-sequence-qc')).toBeTruthy();
    expect(await screen.findByTestId('ec-qc-manifest')).toBeTruthy();
  });
});
