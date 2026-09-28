/**
 * The MCP connector's membership lookup refuses accounts that are not active.
 *
 * 2026-09-22 periodic review, handed-off #6: `findMembership` joined
 * organization_users to organizations only, so a suspended or deactivated user
 * whose membership row still existed was issued MCP tokens and passed the bearer
 * verifier (`platform-token.ts` and `provider.ts` both rely on this one lookup).
 * Shown failing first: on the previous head the "suspended" and "inactive" cases
 * below returned a membership.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const poolLike = {
  query: async (text: string, params?: unknown[]) => {
    const r = await pglite.query(text, params as unknown[]);
    return { rows: r.rows, rowCount: r.rows.length };
  },
};
vi.mock('../../../db', () => ({ getPool: () => poolLike, get pool() { return poolLike; } }));

import { findMembership } from '../store';

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    -- settings: read by the lookup since fc5f5d31f (P1-38) for the connector
    -- session limit; json and nullable, as the real column is.
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, uuid UUID NOT NULL DEFAULT gen_random_uuid(), status TEXT NOT NULL DEFAULT 'active', settings JSON);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE organization_users (id SERIAL PRIMARY KEY, organization_id INT NOT NULL, user_id INT NOT NULL, role TEXT NOT NULL);
    INSERT INTO organizations (id, status) VALUES (1, 'active'), (2, 'suspended');
    INSERT INTO users (id, email, status) VALUES
      (10, 'active@example.test', 'active'),
      (11, 'suspended@example.test', 'suspended'),
      (12, 'inactive@example.test', 'inactive'),
      (13, 'active-in-suspended-org@example.test', 'active');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (1, 10, 'editor'), (1, 11, 'editor'), (1, 12, 'admin'), (2, 13, 'admin');
  `);
});
afterAll(async () => { await pglite.close(); });

describe('findMembership (MCP pre-auth lookup)', () => {
  it('returns the membership of an active user in an active organisation', async () => {
    const m = await findMembership(10, 1);
    expect(m).toMatchObject({ userId: 10, organizationId: 1, role: 'editor' });
  });

  it('refuses a suspended user even though the membership row exists', async () => {
    expect(await findMembership(11, 1)).toBeNull();
  });

  it('refuses a deactivated (inactive) user', async () => {
    expect(await findMembership(12, 1)).toBeNull();
  });

  it('refuses any member of a suspended organisation', async () => {
    expect(await findMembership(13, 2)).toBeNull();
  });

  it('still refuses a user with no membership in the organisation', async () => {
    expect(await findMembership(10, 2)).toBeNull();
  });
});
