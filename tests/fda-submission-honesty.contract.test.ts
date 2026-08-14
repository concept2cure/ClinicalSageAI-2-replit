/**
 * Integrity contract (C2C-SUB-004): the platform never claims an FDA submission
 * that did not happen — and there is exactly ONE way to make one that did.
 *
 * ── The original defect ──────────────────────────────────────────────────────
 * Three surfaces claimed an agency event nothing had performed. None of them
 * was the AS2 gateway the audit named — that one
 * (server/services/submission-gateways/fda-esg.ts) genuinely transmits, and its
 * sibling honesty controls in acknowledgement.ts are already correct.
 *
 *   1. ESGSubmissionService gated simulation on `NODE_ENV !== 'production'`, so
 *      every environment that is not that exact string — unset, blank,
 *      'staging', 'preview', 'Production' — returned a fabricated FDA
 *      acceptance: status 'accepted', an ACK number, and a downloadable file
 *      headed "FDA Electronic Submission Gateway / Acknowledgment Receipt"
 *      reporting "Status: RECEIVED". Callers then persisted the package as
 *      submitted with an FDA acknowledgment number.
 *   2. medicalDeviceService.submit510kToFDA performed no network call at all,
 *      yet wrote submissionStatus 'submitted' with an actualSubmissionDate,
 *      logged the attempt as a success — which stamps httpStatusCode 200 into
 *      fda_integration_logs — and returned "sent to FDA successfully".
 *   3. The deleted POST /api/medical-devices/510k/:id/submit route minted an
 *      `ACK<timestamp>` and a synthetic K-number (pinned separately in
 *      tests/routes/medical-device-510k-submit-removed.test.ts).
 *
 * ── What changed, and what these tests now pin ───────────────────────────────
 * Making (1) honest left the platform with a worse structural problem: TWO ESG
 * code paths, and the product calling the wrong one. `ESGSubmissionService`
 * assembled a package and then refused (in production) or returned a
 * `SIMULATED-NOT-SENT-*` record, while the real AS2/RFC-4130 implementation sat
 * behind the gateway registry reachable only from the HTTP transmit route. The
 * device transmit affordance was therefore honest but permanently inert: it
 * could never reach an agency.
 *
 * ESGSubmissionService — the whole second transport, and the package assembly
 * that fed it (a zip of JSON documents plus a hand-built `estar.xml`, which is
 * neither an FDA eSTAR nor a valid eCopy) — is deleted. Both callers now run the
 * SAME governed transmit
 * (server/services/submission-gateways/governed-transmit.ts), which ends at the
 * real gateway. So the contract has two halves now:
 *
 *   HONESTY  — no path fabricates an agency response, and a missing credential
 *              is a structured refusal naming the configuration.
 *   SINGULARITY — there is one transport, so there is nowhere for a second,
 *              fabricating one to hide.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — records must accurately reflect events.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(REPO_ROOT, rel));

/**
 * Source with comments removed. These assertions are about what the CODE does;
 * files legitimately quote the removed fabrications in comments as the record of
 * why they are gone (same idiom as tests/regulatory-honesty.contract.test.ts).
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Recursively collect non-test source files under a directory. */
function sourceFilesUnder(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '__tests__') {
          stack.push(full);
        }
      } else if (/\.(ts|js|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

describe('the simulating second ESG transport stays deleted', () => {
  it('server/services/ESGSubmissionService.ts does not exist', () => {
    expect(
      exists('server/services/ESGSubmissionService.ts'),
      'ESGSubmissionService is back on disk — the second, non-transmitting ESG path has returned. ' +
        'There is one transport: server/services/submission-gateways/fda-esg.ts, reached through ' +
        'server/services/submission-gateways/governed-transmit.ts.',
    ).toBe(false);
  });

  it('nothing under server/ imports it', () => {
    for (const file of sourceFilesUnder(path.join(REPO_ROOT, 'server'))) {
      const stripped = stripComments(fs.readFileSync(file, 'utf8'));
      expect(
        /from\s+['"][^'"]*ESGSubmissionService['"]|import\(\s*['"][^'"]*ESGSubmissionService['"]/.test(stripped),
        `${path.relative(REPO_ROOT, file)} imports ESGSubmissionService`,
      ).toBe(false);
    }
  });

  it('no server code mints a simulated ESG transaction or acknowledgement', () => {
    // The exact fabrications the deleted service produced, and the ones that
    // preceded it. None may reappear anywhere in server code.
    const FABRICATIONS: Array<[RegExp, string]> = [
      [/SIMULATED-NOT-SENT-/, 'mints a locally-simulated ESG transaction identifier'],
      [/simulated_not_transmitted/, 'reintroduces the simulated-transmission status'],
      [/Test submission accepted successfully/i, 'reports a fabricated FDA acceptance'],
      [/TEST-TXN-/, 'mints a fabricated FDA transaction id'],
      [/Acknowledgment Receipt/i, 'emits a document that reads as an FDA acknowledgement'],
    ];
    for (const file of sourceFilesUnder(path.join(REPO_ROOT, 'server'))) {
      const stripped = stripComments(fs.readFileSync(file, 'utf8'));
      const rel = path.relative(REPO_ROOT, file);
      for (const [re, why] of FABRICATIONS) {
        expect(stripped, `${rel} ${why}`).not.toMatch(re);
      }
    }
  });
});

describe('there is exactly one path from the platform to an agency gateway', () => {
  /**
   * `gw.transmit(` is the call that puts bytes on an agency endpoint. Only the
   * shared governed transmit and the canonical eCTD submission spine may make
   * it; a fourth site would be a second transport by definition.
   *
   * (The gateway implementations themselves define `transmit`; they are the
   * transport, not callers of it, and they live under submission-gateways/.)
   */
  const ALLOWED_TRANSMIT_CALLERS = new Set([
    'server/services/submission-gateways/governed-transmit.ts',
    'server/services/submission-service/submission-service.ts',
  ]);

  it('only the governed transmit and the eCTD spine invoke a gateway transmit', () => {
    const offenders: string[] = [];
    for (const file of sourceFilesUnder(path.join(REPO_ROOT, 'server'))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (ALLOWED_TRANSMIT_CALLERS.has(rel)) continue;
      const stripped = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\bgw\.transmit\s*\(|\bgateway\.transmit\s*\(/.test(stripped)) offenders.push(rel);
    }
    expect(
      offenders,
      `these files transmit to an agency outside the shared governed transmit: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it("the product's 510(k) transmit handler runs the shared governed transmit", () => {
    const src = read('server/services/ana-ri/mdx-command-handlers.ts');
    expect(src).toMatch(/submission-gateways\/governed-transmit/);
    expect(src).toMatch(/executeGovernedTransmit/);
    // And is pinned to the real FDA ESG gateway, not a stand-in.
    expect(src).toMatch(/region:\s*'fda'/);
    expect(src).toMatch(/gateway:\s*'esg'/);
  });

  it('the HTTP transmit route runs the same shared governed transmit', () => {
    const src = read('server/routes/mdx-submission-gateway.ts');
    expect(src).toMatch(/executeGovernedTransmit/);
  });
});

describe('the governed transmit cannot be reached without a named human gate', () => {
  // Comment-stripped: the handler quotes the rejected `if (ctx.part11Enforce)`
  // shape in a comment explaining why the gate is unconditional.
  const handler = stripComments(read('server/services/ana-ri/mdx-command-handlers.ts'));

  it('the 510(k) transmit handler requires a verified Part 11 signature unconditionally', () => {
    // NOT `if (ctx.part11Enforce)`: that flag is a per-tenant opt-in defaulting
    // OFF, and an agency transmission is not something a tenant may opt out of.
    expect(handler).toMatch(/validateSignoff\(ctx\.signoff,\s*\{\s*requireSignature:\s*true\s*\}\)/);
    expect(handler).not.toMatch(/if\s*\(\s*ctx\.part11Enforce\s*\)/);
  });

  it('the handler refuses rather than synthesising a re-authentication time', () => {
    // Stamping `new Date()` as the moment a human was verified would put a
    // fabricated governance record on an irreversible transmission.
    expect(handler).toMatch(/const reauthVerifiedAt = ctx\.signoff\?\.verifiedAt/);
    expect(handler).not.toMatch(/reauthVerifiedAt:\s*new Date\(\)/);
  });

  it('transmit is in the Part 11 e-signature tier, so only the governed-action route can dispatch it', () => {
    const part11 = read('server/services/ana-ri/part11-governance.ts');
    const governed = part11.slice(
      part11.indexOf('PART11_GOVERNED_COMMANDS'),
      part11.indexOf('PART11_ESIGN_COMMANDS'),
    );
    const esign = part11.slice(part11.indexOf('PART11_ESIGN_COMMANDS'));
    expect(governed).toContain("'k510_workflow.transmit'");
    expect(esign).toContain("'k510_workflow.transmit'");
  });

  it('the gateway registry still refuses any transmit that names no human gate', () => {
    const registry = read('server/services/submission-gateways/index.ts');
    expect(registry).toMatch(/assertTransmitAuthorized/);
    expect(registry).toMatch(/TransmitAuthorizationError/);
  });

  it('the governed transmit never invents the verification instant itself', () => {
    const svc = stripComments(read('server/services/submission-gateways/governed-transmit.ts'));
    expect(svc).toMatch(/reauthVerifiedAt/);
    expect(svc).not.toMatch(/reauthVerifiedAt:\s*new Date\(\)/);
  });
});

describe('a missing credential is a refusal that names the configuration', () => {
  it('the FDA ESG gateway raises CredentialError listing every missing variable', () => {
    const src = read('server/services/submission-gateways/fda-esg.ts');
    expect(src).toMatch(/new CredentialError\('fda', 'esg', environment, missing\)/);
    for (const v of ['URL', 'AS2_FROM', 'CERT_PATH', 'KEY_PATH', 'FDA_CERT_PATH']) {
      expect(src).toContain(`FDA_ESG$\{environment === 'staging' ? '_STAGING' : ''}_${v}`);
    }
  });

  it('CredentialError renders the missing names into its message', () => {
    const types = read('server/services/submission-gateways/types.ts');
    expect(types).toMatch(/missing credentials: \$\{missing\.join\(', '\)\}/);
  });

  it("the 510(k) handler surfaces it as a refusal, never as a transmission", () => {
    const src = read('server/services/ana-ri/mdx-command-handlers.ts');
    expect(src).toMatch(/GATEWAY_NOT_CONFIGURED/);
    expect(src).toMatch(/Nothing was transmitted/);
    expect(src).toMatch(/no FDA acknowledgement exists/);
  });
});

describe('the 510(k) endpoint does not claim a transmission it never made', () => {
  const src = read('server/services/medicalDeviceService.ts');

  it('does not record the package as submitted to FDA', () => {
    expect(src).toMatch(/submissionStatus: 'ready_for_transmission'/);
    // The two writes that asserted an agency event.
    expect(src).not.toMatch(/submissionStatus: 'submitted',\s*\n\s*actualSubmissionDate/);
  });

  it('reports transmitted: false rather than success', () => {
    expect(src).toMatch(/transmitted: false/);
    expect(src).not.toContain('510(k) submission sent to FDA successfully');
    expect(src).toMatch(/NOT transmitted to FDA/);
  });

  it('does not stamp an HTTP status code for a call that was never made', () => {
    // fda_integration_logs is the table an inspector reads first; a synthetic
    // 200 against /fda/api/cdrh_portal is forged evidence of an API exchange.
    expect(src).toMatch(
      /httpStatusCode: status === 'success' \? 200 : status === 'failure' \? 500 : null/,
    );
    expect(src).toMatch(/'not_transmitted'/);
  });

  it('points the caller at the path that does transmit', () => {
    expect(src).toMatch(/Gateway Transmittals/);
  });
});
