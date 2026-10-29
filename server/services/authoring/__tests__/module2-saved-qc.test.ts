/**
 * Module 2 QC grades what a package run would build now, from the project's
 * saved records (slice G5), never summaries a caller supplies.
 *
 * The loaders are the run's own (approved CMC sources, completed CSR builds);
 * the builders and the QC are the canonical ones, unmocked. A summary a run
 * would not build is named with its reason and reported missing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  cmc: { gate: 'closed', sources: [], reason: 'No CMC section is approved for export.' } as Record<string, unknown>,
  csrs: [] as unknown[],
  csrCalls: [] as unknown[][],
}));
vi.mock('../../cmc/load-approved-cmc-sources-for-project', () => ({ loadApprovedCmcSourcesForProject: async () => h.cmc }));
vi.mock('../../csr/load-csr-inputs-for-project', () => ({
  loadCsrInputsForProject: async (...a: unknown[]) => { h.csrCalls.push(a); return h.csrs; },
}));

import { readSavedModule2Qc } from '../module2-saved-qc';

const SCOPE = { organizationId: 7, userId: 3, programId: '40000000-0000-4000-8000-000000000001', projectId: 12, applicationType: 'ind', primaryRegion: 'fda' };
const CSR = {
  studyId: 'S-101', protocolNumber: 'ABC-101', phase: '1', studyDesign: 'Randomized, double-blind',
  primaryEndpoint: 'Safety', primaryResult: 'Well tolerated', primaryEndpointMet: true, sampleSize: 48,
};

beforeEach(() => {
  h.cmc = { gate: 'closed', sources: [], reason: 'No CMC section is approved for export.' };
  h.csrs = [];
  h.csrCalls.length = 0;
});

describe('Module 2 QC over saved program content', () => {
  it('builds 2.5 and 2.7 from the completed CSR builds and names what a run would not build', async () => {
    h.csrs = [CSR];
    const r = await readSavedModule2Qc(SCOPE);
    expect(r.basis).toBe('SAVED_PROGRAM_CONTENT');
    expect(h.csrCalls[0]).toEqual([7, 12, { actorUserId: 3 }]);
    expect(r.qc.checked.sort()).toEqual(['2.5', '2.7']);
    expect(r.qc.missingSummaries.sort()).toEqual(['2.3', '2.4']);
    expect(r.qc.ready).toBe(false);
    expect(r.notBuilt.map((n) => n.summaryKey)).toEqual(['2.3', '2.4']);
    expect(r.notBuilt[0].reason).toBe('No CMC section is approved for export.');
    expect(r.notBuilt[1].reason).toMatch(/R-1/);
    expect(r.sources).toEqual({ completedCsrStudies: 1, cmcGate: 'closed', module3Sections: 0 });
  });

  it('builds nothing it has no record for, and says so for every summary', async () => {
    const r = await readSavedModule2Qc({ ...SCOPE, projectId: null });
    expect(h.csrCalls).toHaveLength(0);
    expect(r.qc.checked).toEqual([]);
    expect(r.qc.ready).toBe(false);
    expect(r.notBuilt.map((n) => n.summaryKey)).toEqual(['2.3', '2.4', '2.5', '2.7']);
    expect(r.notBuilt.find((n) => n.summaryKey === '2.5')?.reason).toMatch(/no CSR workspace/);
  });

  it('refuses to compose 2.3 for an application outside the composition boundary, even with the gate open', async () => {
    h.cmc = { gate: 'open', sources: [{ id: 'x' }], approvedSections: 1 };
    const r = await readSavedModule2Qc({ ...SCOPE, applicationType: 'nda' });
    expect(r.qc.checked).not.toContain('2.3');
    expect(r.notBuilt.find((n) => n.summaryKey === '2.3')?.reason).toMatch(/files/i);
  });
});
