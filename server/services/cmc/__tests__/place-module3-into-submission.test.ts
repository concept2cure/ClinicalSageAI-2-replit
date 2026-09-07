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
 *   5. A run in which EVERY approved section was skipped filed nothing, so it
 *      refuses (carrying the per-section reasons) instead of reporting a
 *      successful placement of zero sections.
 */

const evaluateFinalExportGate = vi.fn();
vi.mock('../final-export-gate', () => ({
  evaluateFinalExportGate: (...args: unknown[]) => evaluateFinalExportGate(...args),
}));

const getSequence = vi.fn();
const upsertLeaf = vi.fn();
vi.mock('../../submission-service/submission-service', () => ({
  getSequence: (...args: unknown[]) => getSequence(...args),
  upsertLeaf: (...args: unknown[]) => upsertLeaf(...args),
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

import {
  LEGACY_NO_TABLES_SKIP_REASON,
  placeModule3IntoSubmission,
  toLeafSectionCode,
} from '../place-module3-into-submission';

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
    if (!result.placed && result.refusedBy === 'final-export-gate') {
      expect(result.error).toMatch(/stale after approval/);
      expect(result.data.staleSections).toBe(3);
    } else {
      throw new Error('expected the final-export gate to be the refuser');
    }
    // Nothing was read from the sequence, snapshotted, or placed.
    expect(getSequence).not.toHaveBeenCalled();
    expect(upsertLeaf).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('snapshots approved sections into coauthor_documents and places m-prefixed leaves', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockImplementation(async (input: { sectionCode: string }) => ({ id: 900, sectionCode: input.sectionCode }));
    sectionRows = [
      { sectionKey: '3.2.S.1', narrativeText: 'General information narrative.', deterministicJson: { tables: [] } },
      { sectionKey: '3.2.P.8', narrativeText: 'Stability narrative.', deterministicJson: { tables: [] } },
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
      { sectionKey: '3.2.S.1', narrativeText: '  ', deterministicJson: { tables: [] } },
      { sectionKey: '3.2.S.4', narrativeText: 'Control of drug substance.', deterministicJson: { tables: [] } },
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

  it('carries the composed tables the narrative cites into the placed snapshot', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockResolvedValue({ id: 902 });
    const narrative =
      '2 controlled change(s) are recorded in the change register; see the change history table.';
    sectionRows = [
      {
        sectionKey: '3.2.P.3',
        narrativeText: narrative,
        deterministicJson: {
          sectionKey: '3.2.P.3',
          completeness: 100,
          missingInputs: [],
          tables: [
            {
              title: 'Change History — Drug Product',
              headers: ['Change ID', 'Effective'],
              rows: [
                ['CC-0001', '2026-01-04'],
                ['CC-0002', '2026-02-11'],
              ],
            },
          ],
        },
      },
    ];

    const result = await placeModule3IntoSubmission({
      orgId: 7,
      userId: 42,
      cmcProjectId: 'proj-1',
      submissionId: 10,
      sequenceId: 20,
    });

    expect(result.placed).toBe(true);
    expect(inserted).toHaveLength(1);
    const content = String(inserted[0].content);
    expect(content).toContain('## Manufacture (Drug Product)');
    expect(content).toContain(narrative);
    // The tables the narrative cites must be IN the filed snapshot.
    expect(content).toContain('### Change History — Drug Product');
    expect(content).toContain('| Change ID | Effective |');
    expect(content).toContain('| --- | --- |');
    expect(content).toContain('| CC-0001 | 2026-01-04 |');
    expect(content).toContain('| CC-0002 | 2026-02-11 |');
    if (result.placed) {
      expect(result.placements[0].tableCount).toBe(1);
    }
  });

  it('places the placeable sections and says which ones were skipped as pre-tables', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockResolvedValue({ id: 903 });
    sectionRows = [
      {
        sectionKey: '3.2.S.1',
        narrativeText: 'General information narrative.',
        deterministicJson: { sectionKey: '3.2.S.1', completeness: 100, missingInputs: [], tables: [] },
      },
      {
        sectionKey: '3.2.S.4',
        narrativeText: 'Impurity limits are reported in the table above.',
        // Compiled before tables were carried: NO `tables` key at all.
        deterministicJson: { sectionKey: '3.2.S.4', completeness: 100, missingInputs: [] },
      },
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
      expect(result.placements.map((p) => p.sectionKey)).toEqual(['3.2.S.1']);
      expect(result.skipped).toEqual([
        { sectionKey: '3.2.S.4', reason: LEGACY_NO_TABLES_SKIP_REASON },
      ]);
    }
    expect(upsertLeaf).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
  });

  /* A placement that placed NOTHING is not a placement. Every section approved
     before the tables were carried lands here on the first attempt after that
     change, so this is the common case at rollout — it must refuse, not report
     a successful filing of zero leaves. */
  it('refuses the whole placement — with no write — when every approved section is unplaceable', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockResolvedValue({ id: 903 });
    // Row order is the SELECT's ORDER BY section_key.
    sectionRows = [
      { sectionKey: '3.2.P.8', narrativeText: '   ', deterministicJson: { tables: [] } },
      {
        sectionKey: '3.2.S.4',
        narrativeText: 'Impurity limits are reported in the table above.',
        // Compiled before tables were carried: NO `tables` key at all.
        deterministicJson: { sectionKey: '3.2.S.4', completeness: 100, missingInputs: [] },
      },
    ];

    const result = await placeModule3IntoSubmission({
      orgId: 7,
      userId: 42,
      cmcProjectId: 'proj-1',
      submissionId: 10,
      sequenceId: 20,
    });

    expect(result.placed).toBe(false);
    if (!result.placed && result.refusedBy === 'nothing-placeable') {
      expect(result.skipped).toEqual([
        { sectionKey: '3.2.P.8', reason: 'No compiled narrative to place.' },
        { sectionKey: '3.2.S.4', reason: LEGACY_NO_TABLES_SKIP_REASON },
      ]);
      // The refusal names the count and carries the reasons in its own wording.
      expect(result.error).toContain('2 approved section(s)');
      expect(result.error).toContain(LEGACY_NO_TABLES_SKIP_REASON);
    } else {
      throw new Error('expected a nothing-placeable refusal');
    }
    expect(upsertLeaf).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('places a genuinely table-free section with no table block and no trailing blank tail', async () => {
    evaluateFinalExportGate.mockResolvedValue(GATE_PASS);
    getSequence.mockResolvedValue({ id: 20, submissionId: 10, status: 'draft' });
    upsertLeaf.mockResolvedValue({ id: 904 });
    sectionRows = [
      {
        sectionKey: '3.2.S.1',
        narrativeText: 'General information narrative.',
        deterministicJson: { sectionKey: '3.2.S.1', completeness: 100, missingInputs: [], tables: [] },
      },
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
      expect(result.placements).toHaveLength(1);
      expect(result.placements[0].tableCount).toBe(0);
      expect(result.skipped).toHaveLength(0);
    }
    const content = String(inserted[0].content);
    expect(content).not.toContain('###');
    expect(content.endsWith('General information narrative.')).toBe(true);
  });
});

describe('toLeafSectionCode', () => {
  it("prefixes the eCTD spine's m onto CMC OS section keys", () => {
    expect(toLeafSectionCode('3.2.S.1')).toBe('m3.2.S.1');
    expect(toLeafSectionCode('3.1')).toBe('m3.1');
    expect(toLeafSectionCode('3.3')).toBe('m3.3');
  });
});
