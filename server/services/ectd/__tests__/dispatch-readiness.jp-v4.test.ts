/**
 * A new Japanese application in eCTD v3.2.2 is blocked at dispatch.
 *
 * From 2026-04-01 PMDA accepts only eCTD v4.0 for new approval applications
 * (MHLW 薬生薬審発0218第4号 of 2022-02-18 set the v3.2.2 transition to end on
 * 2026-03-31; 医薬薬審発0310第3号 of 2025-03-10, T250310I0040.pdf, is the
 * current amendment). The platform builds Japan packages in v3.2.2 only and has
 * no JP v4.0 packager (DECISIONS.md, decision 10), so an original sequence for
 * a Japanese application on or after that date must not read dispatch-clear.
 * A continuing sequence of a lifecycle begun in v3.2.2 stays allowed.
 *
 * The date is the currency registry's fact 'pmda-ectd-v4-mandatory', read
 * through findFacts — never a copy. The mock below wraps the real registry so
 * the test can move or remove that fact and watch the gate follow it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const registryOverride = vi.hoisted(() => ({
  effectiveDate: null as string | null,
  drop: false,
}));

vi.mock('../../regulatory-currency/currency-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../regulatory-currency/currency-registry')>();
  return {
    ...actual,
    findFacts: (query: Parameters<typeof actual.findFacts>[0] = {}) => {
      const { asOf, ...rest } = query;
      let facts = actual.findFacts(rest);
      if (registryOverride.drop) facts = facts.filter((f) => f.id !== 'pmda-ectd-v4-mandatory');
      if (registryOverride.effectiveDate) {
        facts = facts.map((f) =>
          f.id === 'pmda-ectd-v4-mandatory'
            ? { ...f, status: 'mandatory_upcoming' as const, effectiveDate: registryOverride.effectiveDate as string }
            : f,
        );
      }
      return asOf ? facts.map((f) => actual.factAsOf(f, asOf)) : facts;
    },
  };
});

import { computeDispatchReadiness, type ReadinessLeaf } from '../dispatch-readiness';
import { getRule, dispatchFindingCodes } from '../validation-rule-corpus';
import { readinessOptionsForSequence } from '../assess-dispatch-readiness';
import { findFacts } from '../../regulatory-currency/currency-registry';

const CODE = 'JP_ECTD_V4_REQUIRED';

const leaf = (over: Partial<ReadinessLeaf> = {}): ReadinessLeaf => ({
  sectionCode: 'm2.5',
  title: 'Clinical Overview',
  lifecycleOp: 'new',
  documentTable: 'coauthor_documents',
  documentId: 42,
  ...over,
});

const jpFinding = (opts: Parameters<typeof computeDispatchReadiness>[1]) =>
  computeDispatchReadiness([leaf()], opts).findings.filter((f) => f.code === CODE);

afterEach(() => {
  registryOverride.effectiveDate = null;
  registryOverride.drop = false;
});

describe('JP_ECTD_V4_REQUIRED — a new Japanese application in v3.2.2 is blocked at dispatch', () => {
  it('blocks an original PMDA sequence on or after the fact\'s effective date, naming that date', () => {
    const fact = findFacts({ jurisdiction: 'JP' }).find((f) => f.id === 'pmda-ectd-v4-mandatory');
    expect(fact, 'the currency registry carries the PMDA v4.0 fact').toBeTruthy();

    const r = computeDispatchReadiness([leaf()], {
      region: 'pmda',
      isOriginalSequence: true,
      sequenceNumber: '0000',
      asOf: '2026-10-04',
    });
    const found = r.findings.filter((f) => f.code === CODE);
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect(found[0].sectionCode).toBeNull();
    expect(found[0].message).toContain(
      `PMDA accepts only eCTD v4.0 for new applications from ${fact!.effectiveDate}; this platform builds Japan packages in v3.2.2 only.`,
    );
    expect(r.errors).toBe(1);
  });

  it('reads the effective date itself — the first day it is in force blocks', () => {
    expect(jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-04-01' })).toHaveLength(1);
  });

  it('resolves every spelling of Japan the platform uses (jp, JP, PMDA)', () => {
    for (const region of ['jp', 'JP', 'PMDA', 'pmda']) {
      expect(jpFinding({ region, isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' }), region).toHaveLength(1);
    }
  });

  it('does not block before the effective date', () => {
    expect(jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-03-31' })).toHaveLength(0);
  });

  it('does not block a continuing sequence of a lifecycle begun in v3.2.2', () => {
    expect(jpFinding({ region: 'pmda', isOriginalSequence: false, sequenceNumber: '0003', asOf: '2026-10-04' })).toHaveLength(0);
  });

  it('is scoped to Japan — an FDA or EU original is untouched', () => {
    for (const region of ['fda', 'eu', 'ema', 'US']) {
      expect(jpFinding({ region, isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' }), region).toHaveLength(0);
    }
    // No region given: the pure validator says nothing about format acceptance.
    expect(jpFinding({ isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' })).toHaveLength(0);
  });

  it('follows the registry when its date moves — the date is never copied', () => {
    registryOverride.effectiveDate = '2027-01-01';
    expect(jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' })).toHaveLength(0);
    const later = jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2027-01-01' });
    expect(later).toHaveLength(1);
    expect(later[0].message).toContain('from 2027-01-01;');
  });

  it('fails closed when the registry no longer carries the fact', () => {
    registryOverride.drop = true;
    const found = jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' });
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect(found[0].message).toMatch(/pmda-ectd-v4-mandatory/);
  });

  it('fails closed when no usable as-of date is supplied for a Japanese original', () => {
    for (const asOf of [undefined, '', '04/10/2026']) {
      const found = jpFinding({ region: 'pmda', isOriginalSequence: true, sequenceNumber: '0000', asOf });
      expect(found, String(asOf)).toHaveLength(1);
      expect(found[0].severity).toBe('error');
      expect(found[0].message).toMatch(/as-of date/);
    }
  });
});

describe('JP_ECTD_V4_REQUIRED is a named corpus rule', () => {
  it('is catalogued as a Japan dispatch-readiness rule that references the currency fact and the notices', () => {
    const rule = getRule(CODE);
    expect(rule, 'RULE_CORPUS names JP_ECTD_V4_REQUIRED').toBeTruthy();
    expect(rule!.findingCode).toBe(CODE);
    expect(rule!.enforcement).toBe('dispatch-readiness');
    expect(rule!.regions).toEqual(['jp']);
    expect(rule!.severity).toBe('high');
    expect(rule!.currencyFactId).toBe('pmda-ectd-v4-mandatory');
    expect(findFacts({ jurisdiction: 'JP' }).map((f) => f.id)).toContain(rule!.currencyFactId);
    expect(rule!.source).toMatch(/T250310I0040\.pdf/);
    expect(rule!.source).toMatch(/0218第4号/);
    expect(dispatchFindingCodes().has(CODE)).toBe(true);
  });
});

describe('the assessor hands the sequence\'s region and an as-of date to the validator', () => {
  it('passes region, original-ness, sequence number and asOf through', () => {
    const opts = readinessOptionsForSequence(
      { region: 'jp', type: 'original', sequenceNumber: '0000' },
      null,
      '2026-10-04',
    );
    expect(opts).toMatchObject({ region: 'jp', isOriginalSequence: true, sequenceNumber: '0000', asOf: '2026-10-04' });
    expect(computeDispatchReadiness([leaf()], opts).findings.map((f) => f.code)).toContain(CODE);
  });

  it('a continuing Japanese sequence is not an original', () => {
    const opts = readinessOptionsForSequence(
      { region: 'jp', type: 'amendment', sequenceNumber: '0003' },
      null,
      '2026-10-04',
    );
    expect(opts.isOriginalSequence).toBe(false);
    expect(computeDispatchReadiness([leaf()], opts).findings.map((f) => f.code)).not.toContain(CODE);
  });
});
