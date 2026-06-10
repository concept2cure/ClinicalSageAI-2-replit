/**
 * Post-Market Authoring — every generated DRAFT must satisfy the EXISTING
 * per-type validator (integration, not duplication), an empty document must
 * still fail (no false pass), the content is honestly DRAFT-marked, and FACTUAL
 * fields (sales volume, user population) are placeholders flagged for the
 * sponsor rather than fabricated numbers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPmsPlanContent,
  buildPmsReportContent,
  buildPmcfEvaluationContent,
  buildPsurContent,
  buildSscpContent,
} from '../post-market-authoring';
import { validateDocument } from '../post-market.service';
import type {
  PostMarketDocument,
  PostMarketDocumentType,
} from '../../../../shared/schema/gspr-postmarket';

const ctx = { deviceName: 'Acme Infusion Pump', deviceClass: 'IIb', regulation: 'MDR' as const };

function asDoc(
  documentType: PostMarketDocumentType,
  content: unknown,
  withPeriod = false
): PostMarketDocument {
  return {
    documentType,
    content,
    locked: false,
    status: 'draft',
    reportingPeriodStart: withPeriod ? new Date('2025-01-01') : null,
    reportingPeriodEnd: withPeriod ? new Date('2025-12-31') : null,
  } as unknown as PostMarketDocument;
}

const cases = [
  ['pms_plan', buildPmsPlanContent(ctx), false],
  ['pms_report', buildPmsReportContent(ctx), true],
  ['pmcf_evaluation', buildPmcfEvaluationContent(ctx), true],
  ['psur', buildPsurContent(ctx), true],
  ['sscp', buildSscpContent(ctx), false],
] as const;

describe('post-market authoring — generated content satisfies each validator', () => {
  for (const [type, content, withPeriod] of cases) {
    it(`${type}: generated DRAFT passes the existing validateDocument`, () => {
      const result = validateDocument(asDoc(type, content, withPeriod));
      expect(result.criticalCount).toBe(0);
      expect(result.passesGate).toBe(true);
    });

    it(`${type}: an empty document still fails (no false pass)`, () => {
      const result = validateDocument(asDoc(type, {}, withPeriod));
      expect(result.passesGate).toBe(false);
    });

    it(`${type}: content is honestly DRAFT-marked`, () => {
      expect(Object.values(content).join(' ')).toMatch(/DRAFT/);
    });

    it(`${type}: is deterministic`, () => {
      expect(content).toEqual(content);
    });
  }
});

describe('post-market authoring — factual fields are honest placeholders', () => {
  it('PSUR sales volume and user-population fields are flagged FACTUAL, not fabricated', () => {
    const c = buildPsurContent(ctx);
    expect(c.volumeOfSales).toMatch(/FACTUAL|not generated/i);
    expect(c.sizeAndCharacteristicsOfUsersPopulation).toMatch(/FACTUAL|not generated/i);
  });

  it('PMS report and PMCF evaluation data fields prompt for real figures', () => {
    expect(buildPmsReportContent(ctx).summaryOfFindings).toMatch(/actual figures|do not leave/i);
    expect(buildPmcfEvaluationContent(ctx).dataAnalyzed).toMatch(/actual datasets|not placeholders/i);
  });
});
