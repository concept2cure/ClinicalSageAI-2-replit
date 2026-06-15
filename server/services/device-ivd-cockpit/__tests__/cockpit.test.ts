import { describe, it, expect } from 'vitest';
import { assessDeviceProgram, type CockpitInputLeaf } from '../cockpit';

// A 510(k)-complete content set (also covers most PMA/MDR shared sections).
const k510Complete: CockpitInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter' },
  { sectionCode: '2', title: 'Indications for use' },
  { sectionCode: '3', title: 'Device description' },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use' },
  { sectionCode: '5', title: 'Biocompatibility evaluation' },
  { sectionCode: '6', title: 'Performance testing — bench' },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate' },
];

describe('assessDeviceProgram (device cockpit)', () => {
  it('assesses the default device pathway set and recommends the most-ready', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'device' });
    expect(a.pathways.map((p) => p.pathway)).toEqual(['510k', 'de_novo', 'pma', 'mdr']);
    const k510 = a.pathways.find((p) => p.pathway === '510k');
    expect(k510?.ready).toBe(true);
    expect(k510?.completeness).toBe(100);
    expect(a.recommendedPathway).toBe('510k');
  });

  it('uses the IVDR pathway for IVDs (not MDR)', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'ivd' });
    expect(a.pathways.map((p) => p.pathway)).toEqual(['510k', 'de_novo', 'pma', 'ivdr']);
    expect(a.pathways.find((p) => p.pathway === 'mdr')).toBeUndefined();
  });

  it('computes per-pathway completeness and missing sections honestly', () => {
    const a = assessDeviceProgram({ leaves: [{ sectionCode: '1', title: 'Cover letter' }], variant: 'device' });
    const pma = a.pathways.find((p) => p.pathway === 'pma');
    expect(pma?.ready).toBe(false);
    expect(pma?.completeness).toBeGreaterThanOrEqual(0);
    expect(pma?.completeness).toBeLessThan(100);
    expect(pma?.missingRequired.length).toBeGreaterThan(0);
    expect(a.blockers.length).toBeGreaterThan(0);
  });

  it('honours an explicit pathway subset', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'device', pathways: ['pma'] });
    expect(a.pathways).toHaveLength(1);
    expect(a.pathways[0].pathway).toBe('pma');
  });

  it('overlays target-market readiness and surfaces cannot-transmit', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'device', market: 'us-fda', availableArtifacts: [] });
    expect(a.market).toBeDefined();
    expect(a.blockers.join(' ')).toMatch(/cannot transmit/i);
    expect(a.provenance.modules).toContain('global-markets/market-readiness');
  });

  it('has no recommendation and no market when nothing is provided', () => {
    const a = assessDeviceProgram({ leaves: [], variant: 'device' });
    expect(a.recommendedPathway).toBeUndefined();
    expect(a.market).toBeUndefined();
  });
});
