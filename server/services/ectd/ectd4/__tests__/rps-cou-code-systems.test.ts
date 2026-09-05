/**
 * A context of use is governed by ONE OF TWO code systems, and the validator
 * must check each against its own rules.
 *
 * In eCTD v4.0, Module 1 is regional — an FDA submission draws its context-of-use
 * codes from the FDA CL2 list — while Modules 2–5 are ICH-governed and carry the
 * ICH CoU code system with an `ich_<section>` code. `sectionToCou` in
 * forward-compat.ts emits exactly that split, deliberately.
 *
 * The validator checked EVERY context against the FDA list and the FDA OID
 * alone, so every Module 2–5 context — most of a real dossier — was reported as
 * both an invalid code and an invalid code system. A validator that fails every
 * valid submission is not strict, it is broken, and the two findings it raised
 * named the wrong cause.
 *
 * These tests pin the split, and pin that it did not become a way through: an
 * unrecognised code system is still refused, an FDA-governed code must still be
 * catalogued, and an ICH-governed code must still match the governed shape
 * rather than being waved past on its code system alone.
 */
import { describe, it, expect } from 'vitest';
import { forwardCompatToV4, ICH_COU_OID } from '../forward-compat';
import { validateRpsMessage } from '../rps-validator';
import type { EctdLeaf } from '../../../submission-gateways/regional-packager';

const appNo = '123456';
const seq = '0001';

const leaf = (o: Partial<EctdLeaf>): EctdLeaf =>
  ({ ctdSection: '1.2', fileName: 'f.pdf', title: 'T', operation: 'new', ...o }) as EctdLeaf;

/** The message the converter really produces, for a Module 1 + Module 3 pair. */
function realMessage() {
  const { message } = forwardCompatToV4({
    application: { number: appNo, typeCode: 'us_application_type_1', center: 'cder' },
    submission: { typeCode: 'us_submission_type_1' },
    submissionUnit: {
      id: undefined as any,
      unitTypeCode: 'us_submission_unit_type_1',
      title: 'Original',
      sequenceNumber: seq,
      status: 'active',
    } as any,
    leaves: [
      leaf({ ctdSection: '1.2', fileName: 'cover.pdf' }),
      leaf({ ctdSection: '3.2.p.1', fileName: 'desc.pdf' }),
    ],
  } as any);
  return message;
}

const codes = (m: any) => validateRpsMessage(m, seq).findings.map((f: any) => f.code);

describe('RPS context-of-use code systems', () => {
  it('accepts the ICH-governed Module 2–5 contexts the converter emits', () => {
    const m = realMessage();
    // The converter's own split: Module 1 → FDA CL2, Module 3 → ICH.
    expect(m.contextsOfUse[0].code).toBe('us_1.2');
    expect(m.contextsOfUse[1].code.startsWith('ich_')).toBe(true);
    expect(m.contextsOfUse[1].codeSystem).toBe(ICH_COU_OID);
    // Neither the code nor the code system may be reported as invalid.
    expect(codes(m)).not.toContain('RPS-COU-CODE-VALID');
    expect(codes(m)).not.toContain('RPS-COU-CODESYSTEM-OID');
  });

  it('still refuses a malformed code under the ICH code system', () => {
    const m = realMessage();
    m.contextsOfUse[1].code = 'not-an-ich-code';
    expect(codes(m)).toContain('RPS-COU-CODE-VALID');
  });

  it('still refuses an unrecognised code system outright', () => {
    const m = realMessage();
    m.contextsOfUse[1].codeSystem = '1.2.3.4.5';
    expect(codes(m)).toContain('RPS-COU-CODESYSTEM-OID');
  });

  it('still refuses a non-catalogued code under the FDA code system', () => {
    const m = realMessage();
    // Module 1 stays FDA-governed, so its code must be in CL2.
    m.contextsOfUse[0].code = 'us_9.9';
    expect(codes(m)).toContain('RPS-COU-CODE-VALID');
  });
});
