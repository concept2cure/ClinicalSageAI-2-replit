/**
 * Pre-transmit precondition gate — size limit (hard), flag-gated PDF/A + DTD,
 * external opt-out, and the guarded transmit refusing an over-limit package.
 */

import { describe, it, expect } from 'vitest';
import { evaluatePreTransmit } from '../pre-transmit-check';
import { getGateway } from '../index';
import type { SubmissionBundle } from '../types';

const GB = 1024 ** 3;

function bundle(over: Partial<SubmissionBundle> = {}): SubmissionBundle {
  return {
    path: '/tmp/x.zip',
    sha256: 'a'.repeat(64),
    sizeBytes: 1000,
    format: 'ectd',
    ...over,
  };
}

describe('evaluatePreTransmit', () => {
  it('always blocks a package over the gateway size limit', () => {
    const r = evaluatePreTransmit({ region: 'fda', bundle: bundle({ sizeBytes: 999 * GB }), environment: 'production', enforceExternal: false });
    expect(r.cleared).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/over the FDA gateway limit/);
    expect(r.checks.find((c) => c.name === 'gateway-size-limit')?.passed).toBe(false);
  });

  it('clears a small package with no flags set', () => {
    const r = evaluatePreTransmit({ region: 'fda', bundle: bundle(), environment: 'production', enforceExternal: false, env: {} });
    expect(r.cleared).toBe(true);
  });

  it('blocks unconverted PDF/A only in production when ECTD_REQUIRE_PDFA is set', () => {
    const b = bundle({ submissionGrade: { total: 2, pdfLeaves: 2, pdfaConverted: 1, notConverted: ['m1/us/1-2/cover.pdf'], allPdfA: false } });
    const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_PDFA: 'true' } });
    expect(prod.cleared).toBe(false);
    expect(prod.blockers.join(' ')).toMatch(/not PDF\/A/);
    // staging never blocks
    const staging = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'staging', enforceExternal: false, env: { ECTD_REQUIRE_PDFA: 'true' } });
    expect(staging.cleared).toBe(true);
    // flag unset never blocks
    const noflag = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: {} });
    expect(noflag.cleared).toBe(true);
  });

  it('blocks a non-self-contained DTD package only when ECTD_REQUIRE_DTD is set in production', () => {
    const b = bundle({ dtdStatus: { required: ['ich-ectd-3-2.dtd'], present: [], missing: ['ich-ectd-3-2.dtd'], selfContained: false } });
    const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' } });
    expect(prod.cleared).toBe(false);
    expect(prod.blockers.join(' ')).toMatch(/not DTD self-contained/);
    const noflag = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: {} });
    expect(noflag.cleared).toBe(true);
  });

  it('warns (does not block) when a required flag is set but the bundle has no evidence', () => {
    const r = evaluatePreTransmit({ region: 'fda', bundle: bundle(), environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_PDFA: 'true', ECTD_REQUIRE_DTD: 'true' } });
    expect(r.cleared).toBe(true);
    expect(r.warnings.length).toBe(2);
  });

  it('HARD-blocks a bundle built for another region (backbone region ≠ transmit target), in every environment', () => {
    // The gate used to be region-blind: a pmda-built bundle passed the FDA gate
    // because regionConformant was true — for PMDA.
    const built = bundle({ format: 'pmda_ectd', regionalBackbone: { region: 'pmda', file: 'm1/jp/jp-regional.xml', regionConformant: true } });
    for (const environment of ['staging', 'production'] as const) {
      const r = evaluatePreTransmit({ region: 'fda', bundle: built, environment, enforceExternal: false, env: {} as NodeJS.ProcessEnv });
      expect(r.cleared).toBe(false);
      expect(r.checks.find((c) => c.name === 'regional-backbone-region')?.passed).toBe(false);
      expect(r.blockers.some((b) => /assembled for PMDA .* cannot be transmitted to FDA/.test(b))).toBe(true);
      expect(r.blockers.some((b) => /format 'pmda_ectd' does not match the FDA gateway/.test(b))).toBe(true);
    }
  });

  it('a bundle built for the target region passes the region-identity checks', () => {
    const built = bundle({ format: 'pmda_ectd', regionalBackbone: { region: 'pmda', file: 'm1/jp/jp-regional.xml', regionConformant: true } });
    const r = evaluatePreTransmit({ region: 'pmda', bundle: built, environment: 'production', enforceExternal: false, env: {} as NodeJS.ProcessEnv });
    expect(r.cleared).toBe(true);
    expect(r.checks.find((c) => c.name === 'regional-backbone-region')?.passed).toBe(true);
    // And an 'ectd' bundle is refused by the PMDA gateway on format alone.
    const wrongFormat = evaluatePreTransmit({ region: 'pmda', bundle: bundle({ format: 'ectd' }), environment: 'production', enforceExternal: false, env: {} as NodeJS.ProcessEnv });
    expect(wrongFormat.cleared).toBe(false);
    expect(wrongFormat.blockers.some((b) => /format 'ectd' does not match the PMDA gateway/.test(b))).toBe(true);
  });

  it('a PDF/A grade with no fields is NOT evidence: under ECTD_REQUIRE_PDFA in production it warns "cannot prove", never passes', () => {
    const r = evaluatePreTransmit({
      region: 'fda', bundle: bundle({ submissionGrade: {} as any }), environment: 'production',
      enforceExternal: false, env: { ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv,
    });
    expect(r.checks.find((c) => c.name === 'pdfa-submission-grade')).toBeUndefined();
    expect(r.warnings.some((w) => /cannot prove PDF\/A/.test(w))).toBe(true);
  });

  it('folds the external gate when enforceExternal is on (route layer)', () => {
    const r = evaluatePreTransmit({
      region: 'fda', bundle: bundle(), environment: 'production',
      enforceExternal: true, externalConfigured: false, externalReport: null,
      env: { ECTD_REQUIRE_EVALIDATOR: 'true' },
    });
    expect(r.cleared).toBe(false); // required + could not run ⇒ block
    expect(r.blockers.join(' ')).toMatch(/eValidator/);
  });
});

describe('guarded transmit', () => {
  const auth = { kind: 'governed-signature' as const, signatureActionId: 'sig-1', actorUserId: 42 };

  it('refuses to transmit an over-limit package (before hitting the gateway)', async () => {
    const gw = getGateway('fda', 'esg');
    await expect(
      gw.transmit({
        organizationId: 1, userId: 42, programId: null, packageId: null,
        bundle: bundle({ sizeBytes: 999 * GB }),
        authorization: auth,
        environment: 'production',
      }),
    ).rejects.toThrow(/pre-transmit checks/);
  });

  it('still refuses without authorization (auth gate precedes the package gate)', async () => {
    const gw = getGateway('fda', 'esg');
    await expect(
      gw.transmit({
        organizationId: 1, userId: 42, programId: null, packageId: null,
        bundle: bundle({ sizeBytes: 999 * GB }),
        // @ts-expect-error — intentionally omitting authorization
        authorization: undefined,
        environment: 'production',
      }),
    ).rejects.toThrow(/no human authorization/);
  });
});
