/**
 * A filing whose own registry entry names a different channel must not be
 * reported submittable through its region's default gateway.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `getSubmittability` reads the gateway from the entry's REGION
 * (`REGION_IDENTITY[region].defaultGateway`) and awards `submittable` as soon as
 * that pair is registered. It never consults the entry's own
 * `submissionFormat`.
 *
 * `EU_CTA` declares `submissionFormat: 'CTIS'`, and its `moduleAuthority` in
 * shared/regulatory/global-document-registry.ts says so in the repository's own
 * words: "a CTR CTA is a Part I / Part II submission through CTIS, not an eCTD
 * five-module dossier." `REGION_IDENTITY.EU.defaultGateway` is `cesp` — the
 * medicines dossier gateway. So the registry states one channel and the
 * submittability report asserts another, and the report wins because it is what
 * the coverage number is computed from.
 *
 * CTIS is a web portal: a sponsor uploads a Part I / Part II application through
 * it. There is no gateway transmission to be had, so `submittable` is not
 * merely routed wrong — it is unachievable by any transport. Reporting it as
 * achievable through CESP would send an operator to a channel that cannot
 * accept the application.
 *
 * The fix is scoped to what the repository itself asserts. eSTAR and eCopy are
 * NOT included: server/services/ivd-knowledge/regulatory/fda-ivd.ts:81 says
 * CDRH submissions go through "the CDRH Customer Collaboration Portal/eSG",
 * which leaves a gateway path open, and this file does not decide questions the
 * codebase hedges on.
 */
import { describe, it, expect } from 'vitest';
import { getApplicationType } from '../../../../../shared/regulatory/global-document-registry';
import { getSubmittability, buildSubmittabilityReport } from '../submittabilityCoverage';

describe('submittability honours the channel the entry declares', () => {
  it('does not report an EU CTA submittable through the medicines dossier gateway', () => {
    const entry = getApplicationType('EU_CTA');
    expect(entry, 'EU_CTA missing from the registry').toBeTruthy();
    expect(entry!.submissionFormat, 'the premise: the entry declares CTIS').toBe('CTIS');

    const s = getSubmittability(entry!);
    expect(
      s.tier,
      'an application the registry says goes through CTIS is reported submittable via CESP',
    ).not.toBe('submittable');
    expect(s.tier).toBe('portal_only');
  });

  it('names the channel it cannot transmit to, rather than reporting a bare gap', () => {
    const s = getSubmittability(getApplicationType('EU_CTA')!);
    // An operator has to know WHERE to go instead; "no gateway" alone sends
    // them looking for a missing integration.
    expect(String(s.portalChannel ?? '')).toMatch(/CTIS/i);
  });

  it('leaves every eCTD filing in the same region submittable', () => {
    // The positive control. EU_MAA is an eCTD dossier and CESP is its real
    // channel; a repair that demoted the whole region would be worthless.
    const maa = getSubmittability(getApplicationType('EU_MAA')!);
    expect(maa.tier, 'the EU marketing application lost its gateway').toBe('submittable');

    const ind = getSubmittability(getApplicationType('US_IND')!);
    expect(ind.tier).toBe('submittable');
  });

  it('counts the portal-only channel in the report rather than hiding it in submittable', () => {
    const report = buildSubmittabilityReport();
    const tiers = report.byTier;
    expect(tiers.portal_only).toBeGreaterThan(0);
    const total = tiers.submittable + tiers.not_a_filing + tiers.no_identity
                + tiers.no_gateway + tiers.portal_only;
    expect(total, 'the tier buckets no longer reconcile to the total').toBe(report.total);

    // Reported on its own, not folded into the integration backlog: no
    // integration will ever make a portal submission transmittable.
    expect(report.portalOnly.map((c) => c.id)).toContain('EU_CTA');
    expect(report.gaps.map((c) => c.id)).not.toContain('EU_CTA');
  });
});
