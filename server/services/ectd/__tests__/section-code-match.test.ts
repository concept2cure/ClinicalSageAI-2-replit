/**
 * A required CTD section is a NODE; a placed leaf is a document under it.
 *
 * The package validator compared the two exactly (`presentSections.has('m3.2.S')`)
 * while the Module 3 placement writes leaves as 'm3.2.S.1' … 'm3.2.S.7'. Nothing
 * ever writes a leaf at the parent code, so a sequence carrying every placed
 * Module 3 leaf was reported MISSING_REQUIRED_SECTION on drug substance and
 * drug product — while the compile path, which had the prefix rule, reported
 * the same sequence complete. Two verdicts, one sequence.
 */
import { describe, expect, it } from 'vitest';

import { anyLeafSatisfies, sectionMatches } from '../section-code-match';
import { validatePackage, type ECTDLeaf } from '../ectd4-validator';

describe('sectionMatches', () => {
  it('a leaf under the required node satisfies it', () => {
    expect(sectionMatches('m3.2.S.1', 'm3.2.S')).toBe(true);
    expect(sectionMatches('m3.2.S.4.4', 'm3.2.S')).toBe(true);
    expect(sectionMatches('m3.2.P.8', 'm3.2.P')).toBe(true);
  });

  it('the node satisfies itself', () => {
    expect(sectionMatches('m3.2.S', 'm3.2.S')).toBe(true);
  });

  it('reads both spellings — the placement writes the m-prefix, other writers do not', () => {
    expect(sectionMatches('3.2.S.1', 'm3.2.S')).toBe(true);
    expect(sectionMatches('m3.2.s.1', 'm3.2.S')).toBe(true);
    expect(sectionMatches('M3.2.S.1', '3.2.S')).toBe(true);
  });

  it('respects the boundary — a longer code is not a child unless a separator follows', () => {
    /* Without this, 'm3.2.SX' would satisfy 'm3.2.S' and a leaf filed under the
       wrong node would silently discharge a required section. */
    expect(sectionMatches('m3.2.SX', 'm3.2.S')).toBe(false);
    expect(sectionMatches('m3.2.P1', 'm3.2.P')).toBe(false);
    expect(sectionMatches('m3.2.S', 'm3.2.S.1')).toBe(false);
  });

  it('nothing satisfies an empty code, in either direction', () => {
    expect(sectionMatches('', 'm3.2.S')).toBe(false);
    expect(sectionMatches('m3.2.S.1', '')).toBe(false);
    expect(sectionMatches(null, 'm3.2.S')).toBe(false);
    expect(sectionMatches(undefined, 'm3.2.S')).toBe(false);
  });

  it('anyLeafSatisfies asks the same question of a set', () => {
    const placed = ['m1.1', 'm3.2.S.1', 'm3.2.S.4', 'm3.2.P.1'];
    expect(anyLeafSatisfies(placed, 'm3.2.S')).toBe(true);
    expect(anyLeafSatisfies(placed, 'm3.2.P')).toBe(true);
    expect(anyLeafSatisfies(placed, 'm2.3')).toBe(false);
  });
});

describe('validatePackage — a placed Module 3 is not missing Module 3', () => {
  /** A leaf in the shape the validator reads, filename conventions included. */
  const leaf = (sectionCode: string): ECTDLeaf => {
    const base = sectionCode.replace(/^m/, '').replace(/\./g, '-').toLowerCase();
    return {
      sectionCode,
      title: `Module 3 — ${sectionCode}`,
      checksum: 'd41d8cd98f00b204e9800998ecf8427e',
      checksumType: 'md5',
      operation: 'new',
      filePath: `m3/32-body-data/${base}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 12_345,
    };
  };

  /** The section codes place-module3-into-submission actually writes. */
  const MODULE3_PLACED = [
    'm3.2.S.1', 'm3.2.S.2', 'm3.2.S.3', 'm3.2.S.4', 'm3.2.S.5', 'm3.2.S.6', 'm3.2.S.7',
    'm3.2.P.1', 'm3.2.P.2', 'm3.2.P.3', 'm3.2.P.4', 'm3.2.P.5', 'm3.2.P.6', 'm3.2.P.7', 'm3.2.P.8',
    'm3.2.A.1', 'm3.2.A.2', 'm3.2.A.3', 'm3.2.R.1.US',
  ];

  it('does NOT report drug substance or drug product missing when every leaf is placed', () => {
    const result = validatePackage(MODULE3_PLACED.map(leaf), 'IND');
    const missing = result.findings
      .filter((f) => f.code === 'MISSING_REQUIRED_SECTION')
      .map((f) => f.sectionCode);
    expect(missing).not.toContain('m3.2.S');
    expect(missing).not.toContain('m3.2.P');
  });

  it('still reports a section that genuinely has no leaf', () => {
    // The check must not have been softened into never firing.
    const result = validatePackage(MODULE3_PLACED.map(leaf), 'IND');
    const missing = result.findings
      .filter((f) => f.code === 'MISSING_REQUIRED_SECTION')
      .map((f) => f.sectionCode);
    expect(missing).toContain('m2.3');
    expect(missing).toContain('m1.1');
  });

  it('reports drug substance missing when only drug product is placed', () => {
    const result = validatePackage(['m3.2.P.1', 'm3.2.P.5'].map(leaf), 'IND');
    const missing = result.findings
      .filter((f) => f.code === 'MISSING_REQUIRED_SECTION')
      .map((f) => f.sectionCode);
    expect(missing).toContain('m3.2.S');
    expect(missing).not.toContain('m3.2.P');
  });
});
