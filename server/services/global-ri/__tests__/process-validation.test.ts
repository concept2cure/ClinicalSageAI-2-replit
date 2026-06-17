/**
 * Process-validation expert — lifecycle/qualification framework per region.
 */

import { describe, it, expect } from 'vitest';
import {
  getProcessValidationFramework,
  getValidationStage,
  PV_REGIONS,
  FDA_PV_STAGES,
  EU_QUALIFICATION_STAGES,
  type PvRegion,
} from '../process-validation';

describe('getProcessValidationFramework — FDA', () => {
  it('returns the 3-stage product lifecycle with a truthy citation', () => {
    const f = getProcessValidationFramework('FDA');
    expect(f.citation).toBeTruthy();
    expect(f.model).toContain('3-stage');
    expect(f.stages.map((s) => s.id)).toEqual([...FDA_PV_STAGES]);
  });

  it('Stage 2 (Process Qualification) activities mention PPQ', () => {
    const f = getProcessValidationFramework('FDA');
    const stage2 = f.stages.find((s) => s.id === 'stage_2_process_qualification')!;
    expect(stage2.activities.join(' ')).toMatch(/PPQ|Process Performance Qualification/);
  });

  it('approaches mention continued process verification', () => {
    const f = getProcessValidationFramework('FDA');
    expect(f.approaches.join(' ')).toMatch(/Continued Process Verification|CPV/);
  });
});

describe('getProcessValidationFramework — EU', () => {
  it('returns Annex 15 qualification stages with a truthy citation', () => {
    const f = getProcessValidationFramework('EU');
    expect(f.citation).toBeTruthy();
    expect(f.citation).toContain('Annex 15');
    expect(f.stages.map((s) => s.id)).toEqual([...EU_QUALIFICATION_STAGES]);
  });

  it('mentions DQ/IQ/OQ/PQ', () => {
    const f = getProcessValidationFramework('EU');
    expect(f.stages.map((s) => s.id)).toEqual(['DQ', 'IQ', 'OQ', 'PQ']);
  });

  it('lists a continuous process verification approach', () => {
    const f = getProcessValidationFramework('EU');
    expect(f.approaches.join(' ')).toMatch(/[Cc]ontinuous process verification/);
  });
});

describe('getValidationStage', () => {
  it("FDA stage_2_process_qualification activities mention PPQ / performance qualification", () => {
    const stage = getValidationStage('FDA', 'stage_2_process_qualification');
    expect(stage.activities.join(' ')).toMatch(/PPQ|[Pp]erformance [Qq]ualification/);
  });

  it('EU OQ returns the Operational Qualification stage', () => {
    const stage = getValidationStage('EU', 'OQ');
    expect(stage.id).toBe('OQ');
    expect(stage.title).toContain('Operational Qualification');
  });
});

describe('catalog completeness', () => {
  it('every region framework has stages, approaches, and citations', () => {
    for (const r of PV_REGIONS) {
      const f = getProcessValidationFramework(r);
      expect(f.stages.length).toBeGreaterThan(0);
      expect(f.approaches.length).toBeGreaterThan(0);
      for (const s of f.stages) {
        expect(s.id).toBeTruthy();
        expect(s.title).toBeTruthy();
        expect(s.activities.length).toBeGreaterThan(0);
        expect(s.citation).toBeTruthy();
      }
    }
  });
});

describe('errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() => getProcessValidationFramework('XYZ' as PvRegion)).toThrow();
    expect(() => getValidationStage('XYZ' as PvRegion, 'OQ')).toThrow();
  });

  it('throws for an unknown stage id', () => {
    expect(() => getValidationStage('FDA', 'nope')).toThrow();
    expect(() => getValidationStage('EU', 'stage_1_process_design')).toThrow();
  });

  it('is deterministic', () => {
    expect(getProcessValidationFramework('FDA')).toEqual(getProcessValidationFramework('FDA'));
    expect(getValidationStage('EU', 'OQ')).toEqual(getValidationStage('EU', 'OQ'));
  });
});
