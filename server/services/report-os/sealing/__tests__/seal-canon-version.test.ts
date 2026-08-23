/**
 * Report seals across the canonicalization boundary — ledger L46, Class B.
 *
 * `verifySeal` recomputes a report's content hash and compares it to the stored
 * one, so moving the serializer without a version marker would make every
 * previously sealed report read as "modified since sealing" — the platform
 * accusing its own records of tampering. These tests exist to prove that did
 * not happen.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { buildSealedRecord, canonicalizeReport, verifySeal } from '../seal';
import type { RenderedReport } from '../../render/types';
import type { SealedRecord } from '../types';

const report = {
  sections: [
    {
      id: 's1',
      title: 'Findings',
      blocks: [{ kind: 'text', value: 'stable', provenance: [{ atomId: 'a1', kind: 'trial' }] }],
    },
  ],
} as unknown as RenderedReport;

/** The v1 serializer, reproduced here so the test does not depend on the impl. */
function legacyV1(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(legacyV1).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter(k => obj[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${legacyV1(obj[k])}`)
    .join(',')}}`;
}

describe('seals written before the serializer moved', () => {
  /** A record as it would have been stored: no canonVersion, v1 hash. */
  const legacyRecord: SealedRecord = {
    algorithm: 'sha256',
    contentHash: createHash('sha256').update(legacyV1(report)).digest('hex'),
    atoms: [],
    atomCount: 0,
    aiDisclosed: false,
    sealedAt: '2026-01-01T00:00:00.000Z',
  };

  it('still verify — the platform does not accuse its own records', () => {
    expect(verifySeal(report, legacyRecord).ok).toBe(true);
  });

  it('still detect tampering', () => {
    const tampered = JSON.parse(JSON.stringify(report));
    tampered.sections[0].blocks[0].value = 'changed';
    const result = verifySeal(tampered as RenderedReport, legacyRecord);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/modified since sealing/);
  });

  it('agree with the current serializer on ordinary JSON content', () => {
    // Measured, not assumed: seal.ts's v1 and shared/canonical-json produce
    // identical output for objects, arrays, strings, numbers, null, NaN and
    // absent keys. For a report made of those — which is every report that
    // round-tripped through JSON — re-pointing changes no hash at all.
    const asIfCurrent = createHash('sha256').update(canonicalizeReport(report)).digest('hex');
    expect(asIfCurrent).toBe(legacyRecord.contentHash);
  });
});

describe('seals written after', () => {
  it('declare their generation', () => {
    expect(buildSealedRecord(report).canonVersion).toBe(2);
  });

  it('verify, and still detect tampering', () => {
    const record = buildSealedRecord(report);
    expect(verifySeal(report, record).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(report));
    tampered.sections[0].blocks[0].value = 'changed';
    expect(verifySeal(tampered as RenderedReport, record).ok).toBe(false);
  });

  it('are insensitive to key order, which is why any of this is canonicalized', () => {
    const reordered = {
      sections: [
        {
          blocks: [{ provenance: [{ kind: 'trial', atomId: 'a1' }], value: 'stable', kind: 'text' }],
          title: 'Findings',
          id: 's1',
        },
      ],
    } as unknown as RenderedReport;
    expect(verifySeal(reordered, buildSealedRecord(report)).ok).toBe(true);
  });
});

describe('the one input where the generations disagree', () => {
  // A Date. v1 has no toJSON handling, so `Object.keys(date)` is empty and it
  // serializes as `{}` — the timestamp vanishes from the hash entirely. v2
  // honours toJSON and seals the ISO string. This is the case that makes the
  // version marker load-bearing rather than ceremonial, and it is a small
  // sibling of L55: content silently absent from a digest that claims to cover
  // the record.
  const withDate = {
    sections: [
      { id: 's1', title: 'T', blocks: [{ kind: 'text', at: new Date('2020-01-02T03:04:05Z') }] },
    ],
  } as unknown as RenderedReport;

  it('v1 drops a Date from the hash; v2 does not', () => {
    expect(legacyV1(withDate)).toContain('"at":{}');
    expect(canonicalizeReport(withDate)).toContain('2020-01-02T03:04:05.000Z');
  });

  it('a v1 seal over differing dates collides — and a v2 seal does not', () => {
    const other = {
      sections: [
        { id: 's1', title: 'T', blocks: [{ kind: 'text', at: new Date('2024-06-07T08:09:10Z') }] },
      ],
    } as unknown as RenderedReport;
    expect(legacyV1(withDate)).toBe(legacyV1(other));
    expect(canonicalizeReport(withDate)).not.toBe(canonicalizeReport(other));
  });

  it('old and new seals of the same report coexist, each under its own generation', () => {
    const v1Hash = createHash('sha256').update(legacyV1(withDate)).digest('hex');
    const v2 = buildSealedRecord(withDate);
    expect(v1Hash).not.toBe(v2.contentHash);
    expect(verifySeal(withDate, { ...v2, canonVersion: undefined, contentHash: v1Hash }).ok).toBe(true);
    expect(verifySeal(withDate, v2).ok).toBe(true);
  });
});
