/**
 * Submittability — every filing type a customer can START must be one they can FINISH.
 *
 * ── What this pins that registryCoverage does not ─────────────────────────────
 * `registryCoverage` measures the AUTHORING half: section blueprint, task plan,
 * required forms. Its `production_ready` tier is computed from those three
 * inputs and nothing else. A filing type can be `production_ready` by that
 * definition and have no path off the platform.
 *
 * The back half — package, validate, transmit — was complete when this test was
 * written, and nothing asserted it. That is the failure mode: add a region to
 * `GLOBAL_REGISTRY` and its filing types become selectable at project initiation
 * immediately. Without a `region-identity` entry and a registered gateway there
 * is no way to submit them, no test notices, and the customer finds out at the
 * end of a submission rather than us at the start of a pull request.
 *
 * ── Why components are excluded rather than counted as failures ───────────────
 * The 22 ICH entries (CSR, protocol, IB, ICF, SAP, CTD modules) and the device
 * QMS records are document COMPONENTS. They are authored into a regional dossier
 * and travel inside it — a DSUR reaches FDA inside an IND sequence over ESG. They
 * have no gateway of their own and should not. A coverage number that counts them
 * as gaps is a number people learn to ignore, so they are classified
 * `not_a_filing` — and this file asserts that the classification is not quietly
 * swallowing real filings, which is the only way this gate goes blind.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSubmittabilityReport,
  computeSubmittability,
  getSubmittability,
  getUnsubmittableFilings,
} from '../../server/services/regulatory/registry/submittabilityCoverage';
import { GLOBAL_REGISTRY } from '../../shared/regulatory/global-document-registry';

describe('every startable filing type is finishable', () => {
  it('NO filing type is selectable but unsubmittable', () => {
    const gaps = getUnsubmittableFilings();
    expect(
      gaps,
      `these filing types can be chosen at project initiation but cannot reach a gateway:\n` +
        gaps.map(g => `    ${g.id} (${g.region}) — ${g.tier}`).join('\n') +
        `\n  Fix by adding the region to shared/regulatory/region-identity.ts and` +
        `\n  registering its gateway in server/services/submission-gateways/index.ts.`
    ).toEqual([]);
  });

  it('every region carrying filings resolves to a registered gateway pair', () => {
    const report = buildSubmittabilityReport();
    const unreachable = report.byRegion.filter(r => r.filings > 0 && !r.reachable);
    expect(unreachable.map(r => r.region)).toEqual([]);
  });

  it('every region carrying filings declares an M1 backbone', () => {
    // The regional backbone is what the packager writes; a region with a gateway
    // but no backbone produces a bundle the agency will reject.
    const missing = computeSubmittability().filter(
      c => c.tier === 'submittable' && !c.hasM1Backbone
    );
    expect(missing.map(c => `${c.id}/${c.region}`)).toEqual([]);
  });
});

describe('the classification is not hiding real filings', () => {
  // If `not_a_filing` ever swallowed a real filing, this whole gate would report
  // zero gaps while the customer could not submit. These are the assertions that
  // keep the exclusion honest.

  it('classifies the ICH document set as components, not filings', () => {
    for (const id of ['ICH_CSR', 'ICH_PROTOCOL', 'ICH_IB', 'ICH_ICF', 'ICH_SAP']) {
      const entry = GLOBAL_REGISTRY.find(e => e.id === id);
      expect(entry, `${id} missing from the registry`).toBeDefined();
      expect(getSubmittability(entry!).tier).toBe('not_a_filing');
    }
  });

  it('does NOT classify the marketing-authorisation spine as components', () => {
    // The load-bearing assertion. These are the filings the business runs on; if
    // any were ever classified `not_a_filing` the gate would go quiet about them.
    for (const id of ['US_IND', 'US_NDA', 'US_BLA', 'EU_CTA', 'EU_MAA', 'CA_NDS', 'JP_CTN']) {
      const entry = GLOBAL_REGISTRY.find(e => e.id === id);
      expect(entry, `${id} missing from the registry`).toBeDefined();
      expect(getSubmittability(entry!).tier, `${id} must be a real, submittable filing`).toBe(
        'submittable'
      );
    }
  });

  it('keeps the component set a small minority of the registry', () => {
    // A drifting family classification would show up here first: if components
    // ever outnumbered filings, the exclusion rule has stopped meaning what it
    // says rather than the registry having genuinely changed shape.
    const report = buildSubmittabilityReport();
    expect(report.byTier.not_a_filing).toBeLessThan(report.byTier.submittable / 2);
  });

  it('treats a safety report as a component only when it is region-agnostic', () => {
    // ICH_DSUR is a component; a regional safety report is a filing. Region
    // decides, and getting this backwards would silently exclude real filings.
    const ich = GLOBAL_REGISTRY.find(e => e.id === 'ICH_DSUR');
    expect(ich && getSubmittability(ich).tier).toBe('not_a_filing');

    const regionalSafety = GLOBAL_REGISTRY.filter(
      e => String(e.applicationFamily) === 'safety_report' && e.region !== 'GLOBAL'
    );
    expect(regionalSafety.length).toBeGreaterThan(0);
    for (const e of regionalSafety) {
      expect(getSubmittability(e).tier, `${e.id} is a regional filing, not a component`).toBe(
        'submittable'
      );
    }
  });
});

describe('the report is usable by an operator', () => {
  it('accounts for every registry entry exactly once', () => {
    const report = buildSubmittabilityReport();
    const summed = Object.values(report.byTier).reduce((a, b) => a + b, 0);
    expect(summed).toBe(report.total);
    expect(report.total).toBe(GLOBAL_REGISTRY.length);
  });

  it('rolls up by region, which is where a gap is actually fixed', () => {
    const report = buildSubmittabilityReport();
    const us = report.byRegion.find(r => r.region === 'US');
    expect(us?.gatewaySlug).toBe('fda');
    expect(us?.defaultGateway).toBe('esg');
    expect(us!.filings).toBeGreaterThan(0);
  });
});
