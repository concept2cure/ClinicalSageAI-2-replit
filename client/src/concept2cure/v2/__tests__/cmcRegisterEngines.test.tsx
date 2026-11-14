// @vitest-environment jsdom
/**
 * The impurity verdicts and the dissolution f2 are on their registers (P-122
 * inventory, B3 and B4). Both engines answered only through AnA: the impurity
 * register showed that M7 inputs were "required" and never the class or the
 * control; the dissolution register promised an f2 "computed from the recorded
 * profiles" and offered no way to compute one.
 *
 * What must be true: each impurity row carries the server's verdict against
 * its guideline, in words, and a refusal in the engine's words; two recorded
 * profiles can be compared, and the f2, its similarity and its scope statement
 * are the server's, as is a refusal.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import { CmDissolutionProfiles, CmImpurityProfiles } from '../surfaces/cmcRegisters';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the impurity register says what each impurity is against its guideline', () => {
  it('shows the M7 class, control and intake, a Q3A verdict, and a refusal in the engine’s words', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/cmc/impurity-profiles/assessment')) {
        return res({ success: true, data: [
          { id: 1, impurityName: 'Impurity A', assessments: [{ side: 'drug_substance', ok: true, basis: 'ICH Q3A(R2)/Q3B(R2)', disposition: 'reportable', outstanding: [],
            thresholds: { reporting: { effectivePercent: 0.05, expression: '0.05%' }, identification: { effectivePercent: 0.1, expression: '0.10%' }, qualification: { effectivePercent: 0.15, expression: '0.15%' } } }] },
          { id: 2, impurityName: 'PGI-1', assessments: [{ side: 'drug_substance', ok: true, basis: 'ICH M7(R2)', impurityClass: 3, className: 'Alerting structure, no mutagenicity data',
            controlApproach: 'Control at or below the TTC-based acceptable intake', acceptableIntakeUgPerDay: 20, concentrationLimitPpm: 1333.333, withinLimit: true, disposition: 'within-limit', outstanding: [] }] },
          { id: 3, impurityName: 'Impurity Z', assessments: [{ side: 'drug_substance', ok: false, code: 'MDD_MISSING', message: 'No maximum daily dose is recorded.' }] },
        ] });
      }
      if (url.startsWith('/api/cmc/impurity-profiles')) {
        return res({ success: true, data: [1, 2, 3].map((id) => ({ id, impurityName: ['Impurity A', 'PGI-1', 'Impurity Z'][id - 1], materialName: 'C2C-201', scope: 'drug_substance', impurityType: 'process-related', status: 'draft' })) });
      }
      return res({ success: true, data: [] });
    });
    render(<CmImpurityProfiles />);
    expect(await screen.findByText(/M7 class 3 \(Alerting structure, no mutagenicity data\): acceptable intake 20 µg\/day \(1,333\.333 ppm\) · within · control: Control at or below/)).toBeTruthy();
    expect(screen.getByText(/Q3A: reportable · reporting 0\.05 %, identification 0\.1 %, qualification 0\.15 %/)).toBeTruthy();
    expect(screen.getByText('Not assessed: No maximum daily dose is recorded.')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Against the guideline' })).toBeTruthy();
  });

  /* Found by another lane's suite: a mock answered this read with an object,
     `read.data ?? []` kept it, and `.map` threw out of the memo (every test
     green, the run exits 1). A payload that is not a list is a failed read,
     and never "not assessed" on every row. */
  it('treats an assessments payload that is not a list as a failed read, not an empty register', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/cmc/impurity-profiles/assessment')) return res({ success: true, data: { rows: [] } });
      if (url.startsWith('/api/cmc/impurity-profiles')) {
        return res({ success: true, data: [{ id: 1, impurityName: 'Impurity A', materialName: 'C2C-201', scope: 'drug_substance', impurityType: 'process-related', status: 'draft' }] });
      }
      return res({ success: true, data: [] });
    });
    render(<CmImpurityProfiles />);
    expect(await screen.findByText('The assessments read did not return a list of impurities.')).toBeTruthy();
    expect(screen.queryByText('not assessed')).toBeNull();
  });
});

describe('two recorded dissolution profiles can be compared', () => {
  const PROFILES = [
    { id: 7, productName: 'C2C-201 tablets', batchNumber: 'DP-2503', purpose: 'development', apparatus: 'USP II (paddle)', medium: 'pH 6.8', status: 'reported' },
    { id: 8, productName: 'C2C-201 tablets', batchNumber: 'DP-2601', purpose: 'comparability', apparatus: 'USP II (paddle)', medium: 'pH 6.8', status: 'reported' },
  ];
  const wire = (compare: () => Response) => apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === '/api/cmc/dissolution-profiles/compare') return compare();
    if (url.startsWith('/api/cmc/dissolution-profiles')) return res({ success: true, data: PROFILES });
    return res({ success: true, data: [] });
  });
  const choose = async () => {
    render(<CmDissolutionProfiles />);
    fireEvent.change(await screen.findByLabelText('Reference profile'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Test profile'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
  };

  it('posts the two ids and shows the server’s f2, similarity and scope', async () => {
    wire(() => res({ success: true, data: { status: 'computed', methodsMatch: true, reference: { id: 7, batch: 'DP-2503' }, test: { id: 8, batch: 'DP-2601' },
      result: { outcome: 'computed', f2Reported: '78.4', f2Similar: true, f1Reported: '4.1', inputsUsed: { includedTimepointsMin: [10, 15, 20], unitsTested: { reference: 12, test: 12 } }, scope: 'f2 compares two mean in-vitro profiles.' } } }));
    await choose();
    const out = await screen.findByTestId('cm-f2-computed');
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/cmc/dissolution-profiles/compare')![2]).toEqual({ referenceId: 7, testId: 8 });
    expect(out.textContent).toMatch(/f2 78\.4/);
    expect(out.textContent).toMatch(/similar \(f2 ≥ 50\)/);
    expect(out.textContent).toMatch(/f2 compares two mean in-vitro profiles\./);
  });

  it('shows the engine’s refusal and what it needs', async () => {
    wire(() => res({ success: true, data: { status: 'not_comparable', methodsMatch: true, reference: { id: 7, batch: 'DP-2503' }, test: { id: 8, batch: 'DP-2601' },
      result: { outcome: 'refused', code: 'UNITS_NOT_RECORDED', message: 'The number of units tested is not recorded.', offending: [{ role: 'test', required: 'a recorded unit count' }] } } }));
    await choose();
    const out = await screen.findByTestId('cm-f2-refused');
    expect(out.textContent).toMatch(/Not comparable — The number of units tested is not recorded\./);
    expect(out.textContent).toMatch(/test: needs a recorded unit count/);
  });

  it('cannot compare a profile with itself', async () => {
    wire(() => res({}, 500));
    render(<CmDissolutionProfiles />);
    fireEvent.change(await screen.findByLabelText('Reference profile'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Test profile'), { target: { value: '7' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Compare' }) as HTMLButtonElement).disabled).toBe(true));
  });
});
