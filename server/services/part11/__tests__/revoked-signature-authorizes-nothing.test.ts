/**
 * A revoked Part 11 signature authorizes nothing.
 *
 * `persistGovernedSignatureRevocation` takes a signature out of force by setting
 * `superseded_by`, `is_valid = false` and `verification_status = 'revoked'`. It
 * deliberately leaves the signed content — `bound_payload_digest`,
 * `binding_basis`, `signature_manifest` — byte identical, because 21 CFR 11.70
 * requires the superseded signature be retained unaltered. It also writes a NEW
 * c2c_ana_actions row rather than mutating the original `sign` row.
 *
 * `governedSignatureRefusal` (submission-service.ts) is Gate 1 — the only Part 11
 * check between an authenticated caller and a governed freeze or transmit. It
 * selected only `bound_payload_digest, binding_basis`, so NONE of its four checks
 * could observe a withdrawal: the sign action was still 'executed' by the same
 * actor, the declared intent still matched, the spent-check filters different
 * actions, and the leaf-manifest digest still agreed because revocation does not
 * alter content. Revoking a signature therefore had no effect on the freeze and
 * transmit it was issued to authorize. (Dispatch was covered — its Gate 2
 * release-signature check already applies this predicate.)
 *
 * These tests pin the canonical predicate and the fact that Gate 1 both selects
 * the withdrawal columns and applies it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { isSignatureWithdrawn, REVOKED_VERIFICATION_STATUS } from '../signature-persistence';

describe('isSignatureWithdrawn — any one of the three columns takes a signature out of force', () => {
  const live = { verification_status: 'verified', superseded_by: null, is_valid: true };

  it('a live signature is not withdrawn', () => {
    expect(isSignatureWithdrawn(live)).toBe(false);
  });

  it('verification_status = revoked withdraws it', () => {
    expect(isSignatureWithdrawn({ ...live, verification_status: REVOKED_VERIFICATION_STATUS })).toBe(true);
  });

  it('a superseded_by pointer withdraws it (the §11.70 append-only marker)', () => {
    expect(isSignatureWithdrawn({ ...live, superseded_by: 901 })).toBe(true);
  });

  it('is_valid = false withdraws it (the older flag)', () => {
    expect(isSignatureWithdrawn({ ...live, is_valid: false })).toBe(true);
  });

  it('exactly the columns persistGovernedSignatureRevocation writes', () => {
    // The revocation UPDATE sets these three together; each alone must suffice,
    // so a partially-migrated row is never read as still in force.
    expect(
      isSignatureWithdrawn({ verification_status: REVOKED_VERIFICATION_STATUS, superseded_by: 901, is_valid: false }),
    ).toBe(true);
  });

  it('does not treat missing fields as withdrawn (absence is not revocation)', () => {
    expect(isSignatureWithdrawn({})).toBe(false);
  });
});

/**
 * Source contract. Gate 1 is only reachable behind a database, so this pins the
 * two properties that made the defect possible: the query must SELECT the
 * withdrawal columns, and the function must APPLY the predicate to them.
 */
describe('governedSignatureRefusal — Gate 1 observes withdrawal', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'submission-service', 'submission-service.ts'),
    'utf8',
  );
  // Executable source only: the comments deliberately quote the old query.
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('selects the three withdrawal columns from electronic_signatures', () => {
    const select = CODE.slice(CODE.indexOf('FROM electronic_signatures') - 400, CODE.indexOf('FROM electronic_signatures'));
    for (const col of ['superseded_by', 'is_valid', 'verification_status']) {
      expect(select, `Gate 1 must select ${col}`).toContain(col);
    }
  });

  it('applies the canonical predicate rather than restating it', () => {
    expect(CODE).toContain('isSignatureWithdrawn(sig)');
    // The rule must not be re-implemented here — one canonical definition.
    expect(CODE).not.toMatch(/verification_status\s*===\s*['"]revoked['"]/);
  });

  it('refuses with a message naming revocation', () => {
    expect(CODE).toMatch(/has been revoked; obtain a new signature/);
  });
});

describe('the withdrawal rule has exactly one definition', () => {
  it('sequence-release-signature delegates instead of keeping a second copy', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'ectd', 'sequence-release-signature.ts'),
      'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('isSignatureWithdrawn(row)');
    expect(code).not.toMatch(/superseded_by\s*!=\s*null/);
  });
});
