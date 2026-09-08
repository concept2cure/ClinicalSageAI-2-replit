/**
 * Post-Market Authoring — the approval gate must distinguish unspecialised
 * generator scaffold from real, sponsor-specialised content.
 *
 * The generators fill every required field with non-empty DRAFT guidance prose,
 * so "presence" is trivially satisfied on raw output. The gate must NOT treat
 * that as sufficiency: raw generated scaffold fails the gate (passesGate false);
 * the SAME document passes only once the sponsor replaces every field with real
 * content (no DRAFT sentinel). An empty document still fails, the content is
 * honestly DRAFT-marked, and FACTUAL fields (sales volume, user population) are
 * placeholders flagged for the sponsor rather than fabricated numbers.
 *
 * The prior version of this file asserted the opposite — that raw generated
 * DRAFT scaffold PASSED validateDocument — which froze the fail-open where an
 * unspecialised boilerplate PSUR/SSCP could be approved and Part-11-locked with
 * its fields still literally reading "DRAFT — insert the actual …".
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

/** A sponsor-specialised version of generated content: every field replaced
 *  with real content that no longer carries the DRAFT scaffold sentinel. */
function specialise(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(content)) {
    out[k] = `Sponsor-specialised final content for ${k}.`;
  }
  return out;
}

describe('post-market authoring — scaffold vs specialised content at the gate', () => {
  for (const [type, content, withPeriod] of cases) {
    it(`${type}: raw generated DRAFT scaffold does NOT pass the gate (fail closed)`, () => {
      const result = validateDocument(asDoc(type, content, withPeriod));
      // Every field is present and non-empty, but still DRAFT scaffold — the
      // gate must refuse it, or an unspecialised boilerplate document could be
      // approved and Part-11-locked.
      expect(result.passesGate).toBe(false);
      expect(result.criticalCount).toBeGreaterThan(0);
    });

    it(`${type}: the SAME document passes once the sponsor specialises every field`, () => {
      const result = validateDocument(
        asDoc(type, specialise(content as Record<string, unknown>), withPeriod)
      );
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
