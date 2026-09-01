/**
 * The §11.50 printed name is resolved or refused — never invented.
 *
 * WHAT IS LOCKED HERE. Four writers used to manufacture a signer identity when
 * the real one was not to hand: `user-${id}` and `user-${id}@unknown.local` into
 * concept2cure_signatures, `''` into the same NOT NULL email from a second
 * writer, and `user-${id}` / `''` into document_audit_trail. Each is
 * indistinguishable from a real value once written, which is the whole reason
 * 21 CFR 11.50(a)(1) asks for the printed name at all.
 *
 * These tests fix the two properties that make the fix real: the lookup is
 * constrained on organization_users (a name resolved across a tenant boundary
 * is a misattributed signature), and an unresolvable signer THROWS rather than
 * yielding a placeholder.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveSignerIdentity,
  SignerNotAttributableError,
} from '../resolve-signer-identity';

function execReturning(rows: any[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    exec: {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return { rows };
      }),
    },
  };
}

describe('resolveSignerIdentity', () => {
  it('returns the printed name, email and title from the membership record', async () => {
    const { exec } = execReturning([{ name: 'A. Rivera', email: 'a.rivera@acme.test', title: 'QA Director' }]);
    await expect(resolveSignerIdentity(exec, 41, 7)).resolves.toEqual({
      name: 'A. Rivera',
      email: 'a.rivera@acme.test',
      title: 'QA Director',
    });
  });

  it('constrains the lookup on organization_users, bound to the signing org', async () => {
    const { exec, calls } = execReturning([{ name: 'A. Rivera', email: 'a@b.test', title: null }]);
    await resolveSignerIdentity(exec, 41, 7);
    // A bare primary-key read of `users` would resolve a name for a user id
    // belonging to any tenant. §11.50 asks for the name OF THE SIGNER.
    expect(calls[0].sql).toMatch(/organization_users/);
    expect(calls[0].sql).toMatch(/organization_id = \$2/);
    expect(calls[0].params).toEqual([41, 7]);
  });

  it('REGRESSION: refuses rather than synthesising when the signer is not a member', async () => {
    const { exec } = execReturning([]);
    await expect(resolveSignerIdentity(exec, 41, 7, 'rewrite_apply')).rejects.toBeInstanceOf(
      SignerNotAttributableError,
    );
  });

  it('REGRESSION: refuses a row with no email rather than writing an empty string', async () => {
    // verifiedSealService passed `input.signerEmail ?? ''` into a NOT NULL
    // column. An empty string is not an email and not a refusal — it is a
    // signature attributed to nobody that looks attributed.
    const { exec } = execReturning([{ name: 'A. Rivera', email: null, title: null }]);
    await expect(resolveSignerIdentity(exec, 41, 7)).rejects.toBeInstanceOf(SignerNotAttributableError);
  });

  it('falls back to the email as the printed name, but never past it', async () => {
    const { exec } = execReturning([{ name: null, email: 'a.rivera@acme.test', title: null }]);
    const signer = await resolveSignerIdentity(exec, 41, 7);
    // An email identifies the person. `user-41` does not.
    expect(signer.name).toBe('a.rivera@acme.test');
    expect(signer.name).not.toMatch(/^user-\d+$/);
  });

  it('refuses a non-finite or non-positive id without querying at all', async () => {
    const { exec } = execReturning([{ name: 'x', email: 'y@z.test', title: null }]);
    await expect(resolveSignerIdentity(exec, Number.NaN, 7)).rejects.toBeInstanceOf(SignerNotAttributableError);
    await expect(resolveSignerIdentity(exec, 41, 0)).rejects.toBeInstanceOf(SignerNotAttributableError);
    expect(exec.query).not.toHaveBeenCalled();
  });

  it('does not disclose whether the user exists in another tenant', async () => {
    const { exec } = execReturning([]);
    const err = await resolveSignerIdentity(exec, 41, 7, 'sign').catch((e) => e);
    // Non-membership and non-existence must read identically.
    expect(err.message).toMatch(/not a member of org 7/);
    expect(err.message).not.toMatch(/does not exist|no such user|unknown user/i);
  });
});

describe('SOURCE: the writers that used to fabricate no longer can', () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../../..', p), 'utf8');

  it.each([
    'server/services/ana/submission-chat-apply-rewrite.ts',
    'server/services/ana/verifiedSealService.ts',
    'server/services/DocumentOrchestrationService.ts',
    'server/routes/esignature.ts',
  ])('%s resolves the signer instead of defaulting one', (file) => {
    const src = read(file)
      // Prose about the defect is not the defect.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l: string) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(src, `${file} still synthesises an identity from a user id`).not.toMatch(
      /`\s*user-\$\{[^}]*\}/,
    );
    expect(src, `${file} no longer calls resolveSignerIdentity`).toMatch(/resolveSignerIdentity\(/);
  });
});
