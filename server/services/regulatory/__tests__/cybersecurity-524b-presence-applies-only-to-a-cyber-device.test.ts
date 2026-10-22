/**
 * §524B artifact presence applies only to a cyber device, reads the one artifact
 * list, and is labelled as presence (2026-10-15).
 *
 * assess524bReadiness (cybersecurity-524b.ts) scored any device against eight
 * camelCase artifact ids of its own (threatModel, secureByDesign, …) that differ
 * from the cybersecurity documentation in market-specs/software-lifecycle.ts
 * (CYBER_ITEMS: sbom, threat_model, …). It never read cyber-device status, which
 * fdaCybersecurityDocumentation keys §524B on, and it called the share of artifacts
 * present `readinessScore` and all-present `ready`: completeness labelled readiness.
 */
import { describe, it, expect } from 'vitest';
import * as cyber524b from '../cybersecurity-524b';
import { CYBER_524B_ARTIFACTS, assess524bArtifacts } from '../cybersecurity-524b';
import { fdaCybersecurityDocumentation } from '../../market-specs/software-lifecycle';

const CYBER_ITEM_IDS = fdaCybersecurityDocumentation({ cyberDevice: true }).items.map((i) => i.id);

describe('§524B artifacts', () => {
  it('are the cybersecurity documentation ids of software-lifecycle (CYBER_ITEMS): one list', () => {
    expect([...CYBER_524B_ARTIFACTS], 'the §524B artifact ids differ from CYBER_ITEMS').toEqual(CYBER_ITEM_IDS);
  });

  it('state no §524B figure when cyber-device status is not stated', () => {
    const r = assess524bArtifacts({}, ['sbom', 'threat_model']);
    expect(r).toMatchObject({ status: 'undetermined', present: ['sbom', 'threat_model'], gaps: null, completeness: null, allPresent: null });
    expect(r.rationale).toMatch(/cyber device/i);
  });

  it('require nothing of a device recorded as not a cyber device', () => {
    const r = assess524bArtifacts({ cyberDevice: false }, []);
    expect(r).toMatchObject({ status: 'not_required', gaps: null, completeness: null, allPresent: null });
  });

  it('for a cyber device, report the share present as completeness, not readiness', () => {
    const r = assess524bArtifacts({ cyberDevice: true }, ['sbom', 'threat_model']);
    expect(r.status).toBe('required');
    expect(r.completeness).toBeCloseTo(2 / CYBER_ITEM_IDS.length, 10);
    expect(r.gaps).toEqual(CYBER_ITEM_IDS.filter((id) => id !== 'sbom' && id !== 'threat_model'));
    expect(r.allPresent).toBe(false);
    expect(r).not.toHaveProperty('readinessScore');
    expect(r).not.toHaveProperty('ready');
  });

  it('call every required artifact present allPresent — presence, not a readiness verdict', () => {
    const r = assess524bArtifacts({ cyberDevice: true }, CYBER_ITEM_IDS);
    expect(r).toMatchObject({ status: 'required', gaps: [], completeness: 1, allPresent: true });
    expect(r).not.toHaveProperty('ready');
  });

  it('refuse an id that is not a §524B artifact, naming it', () => {
    expect(() => assess524bArtifacts({ cyberDevice: true }, ['threatModel'])).toThrow(/threatModel/);
  });

  it('have no readiness-labelled assessor', () => {
    expect(Object.keys(cyber524b)).not.toContain('assess524bReadiness');
  });
});
