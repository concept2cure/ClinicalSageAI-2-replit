// @vitest-environment jsdom
/**
 * The older ivd-completeness screen keeps working until it folds into
 * device-diagnostics, and it draws the one board, not a copy (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/).
 *
 * The family board moved from v2/surfaces/IvdCompleteness.tsx to
 * v2/surfaces/IvdReadinessBoard.tsx, which IvdSurface draws as its readiness
 * panel. This screen mounts the same component. It read the organization's
 * records whichever project was open; it now reads the open project, and the
 * organization only when none is open, and says which.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { IvdCompleteness } from '../surfaces/IvdCompleteness';
import { clearShellProject, publishShellProject } from '../shellProject';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROGRAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const families = [
  { id: 'gspr', label: 'General Safety & Performance Requirements', ref: 'IVDR Annex I', blurb: 'b', pct: 100,
    items: [{ code: 'Annex I', title: 'GSPR conformity (Annex I)', ref: 'IVDR Annex I', status: 'complete', pct: 100 }] },
  ...['anal', 'clin', 'valid', 'per', 'desc', 'pmpf'].map((id) => ({ id, label: `Family ${id}`, ref: 'r', blurb: 'b', pct: 0, items: [] })),
];
const data = (scope: Record<string, unknown>) => ({
  ...scope, program: 'Assay', spine: 'EU IVDR 2017/746', standard: 'IVDR', overall: 14,
  summary: { total: 7, evidenced: 1, inProgress: 0, notStarted: 6, unread: 0, flags: 0 },
  families, unread: [], gsprSourced: true, perDocumentPresent: false,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === `/api/ivd-completeness/completeness?program_id=${PROGRAM}`) return json({ success: true, data: data({ scope: 'program', programId: PROGRAM }) });
    if (url === '/api/ivd-completeness/completeness') return json({ success: true, data: data({ scope: 'organization' }) });
    if (url.startsWith('/api/ivd-assessments')) return json({ rows: [], count: 0 });
    return json({ data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearShellProject();
  cleanup();
});
const completenessReads = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/ivd-completeness/'));
const mount = () => render(<IvdCompleteness surface={{ id: 'ivd-completeness' } as never} onAsk={() => {}} onNav={() => {}} segment="diagnostics" />);

describe('the ivd-completeness screen reads what is open', () => {
  it('with a project open, it reads and draws that project\'s board', async () => {
    publishShellProject({ id: PROGRAM, title: 'Assay' });
    mount();
    await waitFor(() => expect(completenessReads().length).toBeGreaterThan(0));
    expect(completenessReads()).toEqual([`/api/ivd-completeness/completeness?program_id=${PROGRAM}`]);
    const shown = await screen.findByTestId('ivd-readiness-board');
    expect(shown.textContent).toContain('This project\'s IVDR evidence coverage: 14%');
  });

  it('with no project open, it reads the organization and says so', async () => {
    clearShellProject();
    mount();
    await waitFor(() => expect(completenessReads().length).toBeGreaterThan(0));
    expect(completenessReads()).toEqual(['/api/ivd-completeness/completeness']);
    const shown = await screen.findByTestId('ivd-readiness-board');
    expect(shown.textContent).toContain('Organization-wide IVDR evidence coverage: 14%');
  });
});

describe('one board, two mounts', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
  it('the family board is drawn by IvdReadinessBoard only, and both screens mount it', () => {
    const board = src('v2/surfaces/IvdReadinessBoard.tsx');
    const old = src('v2/surfaces/IvdCompleteness.tsx');
    const surface = src('mdx/surfaces/IvdSurface.tsx');
    expect(board).toContain('className="ivd-families"');
    for (const screenSrc of [old, surface]) {
      expect(screenSrc).toMatch(/\bIvdReadinessBoard\b[^;]*from '(\.\/|\.\.\/\.\.\/v2\/surfaces\/)IvdReadinessBoard'/);
      expect(screenSrc).toContain('<IvdReadinessBoard ');
      for (const markup of ['ivd-families', 'ivd-fam-head', 'ivd-stats', 'ivd-item-title']) expect(screenSrc).not.toContain(markup);
    }
  });
});
