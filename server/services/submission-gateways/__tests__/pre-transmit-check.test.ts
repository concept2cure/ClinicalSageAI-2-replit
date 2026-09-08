/**
 * Pre-transmit precondition gate — size limit (hard), flag-gated PDF/A + DTD,
 * external opt-out, and the guarded transmit refusing an over-limit package.
 */

import { describe, it, expect } from 'vitest';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluatePreTransmit } from '../pre-transmit-check';
import { packageEctdSubmission } from '../regional-packager';
import { getGateway } from '../index';
import type { SubmissionBundle } from '../types';
import {
  writeGoldenLeaves,
  v3GoldenInput,
} from '../../ectd/qualification/golden-fixtures';

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

  // ── Stylesheet-only gap ────────────────────────────────────────────────────
  // The DTD gate covers BOTH kinds of supportive file: util/dtd/*.dtd and
  // util/style/*.xsl (assessDtdReadiness sets selfContained from both). The
  // blocker printed `dtd.missing` only, so a package whose five DTDs were all
  // bundled but whose two stylesheets were not refused the transmit with
  // "…(missing )" — a refusal that named no file, leaving the operator nothing
  // to act on. The absent set the gate prints must be the same set it judged.
  it('names the absent STYLESHEETS when the self-containment gap is stylesheet-only', () => {
    const b = bundle({
      dtdStatus: {
        required: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'],
        present: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'],
        missing: [],
        missingStylesheets: ['ectd-2-0.xsl', 'us-regional.xsl'],
        selfContained: false,
      },
    });
    const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' } });
    expect(prod.cleared).toBe(false);
    const blocker = prod.blockers.join(' ');
    expect(blocker).toContain('ectd-2-0.xsl');
    expect(blocker).toContain('us-regional.xsl');
    // The empty-list rendering the defect produced.
    expect(blocker).not.toMatch(/missing \)/);
    // The surfaced check must itemise the same gap, not report "missing: ".
    const check = prod.checks.find((c) => c.name === 'dtd-self-contained');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('ectd-2-0.xsl');
  });

  // Fail closed: a bundle assembled before the stylesheet gap was itemised can
  // carry selfContained:false with nothing listed at all. That must read as
  // "not itemised", never as a clean empty list.
  it('never renders a non-self-contained package as a blocker that names nothing', () => {
    const b = bundle({
      dtdStatus: { required: ['ich-ectd-3-2.dtd'], present: ['ich-ectd-3-2.dtd'], missing: [], selfContained: false },
    });
    const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' } });
    expect(prod.cleared).toBe(false);
    expect(prod.blockers.join(' ')).toMatch(/not itemised|not recorded/i);
    expect(prod.checks.find((c) => c.name === 'dtd-self-contained')?.detail).toMatch(/not itemised|not recorded/i);
  });

  // ── Unexpected input on the self-containment evidence ─────────────────────
  // `dtdStatus` reaches this gate off a persisted bundle record, so its fields
  // arrive as whatever was stored, not as whatever the TypeScript type says.
  // `passed: dtd.selfContained` and `!dtd.selfContained` are truthiness tests:
  // the string "false" — a JSON round-trip through a text column, a form value —
  // is truthy, so a NOT-self-contained package reported "dtd-self-contained:
  // passed" and raised no blocker. Anything that is not exactly `true` must read
  // as unproven.
  it('treats a non-boolean selfContained as UNPROVEN, never as cleared', () => {
    for (const bogus of ['false', 'true', 1, 0, null, undefined, {}]) {
      const b = bundle({
        dtdStatus: {
          required: ['ich-ectd-3-2.dtd'],
          present: ['ich-ectd-3-2.dtd'],
          missing: [],
          selfContained: bogus as unknown as boolean,
        },
      });
      const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' } });
      expect(prod.checks.find((c) => c.name === 'dtd-self-contained')?.passed, `selfContained=${JSON.stringify(bogus)}`).toBe(false);
      expect(prod.cleared, `selfContained=${JSON.stringify(bogus)}`).toBe(false);
    }
  });

  it('treats a non-array missing list as un-itemised, not as "nothing missing"', () => {
    const b = bundle({
      dtdStatus: {
        required: ['ich-ectd-3-2.dtd'],
        present: [],
        missing: null as unknown as string[],
        selfContained: false,
      },
    });
    const prod = evaluatePreTransmit({ region: 'fda', bundle: b, environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_DTD: 'true' } });
    expect(prod.cleared).toBe(false);
    expect(prod.blockers.join(' ')).toMatch(/not itemised/);
  });

  it('warns (does not block) when a required flag is set but the bundle has no evidence', () => {
    const r = evaluatePreTransmit({ region: 'fda', bundle: bundle(), environment: 'production', enforceExternal: false, env: { ECTD_REQUIRE_PDFA: 'true', ECTD_REQUIRE_DTD: 'true' } });
    expect(r.cleared).toBe(true);
    // PDF/A, DTD — and the bundle records no region it was built for.
    expect(r.warnings.length).toBe(3);
    expect(r.warnings.some((w) => /no record of the region it was built for/.test(w))).toBe(true);
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

  it('region identity holds WITHOUT backbone evidence: an eSTAR built for FDA is refused by PMDA and EMA, and a descriptor-declared region is honoured', () => {
    // Device formats carry no regional backbone; the format itself pins the region.
    const estar = bundle({ format: 'estar' as any, builtRegion: 'fda' });
    for (const region of ['pmda', 'ema'] as const) {
      const r = evaluatePreTransmit({ region, bundle: estar, environment: 'production', enforceExternal: false, env: {} as NodeJS.ProcessEnv });
      expect(r.cleared, region).toBe(false);
      expect(r.blockers.some((b) => /format 'estar' does not match/.test(b)), region).toBe(true);
    }
    const eudamed = bundle({ format: 'eudamed_register' as any, builtRegion: 'ema' });
    expect(evaluatePreTransmit({ region: 'fda', bundle: eudamed, environment: 'staging', enforceExternal: false, env: {} as NodeJS.ProcessEnv }).cleared).toBe(false);
    // An eCTD bundle with only a declared built region (legacy: no backbone block) still cannot cross regions.
    const declaredOnly = bundle({ format: 'ectd', builtRegion: 'fda' });
    const crossed = evaluatePreTransmit({ region: 'ema', bundle: declaredOnly, environment: 'production', enforceExternal: false, env: {} as NodeJS.ProcessEnv });
    expect(crossed.cleared).toBe(false);
    expect(crossed.blockers.some((b) => /assembled for FDA \(descriptor\); it cannot be transmitted to EMA/.test(b))).toBe(true);
    // No evidence at all: reported as unprovable, never treated as matching.
    const none = evaluatePreTransmit({ region: 'fda', bundle: bundle(), environment: 'production', enforceExternal: false, env: {} as NodeJS.ProcessEnv });
    expect(none.cleared).toBe(true);
    expect(none.warnings.some((w) => /no record of the region it was built for/.test(w))).toBe(true);
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

/**
 * ── The producer → consumer path, end to end ─────────────────────────────────
 *
 * `dtdStatus.missingStylesheets` has exactly ONE producer in the repo
 * (regional-packager.ts, from `dtdGate.missingStylesheets`) and ONE consumer
 * (evaluatePreTransmit). The tests above hand-construct the field, so deleting
 * the producer line left every one of them green while the shipping path went
 * back to refusing a stylesheet-only gap with an empty file list.
 *
 * This builds a REAL package with the packager against a drop-point that holds
 * every DTD and neither stylesheet, then feeds the bundle the packager actually
 * returns into the gate. Nothing is hand-constructed: remove the field from the
 * packager and this fails.
 */
describe('packager → pre-transmit: the stylesheet gap survives the bundle', () => {
  const DTDS = ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'];
  const STYLESHEETS = ['ectd-2-0.xsl', 'us-regional.xsl'];

  async function buildFdaBundle(dropFiles: string[]): Promise<SubmissionBundle> {
    const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'pre-transmit-wiring-'));
    const drop = path.join(work, 'drop');
    await fsp.mkdir(drop, { recursive: true });
    for (const f of dropFiles) {
      await fsp.writeFile(
        path.join(drop, f),
        f.endsWith('.xsl')
          ? '<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>'
          : `<!-- stand-in ${f} -->\n<!ELEMENT placeholder EMPTY>\n`,
        'utf8',
      );
    }
    const previous = process.env.ECTD_DTD_DIR;
    process.env.ECTD_DTD_DIR = drop;
    try {
      const paths = await writeGoldenLeaves(path.join(work, 'leaves'));
      return await packageEctdSubmission(
        v3GoldenInput({
          region: 'fda',
          sequence: '0000',
          applicationId: '123456',
          outputDir: path.join(work, 'out'),
          paths,
        }),
      );
    } finally {
      if (previous === undefined) delete process.env.ECTD_DTD_DIR;
      else process.env.ECTD_DTD_DIR = previous;
      // The bundle's ZIP is read by nothing below; only its dtdStatus matters.
      await fsp.rm(work, { recursive: true, force: true });
    }
  }

  it('carries the absent stylesheets from the packager into the transmit blocker', async () => {
    const built = await buildFdaBundle(DTDS); // every DTD, neither stylesheet
    // Producer side: the gap is stylesheet-only, and it is ITEMISED on the bundle.
    expect(built.dtdStatus?.selfContained).toBe(false);
    expect(built.dtdStatus?.missing).toEqual([]);
    expect(built.dtdStatus?.missingStylesheets).toEqual(STYLESHEETS);

    // Consumer side: the same set the packager judged is the set the gate prints.
    const r = evaluatePreTransmit({
      region: 'fda',
      bundle: built,
      environment: 'production',
      enforceExternal: false,
      env: { ECTD_REQUIRE_DTD: 'true' },
    });
    expect(r.cleared).toBe(false);
    const blocker = r.blockers.join(' ');
    for (const xsl of STYLESHEETS) expect(blocker).toContain(xsl);
    // The un-itemised fallback is the honest reading of a bundle that carries
    // NO stylesheet list — it must not be what a correctly-wired bundle gets.
    expect(blocker).not.toMatch(/not itemised/);
  }, 30000);

  it('POSITIVE CONTROL: a complete drop-point clears the same gate', async () => {
    const built = await buildFdaBundle([...DTDS, ...STYLESHEETS]);
    expect(built.dtdStatus?.selfContained).toBe(true);
    expect(built.dtdStatus?.missingStylesheets).toEqual([]);
    const r = evaluatePreTransmit({
      region: 'fda',
      bundle: built,
      environment: 'production',
      enforceExternal: false,
      env: { ECTD_REQUIRE_DTD: 'true' },
    });
    expect(r.checks.find((c) => c.name === 'dtd-self-contained')?.passed).toBe(true);
    expect(r.blockers.join(' ')).not.toMatch(/self-contained/);
  }, 30000);
});
