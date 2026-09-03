import { describe, it, expect } from 'vitest';
import { assessDeviceProgram, type CockpitInputLeaf } from '../cockpit';

// A 510(k)-complete content set (also covers most PMA/MDR shared sections).
// All finalized/substantive content.
const k510Complete: CockpitInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
  { sectionCode: '2', title: 'Indications for use', substantive: true },
  { sectionCode: '3', title: 'Device description', substantive: true },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
  { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
  { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
  { sectionCode: '1b', title: 'CDRH cover sheet 3514', substantive: true },
  { sectionCode: '1c', title: 'MDUFA user fee cover sheet 3601', substantive: true },
  { sectionCode: '2b', title: 'Truthful and accurate statement', substantive: true },
  { sectionCode: '4b', title: 'Risk management file', substantive: true },
  { sectionCode: '8', title: '510(k) Summary', substantive: true },
];

/* A device that is none of the seven conditional things. Without these the
   conditional sections are undetermined, and an undetermined section is a gap
   rather than a satisfied one (W1-5). */
const PLAIN_DEVICE = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
} as const;


describe('assessDeviceProgram (device cockpit)', () => {
  it('assesses the default device pathway set and recommends the most-ready', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'device', deviceFlags: PLAIN_DEVICE });
    expect(a.pathways.map((p) => p.pathway)).toEqual(['510k', 'de_novo', 'pma', 'mdr']);
    const k510 = a.pathways.find((p) => p.pathway === '510k');
    expect(k510?.ready).toBe(true);
    expect(k510?.completeness).toBe(100);
    expect(a.recommendedPathway).toBe('510k');
  });

  it('uses the IVDR pathway for IVDs (not MDR)', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'ivd', deviceFlags: PLAIN_DEVICE });
    expect(a.pathways.map((p) => p.pathway)).toEqual(['510k', 'de_novo', 'pma', 'ivdr']);
    expect(a.pathways.find((p) => p.pathway === 'mdr')).toBeUndefined();
  });

  it('computes per-pathway completeness and missing sections honestly', () => {
    const a = assessDeviceProgram({ leaves: [{ sectionCode: '1', title: 'Cover letter', substantive: true }], variant: 'device' });
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

  it('overlays target-market readiness and surfaces market blockers', () => {
    const a = assessDeviceProgram({ leaves: k510Complete, variant: 'device', market: 'us-fda', availableArtifacts: [] });
    expect(a.market).toBeDefined();
    expect(a.blockers.length).toBeGreaterThan(0);
    expect(a.provenance.modules).toContain('global-markets/market-readiness');
  });

  it('has no recommendation and no market when nothing is provided', () => {
    const a = assessDeviceProgram({ leaves: [], variant: 'device' });
    expect(a.recommendedPathway).toBeUndefined();
    expect(a.market).toBeUndefined();
  });
});
