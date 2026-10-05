/**
 * IVD/IVDR and device types in the completeness engine (2026-10-05,
 * g-validate-completeness-canonical; DECISIONS.md #13).
 *
 * This file used to pin an IVDR branch inside validate-completeness-engine.ts:
 * a hand-kept annex list that filed PMPF under Annex XIV (it is IVDR Annex XIII
 * Part B) and stability under its own heading (Annex II 6.3), and whose items
 * all carried module 'A', so none of them could ever be a blocker — an empty
 * IVDR file came back 'conditional_go'. Its only assertion on the verdict was
 * `not.toBe('go')`, which that wrong answer passed.
 *
 * The IVDR annex record lives in the MDR/IVDR tech-doc engine
 * (server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts, reachable at
 * GET /api/submissions/sequences/:seqId/technical-file?regulation=ivdr). A
 * second, wrong annex list here is deleted; the completeness engine answers
 * `not_assessed` and points there. Devices (510(k), De Novo, PMA) likewise point
 * at the eSTAR filing-readiness engine.
 */

import { describe, it, expect } from 'vitest';
import { ValidateCompletenessEngine } from '../validate-completeness-engine';

const engine = new ValidateCompletenessEngine();

describe('IVDR in the completeness engine', () => {
  it('an empty IVDR file is not_assessed — never conditional_go or go', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    expect(res.goNoGo.decision).toBe('not_assessed');
    expect(res.goNoGo.decision).not.toBe('conditional_go');
    expect(res.goNoGo.readinessScore).toBeNull();
  });

  it('points at the MDR/IVDR tech-doc engine, the one IVDR annex record', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    if (res.assessment.status !== 'not_assessed') throw new Error('IVDR was assessed by the CTD engine');
    expect(res.assessment.assessWith).toMatchObject({
      engine: 'assembleTechDoc',
      module: 'server/services/pathway-engines/mdr-ivdr/tech-doc-assembler.ts',
    });
    expect(res.assessment.assessWith?.route).toMatch(/technical-file\?regulation=ivdr$/);
  });

  it('does not borrow the pharma CTD checklist', async () => {
    const res = await engine.validate({ submissionType: 'IVDR', presentSections: [], targetAgency: 'EU' });
    expect(res.checklist).toEqual([]);
    expect(JSON.stringify(res)).not.toMatch(/Drug Substance/i);
  });
});

describe('device types in the completeness engine', () => {
  it('510(k) is not_assessed and points at eSTAR filing readiness, not invented CTD modules', async () => {
    const res = await engine.validate({ submissionType: '510(k)', presentSections: [], targetAgency: 'FDA' });
    expect(res.goNoGo.decision).toBe('not_assessed');
    if (res.assessment.status !== 'not_assessed') throw new Error('510(k) was assessed by the CTD engine');
    expect(res.assessment.assessWith).toMatchObject({
      engine: 'assessEstarFilingReadiness',
      route: 'POST /api/510k/estar/filing-readiness',
    });
    expect(JSON.stringify(res)).not.toMatch(/3601/);
  });
});
