/**
 * Contract: there is ONE electronic-signature write path, and the
 * non-conforming second one stays deleted.
 *
 * WHAT WAS THERE. `auth-security-service.createElectronicSignature`, reachable
 * at POST /api/auth/enterprise/electronic-signature, inserted into
 * `electronic_signatures` with no `bound_payload_digest`, no `binding_basis`
 * and no `organization_id`. By the binding evaluator's own rules every row it
 * wrote was permanently unverifiable — the §11.70 question "is this still the
 * content that was approved?" had no answer for any of them, forever. It also
 * took `documentId` and `versionId` from the request body without checking
 * either belonged to the caller's organization, so a signature could be
 * attached to another tenant's document version.
 *
 * WHY DELETED, NOT REPAIRED. The same call as POST /api/part11/signatures
 * before it (see routes/__tests__/part11-signature-post-removed.test.ts):
 * repairing it would have produced a SECOND live document-signing surface
 * beside /api/esignature/sign. One signing entry point per substrate, one
 * INSERT (services/part11/signature-persistence.ts). Nothing in client/ or
 * server/ called it, and the re-authentication it performed (password + MFA)
 * is not lost — the canonical route does the same.
 *
 * These tests hold that line at the source level, because the failure mode is
 * reintroduction: a future change that "restores" a convenient signing helper
 * would silently start minting unverifiable Part 11 records again, and nothing
 * would fail — signing would appear to work.
 *
 * @compliance 21 CFR Part 11 §11.70, §11.100, §11.200
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const AUTH_SECURITY = 'server/services/auth-security-service.ts';
const AUTH_ENTERPRISE = 'server/routes/authEnterprise.ts';
const CANONICAL_PERSISTENCE = 'server/services/part11/signature-persistence.ts';
const PART11_SERVICE = 'server/services/part11ComplianceService.ts';

/**
 * Comments stripped before scanning. The migration notes in these files NAME
 * the deleted calls, and a guard that cannot tell a description of a write from
 * a write would be satisfied by deleting the explanation.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('single electronic-signature write path', () => {
  it('auth-security-service no longer defines a signature writer', () => {
    const src = read(AUTH_SECURITY);
    expect(
      /export\s+async\s+function\s+createElectronicSignature/.test(src),
      'createElectronicSignature is back in auth-security-service — a second, ' +
        'non-conforming signature write path has returned.',
    ).toBe(false);
  });

  it('auth-security-service never inserts into electronic_signatures', () => {
    const src = read(AUTH_SECURITY);
    // Both spellings: the drizzle builder and raw SQL.
    expect(/\.insert\(\s*electronicSignatures\s*\)/.test(src)).toBe(false);
    expect(/INSERT\s+INTO\s+electronic_signatures/i.test(src)).toBe(false);
  });

  it('the enterprise signing route answers 410 and names the canonical one', () => {
    const src = read(AUTH_ENTERPRISE);
    expect(src).toContain("router.post('/electronic-signature'");
    expect(src).toContain('410');
    expect(src).toContain('ESIGNATURE_ENDPOINT_REMOVED');
    // A caller must be told where to go, not just that the door closed.
    expect(src).toContain('/api/esignature/sign');
  });

  it('the enterprise router imports no signature writer', () => {
    const src = read(AUTH_ENTERPRISE);
    expect(src).not.toContain('createElectronicSignature');
    expect(/\.insert\(\s*electronicSignatures\s*\)/.test(src)).toBe(false);
    expect(/INSERT\s+INTO\s+electronic_signatures/i.test(src)).toBe(false);
  });

  it('part11ComplianceService no longer holds the second INSERT (ledger L37)', () => {
    // The release-signing writer behind POST /api/submissions/:id/sign-release
    // had its own `.insert(electronicSignatures)`. It was conforming — it bound
    // content and set the org — and that is why it survived two audits. It
    // still wrote 20 of the table's 26 columns and could not express
    // `binding_basis` at all, so its rows could not say what their
    // `bound_payload_digest` was a digest OF. One substrate, one INSERT.
    const src = code(read(PART11_SERVICE));
    expect(
      /\.insert\(\s*electronicSignatures\s*\)/.test(src),
      'a second Drizzle INSERT into electronic_signatures is back in ' +
        'part11ComplianceService — the release path has left the shared writer.',
    ).toBe(false);
    expect(/INSERT\s+INTO\s+electronic_signatures/i.test(src)).toBe(false);
    // Deleting the writer must not delete the write: it goes through the one.
    expect(src).toContain('persistElectronicSignature');
  });

  it('the canonical INSERT still exists, and records the binding fields', () => {
    // The point of the deletion is that ONE writer survives — not none.
    const src = read(CANONICAL_PERSISTENCE);
    expect(/INSERT\s+INTO\s+electronic_signatures/i.test(src)).toBe(true);
    expect(src).toContain('bound_payload_digest');
    expect(src).toContain('binding_basis');
  });

  it('the verification endpoint survives — deleting the writer must not blind the reader', () => {
    const src = read(AUTH_ENTERPRISE);
    expect(src).toContain("'/electronic-signature/:id/verify'");
  });
});
