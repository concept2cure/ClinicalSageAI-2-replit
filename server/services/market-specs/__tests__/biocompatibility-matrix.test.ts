/**
 * Tests for the ISO 10993-1 biocompatibility matrix — proves the endpoint set is
 * deterministic and matches the well-established anchor cases.
 */
import { describe, it, expect } from 'vitest';
import { BIOCOMP_ENDPOINTS, requiredBiocompEndpoints, contactNatures } from '../biocompatibility-matrix';

const ids = (nature: Parameters<typeof requiredBiocompEndpoints>[0], duration: Parameters<typeof requiredBiocompEndpoints>[1]) =>
  requiredBiocompEndpoints(nature, duration).endpoints.map((e) => e.id);

describe('biocompatibility matrix — anchor cases', () => {
  it('intact-skin limited contact → cytotoxicity, sensitization, irritation only', () => {
    expect(ids('skin', 'limited')).toEqual(['cytotoxicity', 'sensitization', 'irritation']);
  });

  it('a blood-contacting device includes haemocompatibility', () => {
    expect(ids('circulating_blood', 'limited')).toContain('hemocompatibility');
    expect(ids('implant_blood', 'long_term')).toContain('hemocompatibility');
  });

  it('a permanent implant in tissue/bone includes implantation, chronic toxicity and carcinogenicity', () => {
    const e = ids('implant_tissue_bone', 'long_term');
    expect(e).toEqual(expect.arrayContaining(['implantation', 'genotoxicity', 'chronic_toxicity', 'carcinogenicity']));
  });

  it('limited tissue/bone contact does NOT trigger implantation (duration too short)', () => {
    expect(ids('tissue_bone_dentin', 'limited')).not.toContain('implantation');
  });

  it('permanent circulating-blood contact escalates to chronic toxicity + carcinogenicity', () => {
    const e = ids('circulating_blood', 'long_term');
    expect(e).toEqual(expect.arrayContaining(['hemocompatibility', 'acute_systemic_toxicity', 'subacute_subchronic_toxicity', 'genotoxicity', 'chronic_toxicity', 'carcinogenicity']));
  });
});

describe('biocompatibility matrix — invariants', () => {
  it('is deterministic and emits endpoints in canonical order with a caveat', () => {
    const a = requiredBiocompEndpoints('implant_blood', 'long_term');
    const b = requiredBiocompEndpoints('implant_blood', 'long_term');
    expect(a).toEqual(b);
    const order = BIOCOMP_ENDPOINTS.map((e) => e.id);
    const got = a.endpoints.map((e) => e.id);
    expect(got).toEqual([...got].sort((x, y) => order.indexOf(x) - order.indexOf(y)));
    expect(a.caveat).toMatch(/ISO 10993-1/);
  });

  it('escalation is monotonic in duration for the same nature', () => {
    for (const nature of contactNatures()) {
      const limited = new Set(ids(nature, 'limited'));
      const prolonged = new Set(ids(nature, 'prolonged'));
      const longTerm = new Set(ids(nature, 'long_term'));
      for (const e of limited) expect(prolonged.has(e)).toBe(true);
      for (const e of prolonged) expect(longTerm.has(e)).toBe(true);
    }
  });

  it('every base contact addresses cytotoxicity, sensitization, irritation', () => {
    for (const nature of contactNatures()) {
      const e = ids(nature, 'limited');
      expect(e).toEqual(expect.arrayContaining(['cytotoxicity', 'sensitization', 'irritation']));
    }
  });
});
