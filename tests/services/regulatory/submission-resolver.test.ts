/**
 * Submission resolver — the per-region routing plan AnA and the planner read.
 *
 * ── What changed and why (2026-10-05, finding 42) ────────────────────────────
 * This file used to pin `eu.gateway === { ema, cesp }`, `coverage === 'complete'`
 * and every (filing × region) cell submit-supported. That pinned a wrong answer.
 *
 * EMA made the eSubmission Gateway / Web Client mandatory for every
 * centralised-procedure eCTD submission from 1 March 2014 — new MAAs,
 * variations, renewals, PSURs, ASMFs — and tells applicants not to send those
 * submissions to NCAs via CESP as well (regulator text, ema.europa.eu; see
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-submission-channel-function-facts.md). CESP is the channel for national,
 * MRP and DCP procedures. The platform has no eSubmission Gateway connector
 * (Rule 2; DECISIONS.md row 10), so a centralised MAA is BUILD-only: the
 * resolver must say so, name the channel, and not report it submit-supported.
 *
 * ── And again (2026-10-08, FILING_SPINE.md F19) ──────────────────────────────
 * This file then pinned EU and JP as region-correct builds and JP as
 * submit-supported. Both were wrong answers, pinned:
 *   - "buildSupported" meant "a Module 1 backbone file NAME exists". EMA's and
 *     PMDA's Module 1 leaves are filed flat under their root element, not
 *     under the agency's headings (regional-backbone-readiness.ts
 *     FLAT_MODULE1_GAP). Only FDA's builder writes its own headings.
 *   - The PMDA adapter refuses every transmit (pmda-gateway.ts,
 *     PMDA_PROTOCOL_UNVERIFIED): a registered gateway is not a way to submit.
 * The resolver now reads server/services/regulatory/market-support.ts for both,
 * the same statement every market row shows. Only US is fully covered.
 *
 * The resolver no longer decides channels itself. It reads
 * `submissionChannelFor` in server/services/regulatory/registry/
 * submittabilityCoverage.ts — the one channel function — so the planner,
 * AnA and the submittability report give one answer.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSubmissionPlan,
  submissionCoverageMatrix,
  pickRegionalEntry,
  CORE_REGIONS,
} from '../../../server/services/regulatory/submission-resolver';

describe('submission resolver — per-region plan (FDA/EMA/PMDA)', () => {
  it('resolves a biologic marketing filing: US by gateway; EU and JP neither region-correct nor sent', () => {
    const plan = resolveSubmissionPlan({ filingType: 'BLA' });
    expect(plan.perRegion).toHaveLength(3);

    const us = plan.perRegion.find((r) => r.region === 'US')!;
    const eu = plan.perRegion.find((r) => r.region === 'EU')!;
    const jp = plan.perRegion.find((r) => r.region === 'JP')!;

    expect(us.agency).toBe('FDA');
    expect(us.gateway).toEqual({ region: 'fda', name: 'esg' });
    expect(us.module1Path).toContain('/m1/us/');
    expect(us.buildSupported && us.submitSupported).toBe(true);

    // A centralised MAA: the eCTD package is built region-correct, and nothing
    // on the platform transmits it.
    expect(eu.agency).toBe('EMA');
    expect(eu.filing?.id).toBe('EU_MAA');
    expect(eu.gateway, 'a centralised MAA must not be routed to CESP').toBeNull();
    expect(eu.buildSupported, 'EU Module 1 is filed flat (F19)').toBe(false);
    expect(eu.submitSupported).toBe(false);
    expect(eu.channel?.kind).toBe('unconnected');
    expect(eu.notes.join(' ')).toMatch(/eSubmission Gateway/);
    expect(eu.notes.join(' ')).toMatch(/Build not region-correct for EMA: Module 1 leaves are filed flat/);

    expect(jp.agency).toBe('PMDA');
    expect(jp.gateway).toEqual({ region: 'pmda', name: 'pmda_gateway' });
    expect(jp.buildSupported, 'JP Module 1 is filed flat (F19)').toBe(false);
    expect(jp.submitSupported, 'the PMDA adapter refuses every transmit').toBe(false);
    expect(jp.notes.join(' ')).toMatch(/Not sent: PMDA's electronic submission channel/);

    expect(plan.coverage).toBe('partial');
    expect(plan.gaps).toEqual(['EU: build not region-correct', 'JP: build not region-correct']);
  });

  it('routes by product class — BLA and NDA pick different US filings', () => {
    const bla = resolveSubmissionPlan({ filingType: 'BLA' });
    const nda = resolveSubmissionPlan({ filingType: 'NDA' });
    const blaUs = bla.perRegion.find((r) => r.region === 'US')!.filing!;
    const ndaUs = nda.perRegion.find((r) => r.region === 'US')!.filing!;
    expect(blaUs.id).not.toBe(ndaUs.id);
    // Both are US marketing applications.
    expect(blaUs.family).toBe('marketing_authorization');
    expect(ndaUs.family).toBe('marketing_authorization');
  });

  it('honours an explicit region subset', () => {
    const plan = resolveSubmissionPlan({ filingType: 'MAA', regions: ['EU'] });
    expect(plan.perRegion).toHaveLength(1);
    expect(plan.perRegion[0].region).toBe('EU');
  });

  it('never tells a client their MAA can be sent through CESP', () => {
    const eu = resolveSubmissionPlan({ filingType: 'MAA', regions: ['EU'] }).perRegion[0];
    expect(eu.gateway?.name).not.toBe('cesp');
    expect(eu.submitSupported).toBe(false);
    expect(eu.notes.join(' ')).toMatch(/eSubmission Gateway/);
    // It says WHY, not just that a gateway is missing.
    expect(eu.notes.join(' ')).toMatch(/Centralised procedure/);
    // The named channel is the centralised one; CESP appears only as the refused one.
    expect(eu.channel && 'channel' in eu.channel ? eu.channel.channel : '').not.toMatch(/CESP/i);
  });

  it('does not tell an orphan, PIP or PRIME applicant the centralised procedure applies (fix round 2)', () => {
    // resolve_submission_plan accepts these families from AnA. Round 1 answered
    // EU_ORPHAN with "Centralised procedure — the eSubmission Gateway/Web Client
    // is mandatory ... builds and validates the eCTD sequence". EMA receives
    // them through IRIS.
    for (const [applicationFamily, id] of [
      ['orphan', 'EU_ORPHAN'],
      ['pediatric', 'EU_PIP'],
      ['designation', 'EU_PRIME'],
    ] as const) {
      const eu = resolveSubmissionPlan({ applicationFamily, regions: ['EU'] }).perRegion[0];
      expect(eu.filing?.id, applicationFamily).toBe(id);
      const notes = eu.notes.join(' ');
      expect(notes, id).toMatch(/IRIS/);
      expect(notes, id).not.toMatch(/Centralised procedure|eSubmission Gateway|CESP|eCTD sequence/);
      expect(eu.gateway, id).toBeNull();
      expect(eu.submitSupported, id).toBe(false);
    }
  });

  it('sends an EU clinical trial application to CTIS, not to a dossier gateway', () => {
    const eu = resolveSubmissionPlan({
      applicationFamily: 'clinical_trial',
      productClass: 'small_molecule',
      regions: ['EU'],
    }).perRegion[0];
    expect(eu.filing?.id).toBe('EU_CTA');
    expect(eu.gateway).toBeNull();
    expect(eu.submitSupported).toBe(false);
    expect(eu.channel?.kind).toBe('portal');
    expect(eu.notes.join(' ')).toMatch(/CTIS/);
  });
});

describe('submission resolver — coverage matrix', () => {
  it('US cells support build + submit; EU and JP cells support neither (F19)', () => {
    const matrix = submissionCoverageMatrix();
    expect(matrix.regions).toEqual(CORE_REGIONS);
    for (const row of matrix.rows) {
      for (const cell of row.cells) {
        const at = `${row.family}/${row.productClass}/${cell.region}`;
        if (cell.region === 'US') {
          expect(cell.buildSupported, at).toBe(true);
          expect(cell.submitSupported, at).toBe(true);
        } else {
          // EU and JP Module 1 is filed flat. EU: centralised MAA (eSubmission
          // Gateway not connected) or CTA (CTIS portal). JP: the adapter refuses.
          expect(cell.buildSupported, at).toBe(false);
          expect(cell.submitSupported, at).toBe(false);
        }
      }
      expect(row.fullyCovered).toBe(false);
    }
    expect(matrix.summary).toMatch(/^4\/12 .*support both region-correct build and gateway submission/);
  });
});

describe('submission resolver — registry lookups', () => {
  it('picks a regional entry by family + product class', () => {
    const usBio = pickRegionalEntry('US', 'marketing_authorization', 'biologic');
    expect(usBio).toBeDefined();
    expect(usBio!.region).toBe('US');
    expect(usBio!.applicationFamily).toBe('marketing_authorization');
  });
});
