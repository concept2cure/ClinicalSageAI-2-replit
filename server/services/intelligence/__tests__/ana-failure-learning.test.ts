/**
 * Tests for AnA failure learning — fingerprinting, binning, consensus.
 *
 * Pure-function coverage: sanitization, classification, fingerprint stability,
 * outcome classification. DB-backed paths (recordInteraction, extract,
 * getSuggestedCorrections) are covered by integration tests separately.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeSummary,
  isFailure,
  binAgencyForInteraction,
  binDocumentType,
  binIntent,
  normalizeForFingerprint,
  buildFingerprint,
} from '../ana-failure-learning';

describe('sanitizeSummary', () => {
  it('collapses whitespace to single space and trims', () => {
    expect(sanitizeSummary('  hello    world\n\n  ')).toBe('hello world');
  });

  it('truncates at 500 chars', () => {
    const long = 'x'.repeat(800);
    expect(sanitizeSummary(long)?.length).toBe(500);
  });

  it('returns null for empty or undefined input', () => {
    expect(sanitizeSummary('')).toBeNull();
    expect(sanitizeSummary(null)).toBeNull();
    expect(sanitizeSummary(undefined)).toBeNull();
    expect(sanitizeSummary('   ')).toBeNull();
  });
});

describe('isFailure', () => {
  it('treats accepted as success, everything else as failure', () => {
    expect(isFailure('accepted')).toBe(false);
    expect(isFailure('edited')).toBe(true);
    expect(isFailure('rejected')).toBe(true);
    expect(isFailure('regenerated')).toBe(true);
    expect(isFailure('abandoned')).toBe(true);
  });
});

describe('binAgencyForInteraction', () => {
  it('normalizes agency strings to closed enum', () => {
    expect(binAgencyForInteraction('FDA')).toBe('fda');
    expect(binAgencyForInteraction('Health Canada')).toBe('hc');
    expect(binAgencyForInteraction('Swissmedic')).toBe('swissmedic');
    expect(binAgencyForInteraction('mhra')).toBe('mhra');
    expect(binAgencyForInteraction('random')).toBe('other');
    expect(binAgencyForInteraction(null)).toBe('other');
  });
});

describe('binDocumentType', () => {
  it('classifies common document references', () => {
    expect(binDocumentType('Clinical Protocol')).toBe('protocol');
    expect(binDocumentType('Investigator Brochure')).toBe('ib');
    expect(binDocumentType('IB')).toBe('ib');
    expect(binDocumentType('Module 3 CMC')).toBe('cmc');
    expect(binDocumentType('USPI labeling')).toBe('labeling');
    expect(binDocumentType('Clinical Evaluation Report')).toBe('cer');
    expect(binDocumentType('Response Letter')).toBe('response_letter');
    expect(binDocumentType('Pre-Sub Briefing Package')).toBe('briefing_package');
    expect(binDocumentType('Meeting Minutes')).toBe('meeting_minutes');
    expect(binDocumentType('totally unrelated')).toBe('other');
  });
});

describe('binIntent', () => {
  it('routes natural-language intents to closed enum', () => {
    expect(binIntent('Draft the IND introduction')).toBe('draft');
    expect(binIntent('Please review this section')).toBe('review');
    expect(binIntent('Explain what 510(k) means')).toBe('explain');
    expect(binIntent('Fix the formatting')).toBe('fix');
    expect(binIntent('Compare with predicate K123456')).toBe('compare');
    expect(binIntent('Extract the dosing table')).toBe('extract');
    expect(binIntent('Plan the regulatory strategy')).toBe('plan');
    expect(binIntent('hello there')).toBe('other');
  });
});

describe('normalizeForFingerprint', () => {
  it('produces the same string when same content tokens are reordered with stop words', () => {
    // Same content tokens (draft, ind, introduction, oncology) in different
    // surface forms with different stop-word noise.
    const a = normalizeForFingerprint('Please draft the IND introduction for oncology');
    const b = normalizeForFingerprint('Draft an introduction for the oncology IND');
    expect(a).toBe(b);
    expect(a).toBe('draft ind introduction oncology');
  });

  it('drops stop words and punctuation', () => {
    expect(normalizeForFingerprint('The dog and the cat.')).toBe('cat dog');
  });

  it('caps at 20 tokens', () => {
    const text = Array.from({ length: 50 }, (_, i) => `tok${i}`).join(' ');
    const result = normalizeForFingerprint(text);
    expect(result.split(' ').length).toBeLessThanOrEqual(20);
  });

  it('returns empty string on null', () => {
    expect(normalizeForFingerprint(null)).toBe('');
    expect(normalizeForFingerprint(undefined)).toBe('');
  });
});

describe('buildFingerprint', () => {
  it('is deterministic and 64 hex chars (SHA-256)', () => {
    const fp = buildFingerprint({
      agency: 'fda',
      documentType: 'protocol',
      intentClass: 'draft',
      promptSummary: 'Draft the protocol synopsis',
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    const fp2 = buildFingerprint({
      agency: 'fda',
      documentType: 'protocol',
      intentClass: 'draft',
      promptSummary: 'Draft the protocol synopsis',
    });
    expect(fp).toBe(fp2);
  });

  it('clusters prompts that share the same content tokens after stop-word removal', () => {
    // Same content tokens: module, 3, quality, overall, summary, oncology.
    // Different order, different filler.
    const fp1 = buildFingerprint({
      agency: 'ema',
      documentType: 'cmc',
      intentClass: 'draft',
      promptSummary: 'Module 3 Quality Overall Summary oncology',
    });
    const fp2 = buildFingerprint({
      agency: 'ema',
      documentType: 'cmc',
      intentClass: 'draft',
      promptSummary: 'oncology Quality Overall Summary Module 3',
    });
    expect(fp1).toBe(fp2);
  });

  it('separates fingerprints when agency differs', () => {
    const ema = buildFingerprint({ agency: 'ema', documentType: 'cmc', intentClass: 'draft', promptSummary: 'x' });
    const fda = buildFingerprint({ agency: 'fda', documentType: 'cmc', intentClass: 'draft', promptSummary: 'x' });
    expect(ema).not.toBe(fda);
  });

  it('separates fingerprints when document type differs', () => {
    const cmc = buildFingerprint({ agency: 'fda', documentType: 'cmc', intentClass: 'draft', promptSummary: 'x' });
    const lbl = buildFingerprint({ agency: 'fda', documentType: 'labeling', intentClass: 'draft', promptSummary: 'x' });
    expect(cmc).not.toBe(lbl);
  });
});
