/**
 * Risk-management advisor — unit tests. Deterministic; verifies program
 * resolution (explicit + via jurisdiction + alias), toolbox filtering by
 * jurisdiction, routine/additional tiering, and the advisory caveat.
 */
import { describe, it, expect } from 'vitest';
import { adviseRiskManagement, listRiskManagementPrograms } from '../risk-management';

describe('adviseRiskManagement', () => {
  it('resolves REMS and surfaces ETASU + assessment timetable', () => {
    const r = adviseRiskManagement({ program: 'rems' });
    expect(r.resolved.program).toBe('rems');
    expect(r.brief).toContain('Elements To Assure Safe Use');
    expect(r.brief).toContain('Timetable');
    expect(r.brief).toContain('Advisory only');
  });

  it('infers the EU RMP from jurisdiction=eu', () => {
    const r = adviseRiskManagement({ jurisdiction: 'eu' });
    expect(r.resolved.program).toBe('eu_rmp');
    expect(r.resolved.jurisdiction).toBe('eu');
    expect(r.brief).toContain('Safety specification');
  });

  it('maps jurisdiction synonyms (fda → us → REMS)', () => {
    const r = adviseRiskManagement({ jurisdiction: 'fda' });
    expect(r.resolved.jurisdiction).toBe('us');
    expect(r.resolved.program).toBe('rems');
  });

  it('resolves an alias (gvp module v → eu_rmp)', () => {
    const r = adviseRiskManagement({ program: 'gvp module v' });
    expect(r.resolved.program).toBe('eu_rmp');
  });

  it('separates routine from additional risk-minimization tools', () => {
    const r = adviseRiskManagement({ program: 'rems' });
    const routine = r.tools.filter(t => t.tier === 'routine').map(t => t.id);
    const additional = r.tools.filter(t => t.tier === 'additional').map(t => t.id);
    expect(routine).toContain('labeling');
    expect(additional).toContain('controlled_access');
    expect(additional).toContain('pregnancy_prevention');
  });

  it('lists the program + tool catalog', () => {
    const cat = listRiskManagementPrograms();
    expect(cat.programs.map(p => p.id)).toEqual(expect.arrayContaining(['rems', 'eu_rmp']));
    expect(cat.tools.map(t => t.id)).toContain('registry');
  });
});
