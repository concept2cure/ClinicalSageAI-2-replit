/**
 * §524B cybersecurity — SBOM completeness (NTIA elements) and §524B artifact
 * presence. (Cyber-device status and the one artifact list:
 * cybersecurity-524b-presence-applies-only-to-a-cyber-device.test.ts.)
 */

import { describe, it, expect } from 'vitest';
import { scoreSbomCompleteness, assess524bArtifacts, CYBER_524B_ARTIFACTS } from '../cybersecurity-524b';

describe('scoreSbomCompleteness', () => {
  it('a fully-populated SBOM scores 1', () => {
    const r = scoreSbomCompleteness({
      components: [
        { componentName: 'openssl', version: '3.0.8', supplier: 'OpenSSL', uniqueIdentifier: 'pkg:generic/openssl@3.0.8' },
      ],
      author: 'Acme',
      timestamp: '2026-06-08',
      dependencyRelationshipsDocumented: true,
    });
    expect(r.completenessScore).toBeCloseTo(1, 10);
    expect(r.componentGaps).toEqual([]);
    expect(r.documentGaps).toEqual([]);
  });

  it('reports per-component and document gaps', () => {
    const r = scoreSbomCompleteness({
      components: [{ componentName: 'zlib', supplier: 'zlib' }], // missing version + uniqueIdentifier
      // missing author, timestamp, dependency relationships
    });
    expect(r.componentGaps[0].missingFields).toEqual(['version', 'uniqueIdentifier']);
    expect(r.documentGaps).toEqual(['author', 'timestamp', 'dependencyRelationships']);
    // present = 2 (name,supplier) of 4 component + 0 of 3 doc = 2/7
    expect(r.completenessScore).toBeCloseTo(2 / 7, 8);
  });

  it('counts components carrying known vulnerabilities', () => {
    const r = scoreSbomCompleteness({
      components: [
        { componentName: 'log4j', version: '2.14', supplier: 'Apache', uniqueIdentifier: 'x', knownVulnerabilities: ['CVE-2021-44228'] },
        { componentName: 'safe', version: '1', supplier: 's', uniqueIdentifier: 'y' },
      ],
    });
    expect(r.vulnerableComponents).toEqual(['log4j']);
    expect(r.totalKnownVulnerabilities).toBe(1);
  });

  it('rejects an empty SBOM', () => {
    expect(() => scoreSbomCompleteness({ components: [] })).toThrow();
  });
});

// 2026-10-15: these pinned assess524bReadiness's `readinessScore`/`ready` over its own
// eight artifact ids for any device; they now pin presence for a cyber device.
describe('assess524bArtifacts (cyber device)', () => {
  it('all artifacts present → allPresent, completeness 1', () => {
    const r = assess524bArtifacts({ cyberDevice: true }, CYBER_524B_ARTIFACTS);
    expect(r.allPresent).toBe(true);
    expect(r.completeness).toBeCloseTo(1, 10);
    expect(r.gaps).toEqual([]);
  });

  it('missing artifacts appear as gaps and lower the share present', () => {
    const r = assess524bArtifacts({ cyberDevice: true }, ['sbom', 'threat_model']);
    expect(r.allPresent).toBe(false);
    expect(r.completeness).toBeCloseTo(2 / CYBER_524B_ARTIFACTS.length, 8);
    expect(r.gaps).toContain('cybersecurity_management_plan');
  });
});
