import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The placement seam's contract:
 *   1. It REFUSES — before any write — unless the final-export gate passes,
 *      and the refusal carries the gate's own verdict.
 *   2. It snapshots each approved section into coauthor_documents and places
 *      the snapshot as a submission leaf at the m-prefixed section code.
 *   3. It refuses a sequence that does not belong to the stated submission.
 *   4. An approved section with no compiled narrative is skipped and SAID to
 *      be skipped — never filed as an empty leaf.
 */

const evaluateFinalExportGate = vi.fn();
vi.mock('../final-export-gate', () => ({
  evaluateFinalExportGate: (...args: unknown[]) => evaluateFinalExportGate(...args),
}));

const getSequence = vi.fn();
const upsertLeaf = vi.fn();
const listSequences = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
const listLeaves = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
vi.mock('../../submission-service/submission-service', () => ({
  getSequence: (...args: unknown[]) => getSequence(...args),
  upsertLeaf: (...args: unknown[]) => upsertLeaf(...args),
  listSequences: (...args: unknown[]) => listSequences(...args),
  listLeaves: (...args: unknown[]) => listLeaves(...args),
}));

const poolQueries: Array<{ sql: string; params: unknown[] }> = [];
let sectionRows: Array<{ sectionKey: string; narrativeText: string | null }> = [];
const inserted: Array<Record<string, unknown>> = [];
let nextSnapshotId = 500;

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      poolQueries.push({ sql, params });
      if (sql.includes('FROM cmc_module3_sections')) return { rows: sectionRows };
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

import { placeModule3IntoSubmission, toLeafSectionCode } from '../place-module3-into-submission';

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
  });

  it('refuses with the gate verdict and performs no write when the gate refuses', async () => {
    evaluateFinalExportGate.mockResolvedValue({
      allowed: false,
      error: '3 section(s) went stale after approval and must be re-approved before final export',
      data: { totalSections: 17, approvedSections: 14, staleSections: 3, openCriticalContradictions: 0, canonicalGovernedState: null },
    });

    const result = await placeModule3IntoSubmission({
      orgId: 7,
      userId: 42,
      cmcProjectId: 'proj-1',
      submissionId: 10,
      sequenceId: 20,
    });

    expect(result.placed).toBe(false);
    if (!result.placed) {
      expect(result.error).toMatch(/stale after approval/);
      expect(result.data.staleSections).toBe(3);
    }
    // Nothing was read from the sequence, snapshotted, or placed.
    expect(getSequence).not.toHaveBeenCalled();
    expect(upsertLeaf).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('files a section already placed in an earlier sequence as replace of that leaf, not as new', async () => {
    // This always filed 'new', so an amendment's m3.2.S.7 was announced to the
    // agency as brand-new content with no lifecycle link to the leaf it revises.
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, sequenceNumber: '0001', status: 'draft' });
    listSequences.mockResolvedValue([
      { id: 20, submissionId: 10, sequenceNumber: '0001' },
      { id: 10, submissionId: 10, sequenceNumber: '0000' },
      { id: 30, submissionId: 10, sequenceNumber: '0002' }, // later — never a parent
    ]);
    listLeaves.mockImplementation(async (sequenceId: number) =>
      sequenceId === 10
        ? [
            { id: 700, sectionCode: 'm3.2.S.1', documentType: 'cmc_module3_section', lifecycleOp: 'new' },
            { id: 701, sectionCode: 'm3.2.P.8', documentType: 'protocol', lifecycleOp: 'new' }, // not a Module 3 placement
          ]
        : sequenceId === 30
          ? [{ id: 800, sectionCode: 'm3.2.P.8', documentType: 'cmc_module3_section', lifecycleOp: 'new' }]
          : [],
    );
    upsertLeaf.mockImplementation(async (input: { sectionCode: string }) => ({ id: 900, sectionCode: input.sectionCode }));
    sectionRows = [
      { sectionKey: '3.2.S.1', narrativeText: 'Revised general information.' },
      { sectionKey: '3.2.P.8', narrativeText: 'Stability narrative.' },
    ];

    const result = await placeModule3IntoSubmission({ orgId: 7, userId: 42, cmcProjectId: 'proj-1', submissionId: 10, sequenceId: 20 });
    expect(result.placed).toBe(true);

    const s1 = upsertLeaf.mock.calls.find((c) => c[0].sectionCode === 'm3.2.S.1')![0];
    expect(s1.lifecycleOp).toBe('replace');
    expect(s1.parentLeafId).toBe(700);
    const p8 = upsertLeaf.mock.calls.find((c) => c[0].sectionCode === 'm3.2.P.8')![0];
    expect(p8.lifecycleOp).toBe('new');
    expect(p8.parentLeafId ?? null).toBeNull();
    // Every sequence read is tenant-scoped.
    expect(listSequences).toHaveBeenCalledWith(10, { organizationId: 7 });
    expect(listLeaves).toHaveBeenCalledWith(10, { organizationId: 7 });
  });

  it('snapshots approved sections into coauthor_documents and places m-prefixed leaves', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockImplementation(async (input: { sectionCode: string }) => ({ id: 900, sectionCode: input.sectionCode }));
    sectionRows = [
      { sectionKey: '3.2.S.1', narrativeText: 'General information narrative.' },
      { sectionKey: '3.2.P.8', narrativeText: 'Stability narrative.' },
    ];

    const result = await placeModule3IntoSubmission({
      orgId: 7,
      userId: 42,
      cmcProjectId: 'proj-1',
      submissionId: 10,
      sequenceId: 20,
    });

    expect(result.placed).toBe(true);
    if (result.placed) {
      expect(result.placements).toHaveLength(2);
      expect(result.placements[0].leafSectionCode).toBe('m3.2.S.1');
      expect(result.placements[1].leafSectionCode).toBe('m3.2.P.8');
      expect(result.skipped).toHaveLength(0);
    }

    // The snapshot is the renderable leaf source: org-scoped, m-coded.
    expect(inserted).toHaveLength(2);
    expect(inserted[0].organizationId).toBe(7);
    expect(inserted[0].moduleNumber).toBe('m3.2.S.1');
    expect(String(inserted[0].content)).toContain('General information narrative.');

    // The leaf points at the snapshot through the canonical write.
    expect(upsertLeaf).toHaveBeenCalledTimes(2);
    const firstLeaf = upsertLeaf.mock.calls[0][0];
    expect(firstLeaf.documentTable).toBe('coauthor_documents');
    expect(firstLeaf.documentId).toBe(501);
    expect(firstLeaf.sectionCode).toBe('m3.2.S.1');
    expect(upsertLeaf.mock.calls[0][1]).toEqual({ organizationId: 7, userId: 42 });

    // Provenance recorded per placement.
    const provenanceWrites = poolQueries.filter((q) => q.sql.includes('cmc_provenance_events'));
    expect(provenanceWrites).toHaveLength(2);
    expect(provenanceWrites[0].sql).toContain('placed_into_submission');
  });

  it('refuses a sequence that belongs to a different submission', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 99, status: 'draft' });

    await expect(
      placeModule3IntoSubmission({ orgId: 7, userId: 42, cmcProjectId: 'proj-1', submissionId: 10, sequenceId: 20 }),
    ).rejects.toThrow(/does not belong to the stated submission/);
    expect(upsertLeaf).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('skips (and says it skipped) an approved section with no compiled narrative', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockResolvedValue({ id: 901 });
    sectionRows = [
      { sectionKey: '3.2.S.1', narrativeText: '  ' },
      { sectionKey: '3.2.S.4', narrativeText: 'Control of drug substance.' },
    ];

    const result = await placeModule3IntoSubmission({
      orgId: 7,
      userId: 42,
      cmcProjectId: 'proj-1',
      submissionId: 10,
      sequenceId: 20,
    });

    expect(result.placed).toBe(true);
    if (result.placed) {
      expect(result.placements.map((p) => p.sectionKey)).toEqual(['3.2.S.4']);
      expect(result.skipped).toEqual([{ sectionKey: '3.2.S.1', reason: 'No compiled narrative to place.' }]);
    }
  });
});

describe('toLeafSectionCode', () => {
  it("prefixes the eCTD spine's m onto CMC OS section keys", () => {
    expect(toLeafSectionCode('3.2.S.1')).toBe('m3.2.S.1');
    expect(toLeafSectionCode('3.1')).toBe('m3.1');
    expect(toLeafSectionCode('3.3')).toBe('m3.3');
  });
});
