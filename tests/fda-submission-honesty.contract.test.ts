/**
 * Integrity contract (C2C-SUB-004): the platform never claims an FDA submission
 * that did not happen.
 *
 * Two paths made that claim. Neither was the AS2 gateway the audit named — that
 * one (server/services/submission-gateways/fda-esg.ts) genuinely transmits, and
 * its sibling honesty controls in acknowledgement.ts are already correct.
 *
 *   1. ESGSubmissionService gated simulation on `NODE_ENV !== 'production'`, so
 *      every environment that is not that exact string — unset, blank,
 *      'staging', 'preview', 'Production' — returned a fabricated FDA
 *      acceptance: status 'accepted', an ACK number, and a downloadable file
 *      headed "FDA Electronic Submission Gateway / Acknowledgment Receipt"
 *      reporting "Status: RECEIVED". Callers then persisted the package as
 *      submitted with an FDA acknowledgment number.
 *
 *   2. medicalDeviceService.submit510kToFDA performed no network call at all,
 *      yet wrote submissionStatus 'submitted' with an actualSubmissionDate,
 *      logged the attempt as a success — which stamps httpStatusCode 200 into
 *      fda_integration_logs — and returned "sent to FDA successfully".
 *
 * A sponsor archiving either artifact would hold forged evidence of an agency
 * submission. These tests pin the honest behaviour.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — records must accurately reflect events.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const ORIGINAL_ENV = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('ESG simulation is opt-in and fails closed', () => {
  const simulationAllowed = async () => {
    const { default: Service } = await import('../server/services/ESGSubmissionService');
    return (Service as unknown as { simulationAllowed: () => boolean }).simulationAllowed();
  };

  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
    ['staging', false],
    ['preview', false],
    ['Production', false],
    ['', false],
  ])('NODE_ENV=%s → simulation allowed: %s', async (env, expected) => {
    process.env.NODE_ENV = env;
    expect(await simulationAllowed()).toBe(expected);
  });

  it('an unset NODE_ENV does not enable simulation', async () => {
    delete process.env.NODE_ENV;
    expect(await simulationAllowed()).toBe(false);
  });
});

describe('the simulated ESG response cannot be mistaken for a real one', () => {
  const src = read('server/services/ESGSubmissionService.ts');

  it('carries an explicit simulated marker', () => {
    expect(src).toMatch(/simulated: true/);
    expect(src).toMatch(/simulated\?: boolean/);
  });

  it('does not report an accepted status or mint an ACK number', () => {
    expect(src).toMatch(/status: 'simulated_not_transmitted' as const/);
    expect(src).toMatch(/acknowledgmentNumber: undefined/);
    // The old fabrication, gone.
    expect(src).not.toContain('Test submission accepted successfully');
    expect(src).not.toMatch(/transactionId: `TEST-TXN-/);
  });

  it('names itself as not transmitted in the identifier and the message', () => {
    expect(src).toMatch(/SIMULATED-NOT-SENT-/);
    expect(src).toMatch(/nothing was transmitted to FDA/i);
  });

  it('only records a submission for a status the transmitting path produces', () => {
    // The persistence gate keys on 'accepted', which the simulated path can no
    // longer return — so no simulated run can write submittedAt / submittedBy.
    expect(src).toMatch(/status: response\.status === 'accepted' \? 'submitted' : 'ready'/);
    expect(src).toMatch(/submittedAt: response\.status === 'accepted' \? new Date\(\) : null/);
  });

  it('persists a simulated run under its own honest package status', () => {
    // A simulated run must not leave the package stuck at 'ready' (a dead
    // transition) nor promote it to anything implying a real transmission.
    // Behavioural coverage of the full mapping lives in
    // server/services/__tests__/esg-submission-status.test.ts.
    expect(src).toMatch(/response\.simulated \|\| response\.status === 'simulated_not_transmitted'/);
    expect(src).toMatch(/status: 'simulated'/);
  });

  it('no longer emits a document that reads as an FDA acknowledgement', async () => {
    // Asserted on the ACTUAL bytes rather than the source: this is the artifact
    // a sponsor could archive, and it is the exact hazard that
    // server/services/submission-gateways/acknowledgement.ts exists to prevent.
    process.env.NODE_ENV = 'development';
    const { default: Service } = await import('../server/services/ESGSubmissionService');
    const doc = (await new Service().downloadAcknowledgment('SIMULATED-NOT-SENT-abc')).toString('utf8');

    expect(doc).not.toMatch(/FDA Electronic Submission Gateway/);
    expect(doc).not.toMatch(/Acknowledgment Receipt/);
    expect(doc).not.toMatch(/Status:\s*RECEIVED/);
    expect(doc).not.toMatch(/has been received/);

    expect(doc).toMatch(/THIS IS NOT AN AGENCY ACKNOWLEDGEMENT/);
    expect(doc).toMatch(/Transmitted:\s+NO/);
    expect(doc).toMatch(/Agency receipt:\s+NONE/);
    expect(doc).toMatch(/No submission was transmitted to FDA/);
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
