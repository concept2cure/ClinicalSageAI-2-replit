/** Actual transaction SQL and the canonical role policy; no global role grant. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
vi.mock('../../../db', () => ({ db: {} }));
import { checkSigningAuthority } from '../signing-authority-gate';
import { resolveSignerOrgRole, type SignerRoleExec } from '../resolve-signer-role';
let pglite: PGlite;
const executor: SignerRoleExec = {
  query: async (sql, params) => ({ rows: (await pglite.query(sql, params)).rows as Record<string, unknown>[] }),
};
beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations(id INT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE users(id INT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE organization_users(organization_id INT NOT NULL,user_id INT NOT NULL,role TEXT NOT NULL,UNIQUE(organization_id,user_id));
    INSERT INTO organizations VALUES(42,'active'),(99,'active');
    INSERT INTO users VALUES(7,'active');
    INSERT INTO organization_users VALUES(42,7,'admin');
  `);
});
beforeEach(async () => {
  await pglite.exec("UPDATE organizations SET status='active'; UPDATE users SET status='active'; DELETE FROM organization_users; INSERT INTO organization_users VALUES(42,7,'admin');");
});
afterAll(async () => { await pglite.close(); });
describe('current signing authority from the actual transaction executor', () => {
  it('admits an active allowed membership using the canonical policy', async () => {
    expect(await resolveSignerOrgRole(7,42,executor)).toBe('admin');
    expect(await checkSigningAuthority(7,42,executor)).toBeNull();
  });
  it('refuses a now-demoted membership despite an earlier allowed read', async () => {
    expect(await checkSigningAuthority(7,42,executor)).toBeNull();
    await pglite.exec("UPDATE organization_users SET role='member' WHERE organization_id=42 AND user_id=7");
    expect(await checkSigningAuthority(7,42,executor)).toMatchObject({ status:403,code:'ESIGNATURE_NO_AUTHORITY' });
  });
  it('does not borrow a membership from a different organization', async () => {
    expect(await checkSigningAuthority(7,99,executor)).toMatchObject({ status:403,code:'ESIGNATURE_NO_AUTHORITY' });
  });
  it.each(['users','organizations'])('refuses inactive %s on this executor', async table => {
    if (table==='users') await pglite.exec("UPDATE users SET status='suspended' WHERE id=7");
    else await pglite.exec("UPDATE organizations SET status='suspended' WHERE id=42");
    expect(await checkSigningAuthority(7,42,executor)).toMatchObject({ status:403,code:'ESIGNATURE_NO_AUTHORITY' });
  });
  it('refuses a removed membership', async () => {
    await pglite.exec('DELETE FROM organization_users WHERE organization_id=42 AND user_id=7');
    expect(await checkSigningAuthority(7,42,executor)).toMatchObject({ status:403,code:'ESIGNATURE_NO_AUTHORITY' });
  });
  it('returns typed unavailable instead of authorizing when actual transaction SQL fails', async () => {
    await pglite.exec('ALTER TABLE organization_users RENAME TO unavailable_memberships');
    try {
      expect(await checkSigningAuthority(7,42,executor)).toMatchObject({ status:503,code:'SIGNING_AUTHORITY_UNVERIFIED' });
    } finally { await pglite.exec('ALTER TABLE unavailable_memberships RENAME TO organization_users'); }
  });
});
