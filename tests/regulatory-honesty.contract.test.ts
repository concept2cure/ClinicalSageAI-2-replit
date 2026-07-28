/**
 * Contract: the product must not claim regulatory acts it does not perform.
 *
 * This is the third and fourth site of one defect. ESGSubmissionService minted
 * acknowledgement numbers for submissions it never sent; medicalDeviceService
 * wrote submissionStatus 'submitted' for 510(k)s it never transmitted. Both were
 * closed earlier. These two were still open:
 *
 *   1. server/services/ectd-submission-agent.ts — submitToGateway() validated the
 *      sequence, wrote `status = 'submitted'` with a history row reading
 *      "Submitted to agency gateway", and returned { status: 'submitted' }. There
 *      is no gateway client in that file: no AS2 handshake, no ESG connection, no
 *      bytes, no transmittal, no acknowledgement. A regulatory affairs lead
 *      reading that record — in the UI, in an export, during an inspection —
 *      would conclude the sequence had been filed.
 *
 *   2. client/src/concept2cure/v2/surfaces/Review.tsx — the "Electronic
 *      signature" dialog collected a password and a TOTP into component state,
 *      used NEITHER, wrote `window.C2C_SIGNED` (read nowhere in the repo), made
 *      zero network calls, attributed the signature to the hardcoded string
 *      'Jordan Chen' (a fixture identity), and told the user "Manifestation
 *      recorded per 21 CFR §11.50".
 *
 * The second is the more serious of the two. A §11.50 manifestation must record
 * the signer's printed name, the date and time of execution, and the meaning of
 * the signing, bound to the signed record — none of which can come from the
 * browser's say-so. And a control that asks for a password and discards it
 * teaches users to type credentials into things that do nothing.
 *
 * These tests assert on source because the defect IS the source: what the record
 * says, and what the UI tells the user it did. Each assertion is written so that
 * reinstating the specific fabricated string fails it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRaw = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

/**
 * Source with comments removed.
 *
 * These assertions are about what the CODE does, and both fixes deliberately
 * leave comments quoting the exact strings they removed — that is the record of
 * why the code looks the way it does. Matching raw source would flag those
 * comments and force the explanation out of the file, which is the opposite of
 * what anyone wants. So: strip comments, then assert.
 *
 * Deliberately naive (no string/regex-literal awareness) because it only has to
 * handle these two files, and being over-eager here can only remove text — it
 * cannot invent a passing match.
 */
const read = (p: string) =>
  readRaw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const AGENT = 'server/services/ectd-submission-agent.ts';
const REVIEW = 'client/src/concept2cure/v2/surfaces/Review.tsx';

describe('eCTD submission agent does not claim to have transmitted', () => {
  const src = read(AGENT);
  const submitFn = src.slice(
    src.indexOf('async submitToGateway'),
    src.indexOf('/** Get a single submission with org isolation */'),
  );

  it('locates submitToGateway (guards against the anchor moving)', () => {
    expect(submitFn.length).toBeGreaterThan(200);
    expect(submitFn).toContain('ectd_submissions');
  });

  it('never sets status to submitted', () => {
    expect(submitFn).not.toMatch(/status\s*=\s*'submitted'/);
    expect(submitFn).not.toMatch(/status:\s*'submitted'/);
  });

  it('does not write a history reason claiming it reached the gateway', () => {
    expect(submitFn).not.toContain("'Submitted to agency gateway'");
  });

  it('states plainly that nothing was transmitted', () => {
    expect(submitFn).toMatch(/NOT been transmitted|NOT transmitted/);
    expect(submitFn).toMatch(/transmitted:\s*false/);
  });

  it('uses a status the CHECK constraint actually permits', () => {
    // db/migrations/082_ectd_submission_agent.sql:71 constrains this column.
    // Writing a value outside the list would 500 on every call — which is how a
    // first attempt at this fix (a new 'ready_for_transmission') would have
    // failed.
    const ddl = readRaw('db/migrations/082_ectd_submission_agent.sql');
    const check = ddl.slice(ddl.indexOf('CHECK (status IN ('), ddl.indexOf('package_path'));
    const written = [...submitFn.matchAll(/status\s*=\s*'([a-z_]+)'/g)].map(m => m[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const s of written) expect(check, `status '${s}' is not in the CHECK`).toContain(`'${s}'`);
  });

  it('still refuses to proceed on validation errors', () => {
    // The honesty fix must not weaken the gate that was already there.
    expect(submitFn).toMatch(/has not been validated yet/i);
    expect(submitFn).toMatch(/validation error/i);
  });
});

describe('the review surface does not fabricate an electronic signature', () => {
  const src = read(REVIEW);

  it('does not attribute a signature to a hardcoded fixture identity', () => {
    const modal = src.slice(src.indexOf('function ESignModal'), src.indexOf('function ApproveSign'));
    expect(modal).not.toContain('Jordan Chen');
  });

  it('does not write the phantom C2C_SIGNED global', () => {
    // It was assigned here and read nowhere in the repository, so every
    // "signature" evaporated on reload.
    expect(src).not.toMatch(/C2C_SIGNED\s*(\[|=)/);
  });

  it('does not collect credentials it discards', () => {
    // A password field whose value is never used is indistinguishable from a
    // harvesting UI, and trains users to enter passwords into dead controls.
    expect(src).not.toMatch(/type="password"/);
    expect(src).not.toMatch(/6-digit TOTP/);
  });

  it('never claims a §11.50 manifestation was recorded', () => {
    expect(src).not.toMatch(/Manifestation recorded per 21 CFR/);
    expect(src).not.toMatch(/E-sign is re-verified and manifested/);
  });

  it('says explicitly that it is not an electronic signature', () => {
    expect(src).toMatch(/not an electronic signature/i);
    expect(src).toMatch(/not a 21 CFR §11\.50 manifestation/i);
  });

  it('points at the path that does perform a binding signature', () => {
    // Removing a false claim without saying where the real capability lives
    // just moves the confusion.
    expect(src).toMatch(/authoring workspace/i);
    expect(src).toMatch(/PIN-verified/i);
  });

  it('no longer labels the action as signing or sealing', () => {
    expect(src).not.toMatch(/Approve &amp; sign|Approved &amp; sealed/);
    expect(src).not.toMatch(/>Electronic signature</);
  });
});
