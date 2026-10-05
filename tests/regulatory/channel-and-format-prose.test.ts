/**
 * The prose that restates a submission channel or the US eCTD format says what
 * the one answer says (D2 record 2026-10-05, step g-channel-prose-and-us-ectd-format;
 * findings 42 and 52).
 *
 * The one answer:
 *  - the EMA channel is worded once, in global-ri/electronic-submission-format.ts
 *    (SUBMISSION_FORMATS.EMA.gateway), and decided per filing by
 *    `submissionChannelFor` (regulatory/registry/submittabilityCoverage.ts). A
 *    centralised filing (EU_MAA) goes to the EMA eSubmission Gateway / Web
 *    Client, for which the platform has no connector; CESP carries the
 *    national, MRP and DCP filings.
 *  - the dated US eCTD v4.0 fact is `fda-ectd-v4-accepted` in
 *    regulatory-currency/currency-registry.ts: v4.0 is accepted VOLUNTARILY,
 *    for new applications, since its effectiveDate; v3.2.2 remains supported.
 *
 * Before this step, four places restated a different answer: the market
 * datasheet's EU gateway ('CESP … / eSubmission Gateway'), AnA's MAA workflow
 * ('Submit to EMA via CESP/eSubmission gateway'), the SOP generator's EMA
 * submission reference ('EMA eSubmission Gateway / CESP'), and the US datasheet
 * format ('eCTD v4.0 (FDA also accepts v3.2.2)').
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMarketSpec } from '../../server/services/market-specs/market-submission-specs';
import { getWorkflow } from '../../server/services/ana-ri/workflow-orchestration';
import { generateSop } from '../../server/services/sop-generator';
import { SUBMISSION_FORMATS } from '../../server/services/global-ri/electronic-submission-format';
import { submissionChannelFor } from '../../server/services/regulatory/registry/submittabilityCoverage';
import { getApplicationType } from '../../shared/regulatory/global-document-registry';
import { REGULATORY_FACTS } from '../../server/services/regulatory-currency/currency-registry';

/** CESP named first, or alongside EMA's channel as an alternative to it. */
const CESP_AS_CENTRALISED_ROUTE = /^\s*(EMA\s+)?CESP\b|CESP\s*\/\s*eSubmission|eSubmission[^()]*\/\s*CESP|to EMA via CESP/i;

describe('the EU channel prose follows the one answer', () => {
  it('the premise: EU_MAA is centralised and unconnected, channel worded from SUBMISSION_FORMATS', () => {
    const ch = submissionChannelFor(getApplicationType('EU_MAA')!);
    expect(ch.kind).toBe('unconnected');
    if (ch.kind !== 'unconnected') return;
    expect(ch.channel).toMatch(/eSubmission Gateway \/ Web Client/);
    expect(ch.channel).not.toMatch(/CESP/);
    expect(SUBMISSION_FORMATS.EMA.gateway).toMatch(/CESP for national procedures/);
  });

  it('the EU eCTD datasheet gateway is the one EMA wording, not CESP as the route', () => {
    const eu = getMarketSpec('eu-ectd')!;
    expect(eu.gateway).not.toMatch(CESP_AS_CENTRALISED_ROUTE);
    expect(eu.gateway).toBe(SUBMISSION_FORMATS.EMA.gateway);
  });

  it("AnA's MAA submit step names the centralised channel and says the applicant transmits", () => {
    const step = getWorkflow('maa')!.phases.flatMap((p) => p.steps).find((s) => s.id === 'maa-9')!;
    expect(step, 'maa-9 exists').toBeTruthy();
    const ch = submissionChannelFor(getApplicationType('EU_MAA')!);
    if (ch.kind !== 'unconnected') throw new Error('premise: EU_MAA unconnected');
    expect(step.description).not.toMatch(/CESP/);
    expect(step.description).toContain(ch.channel);
    expect(step.description).toContain(ch.applicantStep);
  });

  it('the SOP generator cites the EMA channel in the one wording', () => {
    const sop = generateSop({ title: 'Regulatory Submission', processType: 'regulatory_submission', regions: ['EMA'] });
    for (const ref of sop.references) expect(ref).not.toMatch(CESP_AS_CENTRALISED_ROUTE);
    expect(sop.references).toContain(`EMA ${SUBMISSION_FORMATS.EMA.gateway}`);
  });

  it('the CESP gateway header scopes CESP to national, MRP and DCP procedures', () => {
    const src = readFileSync(resolve(__dirname, '../../server/services/submission-gateways/ema-cesp.ts'), 'utf8');
    const header = src.slice(0, src.indexOf('*/'));
    expect(header).toMatch(/national,\s*MRP\s*and\s*DCP/);
    expect(header).toMatch(/CESP is NOT the channel for a centralised-procedure submission/);
  });
});

describe('the US eCTD format follows the dated currency fact', () => {
  afterEach(() => {
    vi.doUnmock('../../server/services/regulatory-currency/currency-registry');
    vi.resetModules();
  });

  it('presents v3.2.2 as the format and v4.0 as voluntary since the fact date', () => {
    const fact = REGULATORY_FACTS.find((f) => f.id === 'fda-ectd-v4-accepted')!;
    expect(fact, 'premise: the dated fact exists').toBeTruthy();
    const fmt = getMarketSpec('us-ectd')!.submissionFormat;
    expect(fmt.startsWith('eCTD v4.0')).toBe(false);
    expect(fmt).toBe(`eCTD v3.2.2 (eCTD v4.0 accepted voluntarily for new applications since ${fact.effectiveDate})`);
  });

  it('derives the parenthetical from the fact: without it, no v4.0 claim is made', async () => {
    vi.resetModules();
    vi.doMock('../../server/services/regulatory-currency/currency-registry', async (orig) => {
      const real = await orig<typeof import('../../server/services/regulatory-currency/currency-registry')>();
      return { ...real, REGULATORY_FACTS: real.REGULATORY_FACTS.filter((f) => f.id !== 'fda-ectd-v4-accepted') };
    });
    const m = await import('../../server/services/market-specs/market-submission-specs');
    expect(m.getMarketSpec('us-ectd')!.submissionFormat).toBe('eCTD v3.2.2');
  });

  it('derives the date from the fact: a moved date moves the text', async () => {
    vi.resetModules();
    vi.doMock('../../server/services/regulatory-currency/currency-registry', async (orig) => {
      const real = await orig<typeof import('../../server/services/regulatory-currency/currency-registry')>();
      return {
        ...real,
        REGULATORY_FACTS: real.REGULATORY_FACTS.map((f) =>
          f.id === 'fda-ectd-v4-accepted' ? { ...f, effectiveDate: '2099-01-01' } : f,
        ),
      };
    });
    const m = await import('../../server/services/market-specs/market-submission-specs');
    expect(m.getMarketSpec('us-ectd')!.submissionFormat).toContain('2099-01-01');
  });
});
