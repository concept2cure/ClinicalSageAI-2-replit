import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Placement asks the composition boundary (decision P-28: small-molecule
 * Module 3 for a US IND) of the program and of the target, before anything is
 * read or written. Split from place-module3-into-submission.test.ts, whose
 * mocks it mirrors. That file's contract, for reference:
 *   1. It REFUSES — before any write — unless the final-export gate passes,
 *      and the refusal carries the gate's own verdict.
 *   2. It snapshots each approved section into coauthor_documents and places
 *      the snapshot as a submission leaf at the m-prefixed section code.
 *   3. It refuses a sequence that does not belong to the stated submission.
 *   4. An approved section with no compiled narrative is skipped and SAID to
 *      be skipped — never filed as an empty leaf.
 *   5. A run in which EVERY approved section was skipped filed nothing, so it
 *      refuses (carrying the per-section reasons) instead of reporting a
 *      successful placement of zero sections.
 */

const evaluateFinalExportGate = vi.fn();
vi.mock('../final-export-gate', () => ({
  evaluateFinalExportGate: (...args: unknown[]) => evaluateFinalExportGate(...args),
}));

const getSequence = vi.fn();
const getSubmission = vi.fn<(...args: any[]) => Promise<any>>(async () => ({
  id: 10,
  applicationType: 'ind',
}));
const upsertLeaf = vi.fn();
const listSequences = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
const listLeaves = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
/* The submission program's anchored projects row, for a legacy numeric CMC
   project (PF-11). The translation rule is tested in its own suite. */
const resolveAnchor = vi.fn<(...args: any[]) => Promise<any>>(async () => ({ state: 'unanchored', detail: 'no anchor' }));
vi.mock('../resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: (...args: unknown[]) => resolveAnchor(...args),
}));
vi.mock('../../submission-service/submission-service', () => ({
  getSequence: (...args: unknown[]) => getSequence(...args),
  getSubmission: (...args: unknown[]) => getSubmission(...args),
  upsertLeaf: (...args: unknown[]) => upsertLeaf(...args),
  listSequences: (...args: unknown[]) => listSequences(...args),
  listLeaves: (...args: unknown[]) => listLeaves(...args),
}));

/* The program half of the composition boundary (decision P-28), judged on a
   real engine in composition-boundary-readers.pglite.test.ts. */
const assessProgramCompositionScope = vi.fn<(...args: any[]) => Promise<any>>(async () => null);
vi.mock('../module3-compile', async (orig) => ({
  ...(await orig<object>()),
  assessProgramCompositionScope: (...args: unknown[]) => assessProgramCompositionScope(...args),
}));

const poolQueries: Array<{ sql: string; params: unknown[] }> = [];
let sectionRows: Array<{
  sectionKey: string;
  narrativeText: string | null;
  deterministicJson?: Record<string, unknown> | null;
}> = [];
const inserted: Array<Record<string, unknown>> = [];
let nextSnapshotId = 500;

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      poolQueries.push({ sql, params });
      // Fixture rows stand for sections filed as signed; the binding is
      // proven in section-signature-binding.pglite.test.ts.
      if (sql.includes('FROM cmc_module3_sections')) {
        return { rows: sectionRows.map((r) => ({ snapshotCoversNarrative: true, signedAsIs: true, ...r })) };
      }
      return { rows: [] };
    },
  }),
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push(v);
          return [{ id: ++nextSnapshotId }];
        },
      }),
    }),
  },
}));

import { placeModule3IntoSubmission } from '../place-module3-into-submission';

const GATE_PASS = {
  allowed: true,
  data: {
    totalSections: 17,
    approvedSections: 17,
    staleSections: 0,
    openCriticalContradictions: 0,
    canonicalGovernedState: null,
  },
};

describe('placeModule3IntoSubmission and the composition boundary', () => {
  beforeEach(() => {
    evaluateFinalExportGate.mockReset();
    getSequence.mockReset();
    upsertLeaf.mockReset();
    listSequences.mockReset();
    listSequences.mockResolvedValue([]);
    listLeaves.mockReset();
    listLeaves.mockResolvedValue([]);
    poolQueries.length = 0;
    inserted.length = 0;
    sectionRows = [];
    nextSnapshotId = 500;
    getSubmission.mockReset();
    getSubmission.mockResolvedValue({ id: 10, applicationType: 'ind' });
    assessProgramCompositionScope.mockReset();
    assessProgramCompositionScope.mockResolvedValue(null);
  });

  /* The target check (refusedTarget) asks the vocabulary first; an IRB target
     is pinned in place-module3-into-submission.test.ts, a device one here. */
  it('refuses an eSTAR device submission as not filing on CTD headings', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, sequenceNumber: '0001', status: 'draft' });
    getSubmission.mockResolvedValue({ id: 10, applicationType: '510k' });
    sectionRows = [
      { sectionKey: '3.2.S.1', narrativeText: 'General information.', deterministicJson: { tables: [] } },
    ];

    const result = await placeModule3IntoSubmission({
      orgId: 7, userId: 42, cmcProjectId: 'proj-1', submissionId: 10, sequenceId: 20,
    });

    expect(result.placed).toBe(false);
    expect(!result.placed && result.refusedBy).toBe('wrong-submission-type');
    expect(inserted).toHaveLength(0);
  });

  describe('the composition boundary (decision P-28: small-molecule Module 3 for a US IND)', () => {
    /* Compose refused a marketing application, but the IND-composed text could
       be placed into one: 'ctd' admits NDA and BLA, and an NDA created under
       the same program passes the cross-project check (2026-10-15
       launch-boundary re-proof). */
    const place = () =>
      placeModule3IntoSubmission({ orgId: 7, userId: 42, cmcProjectId: 'proj-1', submissionId: 10, sequenceId: 20 });
    beforeEach(() => {
      evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
      getSequence.mockResolvedValue({ id: 20, submissionId: 10, sequenceNumber: '0001', status: 'draft' });
      sectionRows = [{ sectionKey: '3.2.S.1', narrativeText: 'General information.', deterministicJson: { tables: [] } }];
    });

    it.each(['nda', 'bla', 'anda', 'maa'])('refuses a %s target, naming it, before anything is read or written', async (type) => {
      getSubmission.mockResolvedValue({ id: 10, applicationType: type });
      const result = await place();
      expect(result.placed).toBe(false);
      if (result.placed || result.refusedBy !== 'composition-scope') throw new Error(`expected the boundary, got ${JSON.stringify(result)}`);
      expect(result.refusal.code).toBe('CMC_APPLICATION_OUT_OF_SCOPE');
      expect(result.error).toMatch(new RegExp(`This submission files ${type.toUpperCase()}`));
      expect(inserted).toHaveLength(0);
      expect(upsertLeaf).not.toHaveBeenCalled();
      expect(poolQueries.filter((q) => q.sql.includes('FROM cmc_module3_sections'))).toHaveLength(0);
    });

    it('refuses a program outside the boundary, even when its sections passed the gate', async () => {
      assessProgramCompositionScope.mockResolvedValue({
        code: 'CMC_MODALITY_OUT_OF_SCOPE',
        modality: 'biologic',
        message: "This program's drug substance is biologically derived — CHO cell culture.",
      });
      const result = await place();
      expect(!result.placed && result.refusedBy).toBe('composition-scope');
      expect(assessProgramCompositionScope).toHaveBeenCalledWith(7, 'proj-1');
      expect(inserted).toHaveLength(0);
      expect(upsertLeaf).not.toHaveBeenCalled();
    });

    it('places a small-molecule program into its US IND', async () => {
      upsertLeaf.mockImplementation(async (input: { sectionCode: string }) => ({ id: 900, sectionCode: input.sectionCode }));
      const result = await place();
      expect(result.placed).toBe(true);
      expect(assessProgramCompositionScope).toHaveBeenCalledWith(7, 'proj-1');
    });
  });

});
