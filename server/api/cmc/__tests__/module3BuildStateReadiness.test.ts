import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Module 3 readiness figure, and the gate that governs release.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * `readySections` was counted from `buildState`, a PRESENTATION value with a
 * priority order whose `locked` branch reads `artifactStatus` — the document
 * lifecycle in the editor, not §3.2 section approval. A section whose artifact
 * happened to be locked therefore counted as ready while its `approval_state`
 * was still `draft`.
 *
 * The final-export gate (module3OperatingSystemRoutes) counts
 * `approval_state === 'approved'` and refuses on any section that went stale
 * after approval. So the build screen could show 2/2 ready for a project the
 * gate refused with "2 section(s) not approved" — the two numbers on either side
 * of the same decision, computed from different things.
 *
 * A readiness percentage that disagrees with the gate is worse than no
 * percentage: it is the number a CMC lead uses to tell a programme it can file.
 * These tests hold the two definitions together.
 */

const mockQuery = vi.fn();
vi.mock('../../../db', () => ({
  getPool: () => ({ query: mockQuery, connect: async () => ({ query: mockQuery, release: vi.fn() }) }),
}));

import router from '../module3BuildStateRoutes';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantId = 101;
  req.tenantContext = { organizationId: 101 };
  next();
});
app.use('/api/cmc/module3-build', router);

/**
 * The route fans out several reads before assembling per-section rows. Rather
 * than pin its exact query order, answer every query from one pool of rows keyed
 * by what the SQL is selecting — the assertions below are about the SUMMARY,
 * which is derived arithmetic over those rows.
 */
type SectionFixture = {
  section_key: string;
  approval_state: string | null;
  stale: boolean;
  artifact_status?: string | null;
};

function wire(sections: SectionFixture[]) {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (/FROM\s+cmc_module3_sections/i.test(text)) {
      return Promise.resolve({
        rows: sections.map(s => ({
          sectionKey: s.section_key,
          approvalState: s.approval_state,
          stale: s.stale,
          staleReason: s.stale ? 'source data updated' : null,
          narrativeText: 'x',
          deterministicJson: { completeness: 100, missingInputs: [] },
          updatedAt: new Date('2026-01-01'),
        })),
      });
    }
    if (/FROM\s+cmc_source_objects/i.test(text)) {
      return Promise.resolve({ rows: [{ sourceType: 'specification', count: '1' }] });
    }
    if (/FROM\s+cmc_contradictions/i.test(text)) return Promise.resolve({ rows: [] });
    // Governed artifacts, and the uploaded-source query that follows it.
    if (/category = 'source'/.test(text)) return Promise.resolve({ rows: [] });
    return Promise.resolve({
      rows: sections
        .filter(s => s.artifact_status)
        .map(s => ({
          id: 1,
          artifactId: `art-${s.section_key}`,
          ctdSection: s.section_key,
          status: s.artifact_status,
          title: s.section_key,
          updatedAt: new Date('2026-01-01'),
        })),
    });
  });
}

const summary = async () => {
  const res = await request(app).get('/api/cmc/module3-build/build-state/proj-1');
  expect(res.status).toBe(200);
  return res.body.data.summary as {
    totalSections: number;
    readySections: number;
    staleSections: number;
    buildableSections: number;
    readinessPercent: number;
  };
};

/** The final-export gate's own rule, stated once so the tests compare to it. */
const gateApproved = (s: SectionFixture) => s.approval_state === 'approved' && !s.stale;

beforeEach(() => mockQuery.mockReset());

describe('Module 3 readiness agrees with the export gate', () => {
  it('counts an approved, fresh section as ready', async () => {
    const sections: SectionFixture[] = [
      { section_key: '3.2.S.1', approval_state: 'approved', stale: false },
      { section_key: '3.2.S.2', approval_state: 'draft', stale: false },
    ];
    wire(sections);
    const s = await summary();
    expect(s.readySections).toBe(sections.filter(gateApproved).length);
    expect(s.readySections).toBe(1);
  });

  it('does NOT count a section whose ARTIFACT is locked but which was never approved', async () => {
    // This is the defect. `buildState` would be 'locked' here — derived from the
    // editor's document lifecycle — and the old count treated that as ready,
    // while the gate would refuse the project.
    const sections: SectionFixture[] = [
      { section_key: '3.2.S.1', approval_state: 'draft', stale: false, artifact_status: 'locked' },
    ];
    wire(sections);
    const s = await summary();
    expect(s.readySections).toBe(0);
    expect(s.readySections).toBe(sections.filter(gateApproved).length);
    expect(s.readinessPercent).toBe(0);
    // And it is still work to do, not something finished.
    expect(s.buildableSections).toBeGreaterThanOrEqual(1);
  });

  it('does NOT count a section that went stale AFTER approval', async () => {
    // The gate refuses on exactly this ("went stale after approval and must be
    // re-approved"), so readiness must not report it as done.
    const sections: SectionFixture[] = [
      { section_key: '3.2.S.1', approval_state: 'approved', stale: true },
      { section_key: '3.2.S.2', approval_state: 'approved', stale: false },
    ];
    wire(sections);
    const s = await summary();
    expect(s.readySections).toBe(1);
    expect(s.readySections).toBe(sections.filter(gateApproved).length);
    // The stale-after-approval one is back to being work.
    expect(s.buildableSections).toBeGreaterThanOrEqual(1);
  });

  it('counts an approved section whose artifact is also locked', async () => {
    // The mirror of the defect: reading the display state would have made
    // 'locked' win the priority order and hide a genuinely approved section
    // behind an artifact lifecycle value.
    const sections: SectionFixture[] = [
      { section_key: '3.2.S.1', approval_state: 'approved', stale: false, artifact_status: 'locked' },
    ];
    wire(sections);
    const s = await summary();
    expect(s.readySections).toBe(1);
  });

  it('reports 100% only when the gate would let every section through', async () => {
    const allGood: SectionFixture[] = [
      { section_key: '3.2.S.1', approval_state: 'approved', stale: false },
      { section_key: '3.2.S.2', approval_state: 'approved', stale: false },
    ];
    wire(allGood);
    const good = await summary();
    expect(good.readySections).toBe(2);

    // One section moves to review, and the ready count must drop with it.
    mockQuery.mockReset();
    wire([...allGood.slice(0, 1), { section_key: '3.2.S.2', approval_state: 'review', stale: false }]);
    const s = await summary();
    expect(s.readySections).toBe(1);
    expect(s.readySections).toBeLessThan(good.readySections);
    // The route reports every CTD section, so a project with two compiled
    // sections is never 100% ready — which is itself correct.
    expect(s.readinessPercent).toBe(Math.round((s.readySections / s.totalSections) * 100));
  });
});
