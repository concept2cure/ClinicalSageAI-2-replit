/**
 * Tests for the universal pathway manifest — proves every pathway engine result
 * (flat sections AND the structured CTIS dossier) projects to one uniform,
 * ordered, deterministic table-of-contents.
 */
import { describe, it, expect } from 'vitest';
import { assessPathwayReadiness } from '../index';
import { buildPathwayManifest } from '../pathway-manifest';

const FLAT_PATHWAYS = [
  'estar_510k',
  'estar_de_novo',
  'mdr',
  'ivdr',
  'pmda_shonin',
  'pma',
  'prestar_q_sub',
  'prestar_ide',
  'prestar_513g',
] as const;

describe('buildPathwayManifest — flat pathways', () => {
  for (const pathway of FLAT_PATHWAYS) {
    it(`builds an ordered, deterministic manifest for ${pathway}`, () => {
      // A Q-Sub is refused without its sub-type; the manifest loop states one.
      const r = assessPathwayReadiness(
        pathway === 'prestar_q_sub' ? { pathway, leaves: [], qSubType: 'pre_submission' } : { pathway, leaves: [] },
      );
      const m = buildPathwayManifest(pathway, r.detail);

      expect(m.pathway).toBe(pathway);
      expect(m.framework).toBeTruthy();
      expect(m.entries.length).toBeGreaterThan(0);
      expect(m.totals.sections).toBe(m.entries.length);
      // Empty submission → not ready, every required slot missing, none present.
      expect(m.ready).toBe(false);
      expect(m.totals.requiredMissing).toBeGreaterThan(0);
      expect(m.totals.requiredPresent).toBe(0);
      // Paths numbered + unique.
      expect(m.entries[0].path).toMatch(/^01-/);
      const paths = m.entries.map((e) => e.path);
      expect(new Set(paths).size).toBe(paths.length);
      // Deterministic.
      const again = assessPathwayReadiness(
        pathway === 'prestar_q_sub' ? { pathway, leaves: [], qSubType: 'pre_submission' } : { pathway, leaves: [] },
      );
      expect(buildPathwayManifest(pathway, again.detail)).toEqual(m);
    });
  }

  it('marks a slot present (with sources) once a matching leaf exists', () => {
    const r = assessPathwayReadiness({
      pathway: 'pmda_shonin',
      leaves: [{ sectionCode: 'sted', title: 'Summary Technical Documentation', documentType: 'sted' }],
    });
    const m = buildPathwayManifest('pmda_shonin', r.detail);
    const sted = m.entries.find((e) => e.id === 'sted');
    expect(sted?.status).toBe('present');
    expect(sted?.sources.length).toBeGreaterThan(0);
    expect(m.totals.requiredPresent).toBeGreaterThan(0);
  });
});

describe('buildPathwayManifest — CTIS (structured Part I/II)', () => {
  it('flattens Part I and per-state Part II into grouped entries', () => {
    const r = assessPathwayReadiness({ pathway: 'ctis', leaves: [], memberStates: ['DE', 'FR'] });
    const m = buildPathwayManifest('ctis', r.detail);

    expect(m.pathway).toBe('ctis');
    expect(m.entries.some((e) => e.group === 'Part I')).toBe(true);
    expect(m.entries.some((e) => e.group === 'Part II — DE')).toBe(true);
    expect(m.entries.some((e) => e.group === 'Part II — FR')).toBe(true);
    expect(m.ready).toBe(false);
    expect(m.totals.requiredMissing).toBeGreaterThan(0);
    const paths = m.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length); // unique across both parts
  });
});

describe('buildPathwayManifest — guards', () => {
  it('throws on an unrecognized result shape', () => {
    expect(() => buildPathwayManifest('mdr', { nonsense: true })).toThrow(/Unrecognized/);
  });
});
