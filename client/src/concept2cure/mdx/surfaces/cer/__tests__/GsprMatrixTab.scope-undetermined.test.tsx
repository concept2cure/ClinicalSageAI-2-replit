// @vitest-environment jsdom
/**
 * The GSPR tab says how many clauses are of undetermined scope and which device
 * facts the program does not record, instead of reading as a complete checklist.
 *
 * Before (to 2026-10-15): the coverage report dropped sterile-only,
 * implantable-only and product-type-scoped clauses whenever the fact was not
 * stated (the client never stated any), so this tab could read "Gate passes at
 * 100% coverage" over a checklist missing them. The server now keeps them, as
 * `scopeUndetermined`, and blocks the gate; the tab names them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GsprMatrixTab } from '../GsprMatrixTab';

const PROGRAM = 'a0a0a0a0-0000-4000-8000-000000000001';

const json = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

const CATALOG = [
  { id: 'r1', regulation: 'MDR', annex: 'I', chapter: 'I', clause: '1', title: 'Intended performance' },
  { id: 'r11', regulation: 'MDR', annex: 'I', chapter: 'II', clause: '11', title: 'Infection and microbial contamination' },
  { id: 'r19', regulation: 'MDR', annex: 'I', chapter: 'II', clause: '19', title: 'Active implantable devices' },
];

const MAPPINGS = [
  {
    mapping: { requirementId: 'r1', applicability: 'applies', conformanceStatus: 'conformant', primaryEvidenceId: 'ev-1' },
    requirement: { id: 'r1' },
  },
];

const COVERAGE = {
  programId: PROGRAM,
  regulation: 'MDR',
  totalApplicable: 3,
  mappedApplies: 1,
  mappedNotApplicable: 0,
  mappedPartial: 0,
  mappedTbd: 0,
  unmapped: 2,
  scopeUndetermined: 2,
  undeterminedFacts: ['sterile', 'implantable'],
  conformantCount: 1,
  nonConformantCount: 0,
  needsEvidenceCount: 0,
  findings: [],
  coveragePercent: 33.3,
  passesGate: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('GsprMatrixTab — scope undetermined', () => {
  it('names the undetermined clauses and the facts the program does not record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/gspr/catalog')) return json({ regulation: 'MDR', requirements: CATALOG, count: 3 });
        if (url.includes('/mappings')) return json({ programId: PROGRAM, mappings: MAPPINGS, count: 1 });
        if (url.includes('/coverage')) return json(COVERAGE);
        return json({});
      }),
    );
    render(<GsprMatrixTab programId={PROGRAM} defaultRegulation="MDR" onAskAna={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/3 requirements in scope or of undetermined scope/)).toBeTruthy(),
    );
    expect(screen.getByText(/3 requirements in scope or of undetermined scope/).textContent).toMatch(/gate blocked/);
    expect(
      screen.getByText(/2 of undetermined scope \(not recorded on the program: sterile, implantable\)/),
    ).toBeTruthy();
  });
});
