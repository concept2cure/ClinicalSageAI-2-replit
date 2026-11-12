/**
 * placeModule3IntoSubmission, placed a second time into the same sequence.
 * Split from place-module3-into-submission.test.ts (its file-length limit);
 * the mocks are that suite's, with the filing documents already in the store
 * (filedSnapshots) added.
 */import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The placement seam's contract:
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

/* The composition boundary admits this suite's program; its refusals are in
   place-module3-into-submission-boundary.test.ts. */
vi.mock('../module3-compile', async (orig) => ({ ...(await orig<object>()), assessProgramCompositionScope: async () => null }));

const poolQueries: Array<{ sql: string; params: unknown[] }> = [];
let sectionRows: Array<{
  sectionKey: string;
  narrativeText: string | null;
  deterministicJson?: Record<string, unknown> | null;
}> = [];
const inserted: Array<Record<string, unknown>> = [];
let nextSnapshotId = 500;
/** Filing documents already in the store, by id, as a placement left them. */
let filedSnapshots: Record<number, { title: string; content: string }> = {};

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      poolQueries.push({ sql, params });
      // Fixture rows stand for sections filed as signed; the binding is
      // proven in section-signature-binding.pglite.test.ts.
      if (sql.includes('FROM cmc_module3_sections')) {
        return { rows: sectionRows.map((r) => ({ snapshotCoversNarrative: true, signedAsIs: true, ...r })) };
      }
      if (sql.includes('FROM coauthor_documents')) {
        const row = filedSnapshots[Number(params[0])];
        return { rows: row ? [row] : [] };
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

describe('placeModule3IntoSubmission', () => {
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
    filedSnapshots = {};
    getSubmission.mockReset();
    getSubmission.mockResolvedValue({ id: 10, applicationType: 'ind' });
  });

  /* 2026-11-11 (D4, OQ-CMC-19 and -27 as executed): a repeat of an identical placement added no leaf, but wrote a
     new filing document for every section and pointed each leaf at it. The earlier documents stayed, unreferenced,
     and a release signature made before the repeat stopped clearing the sequence although no content had changed. */
  describe('placing again into the same sequence, with a section unchanged', () => {
    const args = { orgId: 7, userId: 42, cmcProjectId: 'proj-1', submissionId: 10, sequenceId: 20, reason: 'Placing Module 3 for filing.' };
    const placeOnce = async () => {
      evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
      getSequence.mockResolvedValue({ id: 20, submissionId: 10, sequenceNumber: '0001', status: 'draft' });
      upsertLeaf.mockImplementation(async (input: { sectionCode: string; leafId?: number }) => ({ id: input.leafId ?? 990, sectionCode: input.sectionCode }));
      sectionRows = [{ sectionKey: '3.2.S.1', narrativeText: 'Narrative.', deterministicJson: { tables: [] } }];
      const first = await placeModule3IntoSubmission(args);
      expect(first.placed).toBe(true);
      const filed = inserted[0] as { title: string; content: string };
      // The store as the first placement left it: one leaf, pointing at the document just written.
      filedSnapshots = { 501: { title: filed.title, content: filed.content } };
      listLeaves.mockImplementation(async (sequenceId: number) => (sequenceId !== 20 ? [] : [
        { id: 990, sectionCode: 'm3.2.S.1', documentType: 'cmc_module3_section', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 501 },
      ]));
      inserted.length = 0;
      upsertLeaf.mockClear();
      poolQueries.length = 0;
    };

    it('writes nothing: no new filing document, no leaf write, no provenance event, and says the section is unchanged', async () => {
      await placeOnce();
      const again = await placeModule3IntoSubmission(args);
      expect(again.placed).toBe(true);
      expect(inserted).toEqual([]);
      expect(upsertLeaf).not.toHaveBeenCalled();
      expect(poolQueries.filter((q) => /INSERT INTO cmc_provenance_events/i.test(q.sql))).toEqual([]);
      expect(again.placed && again.placements).toEqual([
        expect.objectContaining({ sectionKey: '3.2.S.1', leafId: 990, coauthorDocumentId: 501, unchanged: true, updatedInPlace: false }),
      ]);
    });

    it('a section whose text changed is filed again: a new document, and the same leaf updated in place', async () => {
      await placeOnce();
      sectionRows = [{ sectionKey: '3.2.S.1', narrativeText: 'Narrative, revised.', deterministicJson: { tables: [] } }];
      const again = await placeModule3IntoSubmission(args);
      expect(inserted).toHaveLength(1);
      expect(upsertLeaf.mock.calls[0][0]).toMatchObject({ leafId: 990, documentId: 502 });
      expect(again.placed && again.placements[0]).toMatchObject({ leafId: 990, coauthorDocumentId: 502, updatedInPlace: true });
      expect(again.placed && again.placements[0].unchanged).toBeUndefined();
    });

    it('a leaf whose filing document cannot be read is filed again, never assumed unchanged', async () => {
      await placeOnce();
      filedSnapshots = {};
      const again = await placeModule3IntoSubmission(args);
      expect(inserted).toHaveLength(1);
      expect(again.placed && again.placements[0]).toMatchObject({ updatedInPlace: true });
    });
  });
});
