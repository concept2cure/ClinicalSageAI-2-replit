/**
 * Unit coverage for the non-superuser runtime-role provisioner
 * (scripts/db/provision-app-role.mjs).
 *
 * These pin the security contract that makes the RLS unlock real:
 *   - the role is minted NOSUPERUSER / NOBYPASSRLS (a superuser or BYPASSRLS
 *     role bypasses RLS, so getting this wrong silently disables tenant
 *     isolation);
 *   - the audit schema is granted APPEND-ONLY (SELECT, INSERT) so a compromised
 *     app process cannot rewrite the 21 CFR Part 11 audit trail;
 *   - provisioning is a strict no-op unless APP_SERVICE_DB_PASSWORD is set, so
 *     existing single-role deployments are untouched;
 *   - the password is never string-concatenated into DDL.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
  SCHEMA_PRIVILEGE_OVERRIDES,
  DEFAULT_TABLE_PRIVILEGES,
} from '../../../scripts/db/provision-app-role.mjs';

/** A pg-shaped fake that records every statement and answers the quote/probe
 *  queries the provisioner issues. `existingSchemas` is the set the pg_namespace
 *  discovery query reports; `roleExists` toggles CREATE vs ALTER. */
function makeFakeDb({
  existingSchemas = ['public', 'audit', 'vault', 'precedent', 'intelligence', 'extensions'],
  roleExists = false,
}: { existingSchemas?: string[]; roleExists?: boolean } = {}) {
  const statements: string[] = [];
  const db = {
    async query(sql: string, args?: unknown[]) {
      statements.push(sql);
      if (sql.includes('quote_ident($1) AS role_ident')) {
        return {
          rows: [
            {
              role_ident: `"${args![0]}"`,
              pwd_lit: `'${String(args![1]).replace(/'/g, "''")}'`,
              db_ident: '"testdb"',
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.startsWith('SELECT quote_ident($1) AS s')) {
        return { rows: [{ s: `"${args![0]}"` }], rowCount: 1 };
      }
      if (sql.includes('current_user AS role')) {
        return { rows: [{ role: 'postgres' }], rowCount: 1 };
      }
      if (sql.includes('quote_ident(current_database()) AS db_ident')) {
        return { rows: [{ db_ident: '"testdb"' }], rowCount: 1 };
      }
      if (sql.includes('FROM pg_roles WHERE rolname')) {
        return roleExists ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      // Schema discovery: return the configured schema set as pg_namespace rows.
      if (sql.includes('FROM pg_namespace')) {
        return {
          rows: existingSchemas.map(nspname => ({ nspname })),
          rowCount: existingSchemas.length,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { db, statements };
}

const priorPassword = process.env.APP_SERVICE_DB_PASSWORD;
const priorRole = process.env.APP_SERVICE_DB_ROLE;
afterEach(() => {
  if (priorPassword === undefined) delete process.env.APP_SERVICE_DB_PASSWORD;
  else process.env.APP_SERVICE_DB_PASSWORD = priorPassword;
  if (priorRole === undefined) delete process.env.APP_SERVICE_DB_ROLE;
  else process.env.APP_SERVICE_DB_ROLE = priorRole;
});

describe('resolveAppServiceRole', () => {
  it('defaults to app_service', () => {
    expect(resolveAppServiceRole({})).toBe('app_service');
  });

  it('honors a valid APP_SERVICE_DB_ROLE override', () => {
    expect(resolveAppServiceRole({ APP_SERVICE_DB_ROLE: 'c2c_runtime' })).toBe('c2c_runtime');
  });

  it('rejects an identifier that could carry quoting metacharacters', () => {
    for (const bad of ['app service', 'app";DROP', 'App_Service', '1role', 'role-x']) {
      expect(() => resolveAppServiceRole({ APP_SERVICE_DB_ROLE: bad })).toThrow(
        /not a valid PostgreSQL identifier/,
      );
    }
  });
});

describe('privilege model', () => {
  it('defaults to full DML for application schemas', () => {
    expect(DEFAULT_TABLE_PRIVILEGES).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });

  it('overrides audit to APPEND-ONLY (no UPDATE/DELETE) for Part 11 tamper-evidence', () => {
    expect(SCHEMA_PRIVILEGE_OVERRIDES.audit).toEqual(['SELECT', 'INSERT']);
    expect(SCHEMA_PRIVILEGE_OVERRIDES.audit).not.toContain('UPDATE');
    expect(SCHEMA_PRIVILEGE_OVERRIDES.audit).not.toContain('DELETE');
  });

  it('overrides extensions to READ-ONLY (SELECT)', () => {
    expect(SCHEMA_PRIVILEGE_OVERRIDES.extensions).toEqual(['SELECT']);
  });
});

describe('provisionAppServiceRole', () => {
  it('is a no-op when APP_SERVICE_DB_PASSWORD is unset (single-role compat)', async () => {
    const { db, statements } = makeFakeDb();
    const result = await provisionAppServiceRole(db as never, { env: {} });
    expect(result).toEqual({ skipped: true, role: 'app_service' });
    expect(statements).toEqual([]); // nothing was executed
  });

  it('rejects a too-short password rather than minting a weak role', async () => {
    const { db } = makeFakeDb();
    await expect(
      provisionAppServiceRole(db as never, { env: { APP_SERVICE_DB_PASSWORD: 'short' } }),
    ).rejects.toThrow(/at least 12 characters/);
  });

  it('CREATEs the role NOSUPERUSER + NOBYPASSRLS and grants least privilege', async () => {
    const { db, statements } = makeFakeDb({ roleExists: false });
    // A password carrying a single quote + a SQL breakout attempt: proves the
    // value is escaped by Postgres (quote_literal), not raw-concatenated.
    const result = await provisionAppServiceRole(db as never, {
      env: { APP_SERVICE_DB_PASSWORD: "secret'; DROP ROLE postgres; --" },
    });
    expect(result.skipped).toBe(false);

    const create = statements.find((s) => s.includes('CREATE ROLE'));
    expect(create).toBeTruthy();
    expect(create).toContain('NOSUPERUSER');
    expect(create).toContain('NOBYPASSRLS');
    expect(create).toContain('NOCREATEDB');
    expect(create).toContain('NOCREATEROLE');
    expect(create).toContain('LOGIN');
    // The password reaches DDL only as a Postgres-quoted literal: the embedded
    // quote is DOUBLED (escaped), so the breakout sequence never appears raw.
    expect(create).toContain("secret''; DROP ROLE postgres; --"); // escaped form
    expect(create).not.toContain("secret'; DROP"); // un-escaped breakout absent

    // Wrapped in a transaction.
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');

    // CONNECT on the current database.
    expect(statements.some((s) => /GRANT CONNECT ON DATABASE "testdb"/.test(s))).toBe(true);

    // public and a NON-override application schema (intelligence — the exact
    // schema the review found unreachable) both get full DML.
    expect(
      statements.some((s) =>
        /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public"/.test(s),
      ),
    ).toBe(true);
    expect(
      statements.some((s) =>
        /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "intelligence"/.test(s),
      ),
    ).toBe(true);
    // audit is append-only; extensions is read-only.
    expect(
      statements.some((s) => /GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA "audit"/.test(s)),
    ).toBe(true);
    expect(
      statements.some((s) => /UPDATE, DELETE ON ALL TABLES IN SCHEMA "audit"/.test(s)),
    ).toBe(false);
    expect(
      statements.some((s) => /GRANT SELECT ON ALL TABLES IN SCHEMA "extensions"/.test(s)),
    ).toBe(true);
    expect(
      statements.some((s) => /INSERT.*ON ALL TABLES IN SCHEMA "extensions"/.test(s)),
    ).toBe(false);

    // Forward coverage for future owner-created tables.
    expect(statements.some((s) => s.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA "public"'))).toBe(
      true,
    );
  });

  it('ALTERs (not re-CREATEs) an existing role, rotating the password in place', async () => {
    const { db, statements } = makeFakeDb({ roleExists: true });
    await provisionAppServiceRole(db as never, {
      env: { APP_SERVICE_DB_PASSWORD: 'a-sufficiently-long-secret' },
    });
    expect(statements.some((s) => s.includes('ALTER ROLE'))).toBe(true);
    expect(statements.some((s) => s.includes('CREATE ROLE'))).toBe(false);
  });

  it('grants EVERY discovered application schema (no hardcoded allowlist gap)', async () => {
    const { db, statements } = makeFakeDb({
      existingSchemas: ['public', 'audit', 'intelligence', 'core', 'cortex', 'lumen'],
      roleExists: false,
    });
    const result = await provisionAppServiceRole(db as never, {
      env: { APP_SERVICE_DB_PASSWORD: 'a-sufficiently-long-secret' },
    });
    // Each discovered schema is granted USAGE — none silently skipped.
    for (const s of ['public', 'audit', 'intelligence', 'core', 'cortex', 'lumen']) {
      expect(
        statements.some((q) => new RegExp(`GRANT USAGE ON SCHEMA "${s}"`).test(q)),
        `USAGE on ${s} should be granted`,
      ).toBe(true);
    }
    // The non-override schemas all resolve to full DML.
    expect(result.schemas).toContain('intelligence(SELECT, INSERT, UPDATE, DELETE)');
    expect(result.schemas).toContain('core(SELECT, INSERT, UPDATE, DELETE)');
    expect(result.schemas).toContain('audit(SELECT, INSERT)');
  });
});

/**
 * 2026-09-21 — IQ-DEV-001. The password-only gate above is exactly what left
 * an existing, unminted runtime role with 183 unreadable public tables. These
 * pin the other half of the contract: a runtime role that is identifiable and
 * distinct from the owner is granted WITHOUT a password, through the same
 * recipe, and the audit that verifies it fails on a denied relation and on a
 * widened audit store.
 */
import {
  resolveRuntimeRole,
  roleFromUrl,
  refreshRuntimeRoleGrants,
  ensureRuntimeRole,
  auditRuntimeRoleGrants,
  APPEND_ONLY_TABLES,
} from '../../../scripts/db/provision-app-role.mjs';

describe('roleFromUrl', () => {
  it('reads the login role out of a connection string, with or without the psql wrapper', () => {
    expect(roleFromUrl('postgresql://c2c:c2c_local@127.0.0.1:5432/clinicalsage')).toBe('c2c');
    expect(roleFromUrl("psql 'postgresql://app_service:pw@host/db'")).toBe('app_service');
    expect(roleFromUrl('postgresql://app%5Fservice:pw@host/db')).toBe('app_service');
  });
  it('falls back to a scheme scan when the WHATWG parser rejects the password', () => {
    expect(roleFromUrl('postgresql://c2c:p^ss word@host/db')).toBe('c2c');
  });
  it('returns null when the string names no role', () => {
    expect(roleFromUrl('postgresql://host/db')).toBeNull();
    expect(roleFromUrl(undefined)).toBeNull();
  });
});

describe('resolveRuntimeRole', () => {
  it('returns null for the single-role posture (runtime is the owner)', () => {
    expect(resolveRuntimeRole({ DATABASE_URL: 'postgresql://postgres:pw@h/db' }, { ownerRole: 'postgres' })).toBeNull();
    expect(resolveRuntimeRole({}, { ownerRole: 'postgres' })).toBeNull();
    expect(resolveRuntimeRole({ APP_DATABASE_URL: 'postgresql://postgres:pw@h/db' }, { ownerRole: 'postgres' })).toBeNull();
    expect(resolveRuntimeRole({ RUNTIME_DB_ROLE: 'postgres' }, { ownerRole: 'postgres' })).toBeNull();
  });

  it('identifies the DATABASE_URL login when DATABASE_OWNER_URL made another role the owner (the IQ-DEV-001 shape)', () => {
    expect(
      resolveRuntimeRole(
        { DATABASE_OWNER_URL: 'postgresql://postgres:pw@h/db', DATABASE_URL: 'postgresql://c2c:pw@h/db' },
        { ownerRole: 'postgres' },
      ),
    ).toEqual({ role: 'c2c', source: 'DATABASE_URL' });
  });

  it('prefers RUNTIME_DB_ROLE, then the mint switch, then APP_DATABASE_URL', () => {
    expect(
      resolveRuntimeRole({ RUNTIME_DB_ROLE: 'svc', APP_DATABASE_URL: 'postgresql://other:pw@h/db' }, { ownerRole: 'postgres' }),
    ).toEqual({ role: 'svc', source: 'RUNTIME_DB_ROLE' });
    expect(
      resolveRuntimeRole({ APP_SERVICE_DB_PASSWORD: 'x'.repeat(12), APP_DATABASE_URL: 'postgresql://other:pw@h/db' }, { ownerRole: 'postgres' }),
    ).toEqual({ role: 'app_service', source: 'APP_SERVICE_DB_PASSWORD' });
    expect(resolveRuntimeRole({ APP_DATABASE_URL: 'postgresql://app_service:pw@h/db' }, { ownerRole: 'postgres' })).toEqual({
      role: 'app_service',
      source: 'APP_DATABASE_URL',
    });
  });

  it('refuses a RUNTIME_DB_ROLE that conflicts with the role the password would mint', () => {
    expect(() =>
      resolveRuntimeRole({ RUNTIME_DB_ROLE: 'c2c', APP_SERVICE_DB_PASSWORD: 'x'.repeat(12) }, { ownerRole: 'postgres' }),
    ).toThrow(/conflicts with the role APP_SERVICE_DB_PASSWORD would mint/);
  });

  it('rejects a role name that could carry quoting metacharacters', () => {
    expect(() => resolveRuntimeRole({ RUNTIME_DB_ROLE: 'c2c";DROP' }, { ownerRole: 'postgres' })).toThrow(/not a valid PostgreSQL identifier/);
    expect(() => resolveRuntimeRole({ APP_DATABASE_URL: 'postgresql://Bad-Role:pw@h/db' }, { ownerRole: 'postgres' })).toThrow(
      /not a valid PostgreSQL identifier/,
    );
  });
});

describe('refreshRuntimeRoleGrants / ensureRuntimeRole', () => {
  it('grants an EXISTING role the same recipe without a password (no CREATE/ALTER ROLE)', async () => {
    const { db, statements } = makeFakeDb({ roleExists: true });
    const result = await refreshRuntimeRoleGrants(db as never, { role: 'c2c' });
    expect(result.skipped).toBe(false);
    expect(result.role).toBe('c2c');
    expect(statements.some((s) => /CREATE ROLE|ALTER ROLE/.test(s))).toBe(false);
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(statements.some((s) => /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "c2c"/.test(s))).toBe(true);
    expect(statements.some((s) => /GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA "audit" TO "c2c"/.test(s))).toBe(true);
    expect(statements.some((s) => /GRANT.*UPDATE.*ON ALL TABLES IN SCHEMA "audit"/.test(s))).toBe(false);
    expect(statements.some((s) => /ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "c2c"/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER DEFAULT PRIVILEGES IN SCHEMA "audit" GRANT SELECT, INSERT ON TABLES TO "c2c"/.test(s))).toBe(true);
    // Never REVOKEs: the owner's own privileges on relations it happens to own stay.
    expect(statements.some((s) => /REVOKE/.test(s))).toBe(false);
  });

  it('fails closed when the identified role does not exist', async () => {
    const { db, statements } = makeFakeDb({ roleExists: false });
    await expect(refreshRuntimeRoleGrants(db as never, { role: 'ghost' })).rejects.toThrow(/runtime role ghost does not exist/);
    expect(statements.some((s) => /GRANT/.test(s))).toBe(false);
  });

  it('ensureRuntimeRole: refreshes an identified role, mints when the password is set, no-ops single-role', async () => {
    const refreshed = makeFakeDb({ roleExists: true });
    const r1 = await ensureRuntimeRole(refreshed.db as never, {
      env: { DATABASE_OWNER_URL: 'postgresql://postgres:pw@h/db', DATABASE_URL: 'postgresql://c2c:pw@h/db' },
    });
    expect(r1).toMatchObject({ mode: 'refreshed', role: 'c2c', owner: 'postgres', source: 'DATABASE_URL', skipped: false });
    expect(refreshed.statements.some((s) => /GRANT USAGE ON SCHEMA "public" TO "c2c"/.test(s))).toBe(true);

    const minted = makeFakeDb({ roleExists: false });
    const r2 = await ensureRuntimeRole(minted.db as never, { env: { APP_SERVICE_DB_PASSWORD: 'a-sufficiently-long-secret' } });
    expect(r2).toMatchObject({ mode: 'minted', role: 'app_service', skipped: false });
    expect(minted.statements.some((s) => /CREATE ROLE "app_service"/.test(s))).toBe(true);

    const single = makeFakeDb({ roleExists: true });
    const r3 = await ensureRuntimeRole(single.db as never, { env: { DATABASE_URL: 'postgresql://postgres:pw@h/db' } });
    expect(r3).toMatchObject({ mode: 'single-role', role: null, owner: 'postgres', skipped: true });
    expect(single.statements.some((s) => /GRANT/.test(s))).toBe(false);
  });
});

describe('auditRuntimeRoleGrants', () => {
  type Rel = {
    schema: string;
    name: string;
    owned?: boolean;
    schema_usage?: boolean;
    held?: string[];
  };
  function auditDb(rels: Rel[], { roleExists = true } = {}) {
    return {
      async query(sql: string, args?: unknown[]) {
        if (sql.includes('FROM pg_roles WHERE rolname')) {
          return roleExists
            ? { rows: [{ rolname: args![0], rolsuper: false, rolbypassrls: false, rolcanlogin: true }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (sql.includes('has_schema_privilege')) {
          return {
            rows: rels.map((r) => {
              const held = new Set(r.held ?? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
              return {
                schema: r.schema,
                name: r.name,
                relkind: 'r',
                owned: Boolean(r.owned),
                schema_usage: r.schema_usage ?? true,
                can_select: held.has('SELECT'),
                can_insert: held.has('INSERT'),
                can_update: held.has('UPDATE'),
                can_delete: held.has('DELETE'),
              };
            }),
            rowCount: rels.length,
          };
        }
        throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
      },
    };
  }

  it('names the append-only store', () => {
    expect([...APPEND_ONLY_TABLES]).toEqual([{ schema: 'audit', name: 'tamper_proof_log' }]);
  });

  it('passes a recipe-shaped estate', async () => {
    const a = await auditRuntimeRoleGrants(
      auditDb([
        { schema: 'public', name: 'organizations' },
        { schema: 'audit', name: 'tamper_proof_log', held: ['SELECT', 'INSERT'] },
        { schema: 'extensions', name: 'ext_table', held: ['SELECT'] },
      ]) as never,
      'c2c',
    );
    expect(a.exists).toBe(true);
    expect(a.relations).toBe(3);
    expect(a.denied).toEqual([]);
    expect(a.excess).toEqual([]);
    expect(a.ownedAppendOnly).toEqual([]);
  });

  it('reports a revoked privilege and a schema without USAGE as denied (the IQ-DEV-001 shape)', async () => {
    const a = await auditRuntimeRoleGrants(
      auditDb([
        { schema: 'public', name: 'platform_settings', held: [] },
        { schema: 'public', name: 'organizations', held: ['SELECT', 'INSERT', 'DELETE'] },
        { schema: 'intelligence', name: 'document_templates', schema_usage: false },
        { schema: 'audit', name: 'tamper_proof_log', held: ['SELECT'] },
      ]) as never,
      'c2c',
    );
    expect(a.denied).toEqual([
      { relation: 'public.platform_settings', missing: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
      { relation: 'public.organizations', missing: ['UPDATE'] },
      { relation: 'intelligence.document_templates', missing: ['USAGE'] },
      { relation: 'audit.tamper_proof_log', missing: ['INSERT'] },
    ]);
    expect(a.schemasWithoutUsage).toEqual(['intelligence']);
  });

  it('reports UPDATE/DELETE on a non-owned audit relation as EXCESS, and ownership of the store as a failure', async () => {
    const a = await auditRuntimeRoleGrants(
      auditDb([
        { schema: 'audit', name: 'tamper_proof_log', held: ['SELECT', 'INSERT', 'UPDATE'] },
        { schema: 'audit', name: 'event_log', owned: true },
      ]) as never,
      'c2c',
    );
    expect(a.excess).toEqual([{ relation: 'audit.tamper_proof_log', held: ['UPDATE'] }]);
    expect(a.ownedInOverrideSchemas).toBe(1); // owned, not the store: observation only
    expect(a.ownedAppendOnly).toEqual([]);

    const owned = await auditRuntimeRoleGrants(
      auditDb([{ schema: 'audit', name: 'tamper_proof_log', owned: true }]) as never,
      'c2c',
    );
    expect(owned.ownedAppendOnly).toEqual(['audit.tamper_proof_log']);
    expect(owned.excess).toEqual([]);
  });

  it('reports a role that does not exist without touching the catalog further', async () => {
    const a = await auditRuntimeRoleGrants(auditDb([], { roleExists: false }) as never, 'ghost');
    expect(a.exists).toBe(false);
    expect(a.denied).toEqual([]);
  });
});
