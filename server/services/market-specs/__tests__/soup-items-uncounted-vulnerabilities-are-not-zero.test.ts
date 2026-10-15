/**
 * The SOUP check counts only what was recorded (2026-10-15).
 *
 * It was assessSbom in regulatory/iec-62304-software.ts, the second IEC 62304
 * engine (deleted; its route POST /api/ivd-lifecycle/software/sbom now runs this).
 * There an item nobody had counted added `knownVulnerabilities ?? 0` to the
 * total, any truthy flag ('no' included) read as documented, and the result was
 * labelled `submissionReady`. The first case is the deleted test's.
 */
import { describe, it, expect } from 'vitest';
import { assessSoupItems } from '../software-lifecycle';

describe('assessSoupItems', () => {
  it('is not complete with an unevaluated anomaly list, and sums counted vulnerabilities', () => {
    const r = assessSoupItems([
      { name: 'openssl', version: '3.0', requirementsDocumented: true, anomaliesEvaluated: false, knownVulnerabilities: 2 },
    ]);
    expect(r).toMatchObject({ complete: false, totalKnownVulnerabilities: 2, unevaluatedAnomalies: ['openssl@3.0'], vulnerabilityCountNotRecorded: [] });
  });

  it('states no total when an item was not counted, and names the item', () => {
    const r = assessSoupItems([
      { name: 'openssl', version: '3.0', requirementsDocumented: true, anomaliesEvaluated: true, knownVulnerabilities: 2 },
      { name: 'zlib', version: '1.3', requirementsDocumented: true, anomaliesEvaluated: true, knownVulnerabilities: null },
    ]);
    expect(r.totalKnownVulnerabilities).toBeNull();
    expect(r.vulnerabilityCountNotRecorded).toEqual(['zlib@1.3']);
    expect(r.complete).toBe(true);
  });

  it('counts only true as a recorded flag', () => {
    const r = assessSoupItems([{ name: 'zlib', version: '1.3', requirementsDocumented: 'no' as never, anomaliesEvaluated: 1 as never, knownVulnerabilities: 0 }]);
    expect(r).toMatchObject({ missingRequirements: ['zlib@1.3'], unevaluatedAnomalies: ['zlib@1.3'], complete: false, totalKnownVulnerabilities: 0 });
  });

  it('is not complete, and states no total, with no items listed', () => {
    expect(assessSoupItems([])).toMatchObject({ componentCount: 0, complete: false, totalKnownVulnerabilities: null });
  });

  it('refuses an unreadable count or an unnamed item', () => {
    expect(() => assessSoupItems([{ name: 'zlib', version: '1.3', knownVulnerabilities: '2' as never }])).toThrow(/knownVulnerabilities must be a whole number/);
    expect(() => assessSoupItems([{ name: 'zlib', version: '1.3', knownVulnerabilities: -1 }])).toThrow(/knownVulnerabilities/);
    expect(() => assessSoupItems([{ version: '1.3' } as never])).toThrow(/SOUP item 0: name and version are required/);
  });
});
