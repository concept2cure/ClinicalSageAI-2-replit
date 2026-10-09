/**
 * resolveProgramProjectAnchor — strict mode, for an authorization decision (PF-17).
 *
 * The default reports an anchor it could not read as null ("unanchored"), which
 * is honest for a degraded reader. For a route deciding access, "could not
 * tell" must not read as "not yours", so strict rethrows. An absent anchor
 * column is a schema fact, not a failure: null in both modes.
 */
import { describe, expect, it } from 'vitest';
import { resolveProgramProjectAnchor } from '../program-project-anchor';
import type { RequestDb } from '../../../db/requestDb';

const PROGRAM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function dbFailingWith(err: unknown): RequestDb {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.reject(err),
  });
  return chain as unknown as RequestDb;
}

const ask = (err: unknown, strict?: boolean) =>
  resolveProgramProjectAnchor(dbFailingWith(err), { programId: PROGRAM, orgId: 7, context: 'test', strict });

describe('resolveProgramProjectAnchor — strict', () => {
  it('a lookup that could not complete throws in strict mode', async () => {
    await expect(ask(new Error('connection reset'), true)).rejects.toThrow('connection reset');
  });

  it('without strict, the same failure is still null (degraded readers are unchanged)', async () => {
    expect(await ask(new Error('connection reset'))).toBeNull();
  });

  it('an absent anchor column is null in both modes — a schema fact, not a failure', async () => {
    const missing = Object.assign(new Error('column "regulatory_program_id" does not exist'), { code: '42703' });
    expect(await ask(missing, true)).toBeNull();
    expect(await ask(missing)).toBeNull();
  });
});
