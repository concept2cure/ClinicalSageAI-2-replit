/**
 * Pure-helper tests for E1 verified-and-sealed export. No DB.
 */
import { describe, it, expect } from 'vitest';

import {
  SEAL_MEANINGS,
  buildVerifiedSealedRecord,
  computeContentHash,
  guardSampleContent,
  isSealMeaning,
  meaningToSignaturePurpose,
  validateSealManifestation,
} from '../verifiedSeal/helpers';

describe('isSealMeaning (server-side §11.50 enum)', () => {
  it('accepts the closed set', () => {
    for (const m of SEAL_MEANINGS) expect(isSealMeaning(m)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isSealMeaning('approve')).toBe(false);
    expect(isSealMeaning('author')).toBe(false); // case-sensitive
    expect(isSealMeaning('release')).toBe(false);
    expect(isSealMeaning('')).toBe(false);
    expect(isSealMeaning(undefined)).toBe(false);
    expect(isSealMeaning(3)).toBe(false);
  });
});

describe('meaningToSignaturePurpose', () => {
  it('maps each meaning to a §11.50 purpose', () => {
    expect(meaningToSignaturePurpose('AUTHOR')).toBe('authorship');
    expect(meaningToSignaturePurpose('REVIEWER')).toBe('review');
    expect(meaningToSignaturePurpose('APPROVER')).toBe('approval');
  });
});

describe('guardSampleContent', () => {
  it('blocks caller-asserted sample content', () => {
    expect(guardSampleContent({ title: 'T', content: 'real', isSample: true }).blocked).toBe(true);
  });
  it('blocks caller-asserted draft content', () => {
    expect(guardSampleContent({ title: 'T', content: 'real', isDraft: true }).blocked).toBe(true);
  });
  it('blocks empty content', () => {
    expect(guardSampleContent({ title: 'T', content: '   ' }).blocked).toBe(true);
  });
  it('blocks placeholder markers (case-insensitive, in content or title)', () => {
    expect(guardSampleContent({ title: 'T', content: 'Lorem Ipsum dolor' }).blocked).toBe(true);
    expect(guardSampleContent({ title: 'T', content: 'value is TBD' }).blocked).toBe(true);
    expect(guardSampleContent({ title: '[DRAFT] Module 3', content: 'body' }).blocked).toBe(true);
  });
  it('allows genuine content', () => {
    const r = guardSampleContent({ title: 'CMC Stability', content: 'The drug substance is stable for 24 months.' });
    expect(r.blocked).toBe(false);
    expect(r.reason).toBeUndefined();
  });
});

describe('computeContentHash', () => {
  it('is deterministic and hex sha256', () => {
    const a = computeContentHash('hello');
    expect(a).toBe(computeContentHash('hello'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes with content', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'));
  });
});

describe('buildVerifiedSealedRecord', () => {
  it('produces a report-os SealedRecord shape', () => {
    const rec = buildVerifiedSealedRecord({ content: 'doc', sealedAt: '2026-06-29T00:00:00.000Z' });
    expect(rec.algorithm).toBe('sha256');
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.aiDisclosed).toBe(true);
    expect(rec.atoms).toEqual([]);
    expect(rec.atomCount).toBe(0);
    expect(rec.sealedAt).toBe('2026-06-29T00:00:00.000Z');
  });
  it('carries atoms and atomCount', () => {
    const rec = buildVerifiedSealedRecord({
      content: 'doc',
      atoms: [{ blockPath: 's#0', sourceTable: 'source_upload' }],
    });
    expect(rec.atomCount).toBe(1);
    expect(rec.atoms[0].sourceTable).toBe('source_upload');
  });
});

describe('validateSealManifestation (server-side enforcement)', () => {
  const good = { printedName: 'Dr. Jane Roe', meaning: 'APPROVER', reasonForChange: 'Verified clean against source.' };

  it('accepts a well-formed manifestation', () => {
    const r = validateSealManifestation(good);
    expect(r.ok).toBe(true);
    expect(r.manifestation).toEqual({
      printedName: 'Dr. Jane Roe',
      meaning: 'APPROVER',
      reasonForChange: 'Verified clean against source.',
    });
  });
  it('rejects a missing printed name', () => {
    expect(validateSealManifestation({ ...good, printedName: '  ' }).code).toBe('MISSING_NAME');
  });
  it('rejects an invalid meaning (enum enforced server-side)', () => {
    expect(validateSealManifestation({ ...good, meaning: 'approve' }).code).toBe('INVALID_MEANING');
    expect(validateSealManifestation({ ...good, meaning: 'AUTHORSHIP' }).code).toBe('INVALID_MEANING');
  });
  it('rejects a missing or too-short reason', () => {
    expect(validateSealManifestation({ ...good, reasonForChange: '' }).code).toBe('MISSING_REASON');
    expect(validateSealManifestation({ ...good, reasonForChange: 'short' }).code).toBe('REASON_TOO_SHORT');
  });
});
