// @vitest-environment jsdom
/**
 * The Submission Center's "Program" column names the program a submission
 * belongs to, read by its key — never a product-name string standing in for it.
 *
 * ── The defect (QA 2026-10-08, journey j1) ───────────────────────────────────
 * Projects listed BX-204 as a 510(k) device and BX-301 as a BLA; the
 * Submission Center's Program column read "BX-204 (NDA 212345 · 505(b)(1)) ·
 * BX-204" and "BX-301 (anti-BCMA mAb) · BX-301" beside NDA and IND. Both
 * records are what they say: those two submissions have no program
 * (submissions.program_id is NULL) and only share a product-name string with
 * the programs. The column printed `title · productName` under the heading
 * "Program", so a free-text product name read as a program identity, and the
 * two screens appeared to disagree about one program's filing type.
 *
 * ── What must be true now ────────────────────────────────────────────────────
 *   • a submission with a program names that program's code, from the
 *     program record (programId → /api/c2c/projects);
 *   • a submission with no program says so, and does not borrow a program's
 *     code from its product name;
 *   • the product name, still the submission's own fact, is labelled as one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const BX256 = '099991d1-dac8-43c5-b88a-8baab26194ee';
const BX204 = '11111111-2222-3333-4444-000000000204';

const SUBS = [
  { id: 5, title: 'BX-256 · systemic lupus erythematosus (IND)', productName: 'BX-256', applicationType: 'ind',
    clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: BX256 },
  { id: 3, title: 'BX-204 (NDA 212345 · 505(b)(1))', productName: 'BX-204', applicationType: 'nda',
    clientType: 'pharma', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null },
];
const PROGRAMS = [
  { id: BX256, code: 'BX-256', title: 'BX-256 · systemic lupus erythematosus (IND)' },
  // The program the product-name string coincides with: a 510(k) device.
  { id: BX204, code: 'BX-204', title: 'BX-204 Continuous Glucose Monitor' },
];

const subRow = (title: string) =>
  Array.from(document.querySelectorAll('tr.sc-subrow')).find((r) => r.textContent?.includes(title)) as HTMLElement;
const programCell = (title: string) => subRow(title).querySelector('td') as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return { ok: true, status: 200, json: async () => SUBS } as Response;
    if (method === 'GET' && url === '/api/c2c/projects') return { ok: true, status: 200, json: async () => ({ data: PROGRAMS }) } as Response;
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
});

describe('Submission Center — the Program column reads the program by its key', () => {
  it('names the linked program from the program record', async () => {
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await waitFor(() => expect(programCell('BX-256 · systemic lupus').textContent).toMatch(/Program BX-256/));
  });

  it('says a submission with no program has none, and does not borrow a program code from its product name', async () => {
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await waitFor(() => expect(subRow('BX-204 (NDA 212345')).toBeTruthy());
    await waitFor(() => expect(programCell('BX-204 (NDA 212345').textContent).toMatch(/No program recorded/i));
    expect(programCell('BX-204 (NDA 212345').textContent).not.toMatch(/Program BX-204/);
  });

  it('labels the product name as the product, not as a program', async () => {
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await waitFor(() => expect(subRow('BX-204 (NDA 212345')).toBeTruthy());
    expect(programCell('BX-204 (NDA 212345').textContent).toMatch(/Product BX-204/);
  });
});
