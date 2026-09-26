/**
 * §11.50(a)(3): a governed `sign` carries a meaning from the closed vocabulary,
 * or nothing is signed (security audit 2026-09-24, DP-17; plan P1-21).
 *
 * The shared writer, persistGovernedActionSignature, is the one place every
 * governed signature row is composed. It used to record whatever string the
 * payload carried, or null when it carried none, so a signature could state a
 * meaning nobody defined ("approved because I felt like it") or no meaning at
 * all. These cases pin the rule at the writer, ahead of any database work:
 * a sign with no meaning or an unknown meaning throws before the signer lookup
 * runs, and a command that is not `sign` (approve, revoke) is untouched here
 * because its meaning is fixed by its own writer.
 *
 * The client is a double that throws a sentinel on its first query, so a test
 * can tell "refused before any query" from "the meaning rule let it through".
 */
import { describe, it, expect, vi } from 'vitest';
import {
  persistGovernedActionSignature,
  SignatureMeaningError,
  type GovernedActionSignatureParams,
} from '../signature-persistence';
import { GOVERNED_SIGN_MEANINGS, isGovernedSignMeaning } from '../signature-meanings';

class ReachedDatabase extends Error {
  constructor() {
    super('reached the database');
  }
}

function clientThatRefusesQueries() {
  const query = vi.fn(async () => {
    throw new ReachedDatabase();
  });
  return { client: { query } as any, query };
}

function params(overrides: Partial<GovernedActionSignatureParams> = {}): GovernedActionSignatureParams {
  return {
    orgId: 7,
    userId: 41,
    target: 'program:prog_4',
    reason: 'Checkpoint the program plan after review.',
    payload: { intent: 'checkpoint' },
    actionId: 'act_1',
    auditId: 'aud_1',
    sha256Chain: 'a'.repeat(64),
    authenticationMethod: 'password',
    secondFactorVerified: false,
    occurredAt: new Date('2026-09-25T12:00:00Z'),
    binding: { digest: null, basis: 'audit-chain', note: 'test' },
    ...overrides,
  };
}

describe('the governed sign vocabulary', () => {
  it('is the union of the two spellings the product uses, and nothing else', () => {
    expect([...GOVERNED_SIGN_MEANINGS].sort()).toEqual(
      ['APPROVED', 'AUTHORSHIP', 'RESPONSIBILITY', 'REVIEWED', 'approval', 'authorship', 'release', 'responsibility', 'review'].sort(),
    );
    expect(isGovernedSignMeaning('approval')).toBe(true);
    expect(isGovernedSignMeaning('APPROVED')).toBe(true);
    expect(isGovernedSignMeaning('Approval')).toBe(false);
    expect(isGovernedSignMeaning('')).toBe(false);
    expect(isGovernedSignMeaning(null)).toBe(false);
    expect(isGovernedSignMeaning(undefined)).toBe(false);
    expect(isGovernedSignMeaning(7)).toBe(false);
  });
});

describe('persistGovernedActionSignature: command sign', () => {
  it('refuses a sign that declares no meaning before any query runs', async () => {
    const { client, query } = clientThatRefusesQueries();
    const attempt = persistGovernedActionSignature(client, params());
    await expect(attempt).rejects.toBeInstanceOf(SignatureMeaningError);
    await expect(attempt).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an empty-string meaning the same way', async () => {
    const { client, query } = clientThatRefusesQueries();
    await expect(
      persistGovernedActionSignature(client, params({ payload: { meaning: '' } })),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a meaning outside the vocabulary before any query runs', async () => {
    const { client, query } = clientThatRefusesQueries();
    const attempt = persistGovernedActionSignature(
      client,
      params({ payload: { meaning: 'approved because I felt like it' } }),
    );
    await expect(attempt).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_UNKNOWN' });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a meaning that is not a string (an object, a number) rather than coercing it', async () => {
    const { client, query } = clientThatRefusesQueries();
    await expect(
      persistGovernedActionSignature(client, params({ payload: { meaning: { id: 'approval' } } })),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    await expect(
      persistGovernedActionSignature(client, params({ payload: { meaning: 1 } })),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['approval', 'release', 'APPROVED', 'AUTHORSHIP'])(
    'lets the vocabulary meaning %s through to the signer lookup',
    async (meaning) => {
      const { client, query } = clientThatRefusesQueries();
      await expect(
        persistGovernedActionSignature(client, params({ payload: { meaning } })),
      ).rejects.toBeInstanceOf(ReachedDatabase);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('the refusal names the vocabulary so the caller can say what is accepted', async () => {
    const { client } = clientThatRefusesQueries();
    const err = await persistGovernedActionSignature(client, params({ payload: { meaning: 'x' } })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SignatureMeaningError);
    expect((err as Error).message).toContain('approval');
    expect((err as Error).message).toContain('APPROVED');
  });
});

describe('persistGovernedActionSignature: other commands are not gated by the sign vocabulary', () => {
  it.each(['approve', 'revoke-signature', 'transmit'])(
    'command %s with no payload meaning reaches the signer lookup unchanged',
    async (command) => {
      const { client, query } = clientThatRefusesQueries();
      await expect(
        persistGovernedActionSignature(client, params({ command })),
      ).rejects.toBeInstanceOf(ReachedDatabase);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
});
