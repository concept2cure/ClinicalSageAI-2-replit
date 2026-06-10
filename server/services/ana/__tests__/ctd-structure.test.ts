/**
 * CTD / eCTD structure advisor — unit tests. Deterministic; verifies module
 * lookup (id/number/alias), free-text document placement, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseCtdStructure, listCtdModules } from '../ctd-structure';

describe('adviseCtdStructure', () => {
  it('resolves a module by alias (cmc → m3)', () => {
    const r = adviseCtdStructure({ module: 'cmc' });
    expect(r.resolved.module).toBe('m3');
    expect(r.brief).toContain('Drug Substance');
  });

  it('resolves a module by number', () => {
    const r = adviseCtdStructure({ module: '5' });
    expect(r.resolved.module).toBe('m5');
    expect(r.brief).toContain('Clinical study reports');
  });

  it('places a clinical study report into Module 5', () => {
    const r = adviseCtdStructure({ document: 'Phase 3 efficacy clinical study report (CSR)' });
    expect(r.placement[0].id).toBe('m5');
    expect(r.brief).toContain('Suggested placement');
  });

  it('places a stability/specification document into Module 3', () => {
    const r = adviseCtdStructure({ document: 'drug product stability and specification data' });
    expect(r.placement[0].id).toBe('m3');
  });

  it('routes labeling/administrative docs to the regional Module 1', () => {
    const r = adviseCtdStructure({ document: 'cover letter and prescribing information labeling' });
    expect(r.placement[0].id).toBe('m1');
  });

  it('lists all five modules with regional flag on Module 1', () => {
    const mods = listCtdModules();
    expect(mods.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(mods.find(m => m.id === 'm1')?.regional).toBe(true);
    expect(mods.find(m => m.id === 'm3')?.regional).toBe(false);
  });
});
