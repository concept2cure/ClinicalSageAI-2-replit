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
import {
  getSubmittability,
  buildSubmittabilityReport,
  submissionChannelFor,
} from '../submittabilityCoverage';

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

  it('does not report a centralised-procedure filing submittable through CESP', () => {
    /* Inverted 2026-10-05 (finding 42). This used to be the positive control,
       asserting EU_MAA 'submittable' because "CESP is its real channel". It is
       not: EMA made the eSubmission Gateway / Web Client mandatory for every
       centralised-procedure eCTD submission from 1 March 2014 and tells
       applicants not to send those submissions via CESP as well (regulator
       text, ema.europa.eu — g-submission-channel-function-facts.md). No
       eSubmission Gateway connector exists (Rule 2), so the honest tier is
       `no_gateway` — an integration that could be built — naming the channel. */
    const maa = getSubmittability(getApplicationType('EU_MAA')!);
    expect(maa.tier, 'a centralised MAA is reported submittable via CESP').toBe('no_gateway');
    expect(String(maa.channel ?? '')).toMatch(/eSubmission Gateway/);
    // The channel names the centralised channel only — CESP is the national one.
    expect(String(maa.channel ?? ''), 'the centralised channel must not mention CESP').not.toMatch(/CESP/i);
    expect(String(maa.channelReason ?? '')).toMatch(/^Centralised procedure/);
  });

  it('routes every centralised EMA eCTD filing to the eSubmission Gateway, not CESP', () => {
    for (const id of [
      'EU_MAA', 'EU_CMA', 'EU_BIOSIMILAR_MAA', 'EU_VARIATION_IA', 'EU_VARIATION_IB',
      'EU_VARIATION_II', 'EU_LINE_EXTENSION', 'EU_RENEWAL', 'EU_RMP', 'EU_PSUR',
    ]) {
      const entry = getApplicationType(id);
      expect(entry, `${id} missing from the registry`).toBeTruthy();
      const ch = submissionChannelFor(entry!);
      expect(ch.kind, `${id} is a centralised-procedure eCTD filing`).toBe('unconnected');
      if (ch.kind === 'unconnected') expect(ch.channel).toMatch(/eSubmission Gateway/);
      expect(getSubmittability(entry!).tier, id).toBe('no_gateway');
    }
  });

  it('keeps national, MRP and DCP filings on CESP — the positive control', () => {
    // A repair that demoted the whole region would be worthless. EU_GENERIC_DCP
    // is filed with National Competent Authorities, which is CESP's procedure.
    const dcp = getApplicationType('EU_GENERIC_DCP')!;
    expect(dcp.agency, 'the premise: a DCP is filed with NCAs').toBe('National_Competent_Authority');
    expect(submissionChannelFor(dcp)).toEqual({ kind: 'gateway', region: 'ema', name: 'cesp' });
    const s = getSubmittability(dcp);
    expect(s.tier).toBe('submittable');
    expect(s.defaultGateway).toBe('cesp');

    const ind = getSubmittability(getApplicationType('US_IND')!);
    expect(ind.tier).toBe('submittable');
  });

  it('is the one channel function: CTIS is a portal, an EMA device filing goes to EUDAMED', () => {
    expect(submissionChannelFor(getApplicationType('EU_CTA')!).kind).toBe('portal');
    expect(submissionChannelFor(getApplicationType('EU_PER')!)).toEqual({
      kind: 'gateway', region: 'ema', name: 'eudamed',
    });
    expect(submissionChannelFor(getApplicationType('US_IND')!)).toEqual({
      kind: 'gateway', region: 'fda', name: 'esg',
    });
  });

  it('lists the unconnected centralised filings in the integration backlog', () => {
    // An eSubmission Gateway connector is a buildable integration (a founder
    // decision under Rule 2), so these ARE gaps — unlike a portal filing.
    const report = buildSubmittabilityReport();
    expect(report.gaps.map((c) => c.id)).toContain('EU_MAA');
    expect(report.portalOnly.map((c) => c.id)).not.toContain('EU_MAA');
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

describe('an EMA filing outside the centralised procedure is not sent to the eSubmission Gateway', () => {
  it('does not claim the centralised procedure or the eSubmission Gateway for an EMA IRIS filing', () => {
    /* Fix round 2 (2026-10-05). EU_ORPHAN, EU_SCIENTIFIC_ADVICE, EU_PIP and
       EU_PRIME carry submissionFormat 'eCTD' in the registry, and the round-1
       rule (EU + EMA + eCTD → eSubmission Gateway) told a client applying for
       orphan designation "Centralised procedure — the eSubmission Gateway/Web
       Client is mandatory". EMA receives these through IRIS (regulator text,
       ema.europa.eu — g-submission-channel-function-facts.md rows 4-5). */
    for (const id of ['EU_ORPHAN', 'EU_SCIENTIFIC_ADVICE', 'EU_PIP', 'EU_PRIME']) {
      const entry = getApplicationType(id);
      expect(entry, `${id} missing from the registry`).toBeTruthy();
      const ch = submissionChannelFor(entry!);
      expect(ch.kind, `${id} must not fall back to the region default`).toBe('unconnected');
      const channel = ch.kind === 'unconnected' ? ch.channel : '';
      const reason = ch.kind === 'unconnected' ? ch.reason : '';
      expect(channel, id).toMatch(/IRIS/);
      expect(`${channel} ${reason}`, `${id} is not a centralised-procedure eCTD submission`).not.toMatch(
        /Centralised procedure|eSubmission Gateway|CESP/i,
      );
      const s = getSubmittability(entry!);
      expect(s.tier, id).toBe('no_gateway');
      expect(String(s.channelReason ?? ''), id).not.toMatch(/Centralised procedure/);
    }
  });

  it('fails closed for an EMA filing whose channel is not modelled — never the CESP region default', () => {
    // These EMA-agency entries have no modelled channel. Falling through to
    // REGION_IDENTITY.EU (cesp) reported them submittable through CESP, a
    // channel nothing on record says accepts them.
    for (const id of [
      'EU_EUDRAVIGILANCE_ICSR', 'EU_PSMF', 'EU_ACCEL_ASSESS', 'EU_REF_LAB',
      'EU_PERF_STUDY', 'EU_PMPF', 'EU_IVD_REEVAL', 'EU_IVDR_ART48_CONSULT',
    ]) {
      const entry = getApplicationType(id);
      expect(entry, `${id} missing from the registry`).toBeTruthy();
      expect(entry!.agency, `the premise: ${id} is an EMA-agency entry`).toBe('EMA');
      const ch = submissionChannelFor(entry!);
      expect(ch.kind, `${id} fell through to the region default`).toBe('unconnected');
      const text = ch.kind === 'unconnected' ? `${ch.channel} ${ch.reason}` : '';
      expect(text, id).toMatch(/not modelled/);
      expect(text, id).not.toMatch(/Centralised procedure|eSubmission Gateway/);
      expect(getSubmittability(entry!).tier, id).toBe('no_gateway');
    }
  });
});
