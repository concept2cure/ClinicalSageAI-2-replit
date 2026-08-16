/**
 * §11.50(a)(1) — the printed name of the signer.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Both signing paths in the authoring router captured the signer's name as
 *
 *     ((req.user as { name?: string })?.name) || email
 *
 * and this router's OWN first middleware builds `req.user` from the verified
 * token as `{ id, userId, email, role, roles, organizationId }`. There is no
 * `name` key, and the access token carries no `name` claim to put in one. So
 * the left operand was always `undefined` and the fallback always won:
 * `authoring_signatures.signer_name` was the signer's EMAIL ADDRESS on every
 * row ever written.
 *
 * §11.50(a)(1) requires the printed name of the signer. An email address is an
 * identifier, not a printed name — and because the substitution was silent,
 * nothing downstream could tell a resolved name from a fallback.
 *
 * ── Why these are source assertions ──────────────────────────────────────────
 * The defect is not observable from the endpoint's behaviour: both the broken
 * and the fixed version return 200 and write a row. What distinguishes them is
 * WHERE the name came from, and the broken version's tell — an `|| email`
 * fallback on a permanently-undefined operand — is a property of the code. A
 * behavioural test would have passed against the defect for its whole life,
 * which is precisely how it survived.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW = readFileSync(
  resolve(process.cwd(), 'server/routes/authoring.router.ts'),
  'utf8',
);

/**
 * Comments stripped, because the fix DOCUMENTS the defect it removed — the
 * resolver's docblock quotes `((req.user as { name?: string })?.name) || email`
 * verbatim so the next reader knows what was wrong and why. A scanner that
 * cannot tell an explanation from an occurrence forces you to choose between a
 * working test and a comment worth having.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('§11.50(a)(1) — the signer name is a printed name, not an address', () => {
  it('neither signing path reads a name off req.user', () => {
    // The exact dead expression, in either spelling.
    expect(SRC).not.toMatch(/req\.user\s+as\s+\{\s*name\?/);
    expect(SRC).not.toMatch(/\)\?\.name\)\s*\|\|\s*(email|signerEmail)/);
  });

  it('req.user genuinely carries no name, so the old fallback could never lose', () => {
    // The assignment this router makes from the verified token. If a `name`
    // key is ever added here the comment above stops being true, and this test
    // should be revisited rather than deleted.
    const assignment = /req\.user\s*=\s*\{([\s\S]{0,600}?)\};/.exec(SRC)?.[1];
    expect(assignment, 'req.user assignment not found').toBeTruthy();
    expect(assignment).toContain('email:');
    expect(assignment).not.toMatch(/(^|\s)name\s*:/);
  });

  it('both signing paths resolve the name from the user record', () => {
    const calls = SRC.match(/await resolveSignerName\(/g) ?? [];
    expect(calls.length, 'expected /e-sign and /sign to both resolve').toBe(2);
  });

  it('the resolver reads users.name and returns NULL rather than the email', () => {
    const fn = /const resolveSignerName[\s\S]*?\n};/.exec(SRC)?.[0] ?? '';
    expect(fn).toContain('SELECT name FROM users');
    // Returning the email on a miss is what made the defect invisible: it is
    // indistinguishable downstream from a genuinely resolved name. NULL lets a
    // manifestation say the printed name is not on record.
    expect(fn).not.toMatch(/return\s+email/);
    expect(fn).toMatch(/return null/);
  });
});

describe('§11.50(a)(3) — the meaning is a closed set on BOTH paths', () => {
  it('declares the meanings once', () => {
    expect((SRC.match(/const SIGNATURE_MEANINGS\s*=/g) ?? []).length).toBe(1);
    expect(SRC).toMatch(/SIGNATURE_MEANINGS\s*=\s*\['AUTHOR', 'REVIEWER', 'APPROVER'\]/);
  });

  it('validates the meaning on both paths, not just /e-sign', () => {
    // `/sign` took `meaning` as a free string with a REVIEWER default, so an
    // arbitrary token could be stored as the meaning of a binding attestation
    // and would render verbatim in any manifestation of it.
    const checks = SRC.match(/SIGNATURE_MEANINGS\.includes\(meaning\)/g) ?? [];
    expect(checks.length).toBe(2);
  });
});

describe('§11.70 — the signature-to-record link is readable', () => {
  it('the signatures read returns which frozen snapshot the signature covers', () => {
    const select = /SELECT id, doc_id, signer_email[\s\S]*?FROM authoring_signatures/.exec(SRC)?.[0] ?? '';
    expect(select, 'signatures SELECT not found').toBeTruthy();
    // Stored by the freeze-binding migration and never returned, so a
    // manifestation could show that a document was signed but not WHAT was.
    expect(select).toContain('covered_freeze_version');
    expect(select).toContain('covered_content_hash');
    expect(select).toContain('pin_verified');
  });
});
