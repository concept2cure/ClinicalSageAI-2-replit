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
  SCHEMA_TABLE_PRIVILEGES,
} from '../../../scripts/db/provision-app-role.mjs';

/** A pg-shaped fake that records every statement and answers the quote/probe
 *  queries the provisioner issues. `existingSchemas` controls which schemas the
 *  information_schema probe reports present; `roleExists` toggles CREATE vs ALTER. */
function makeFakeDb({
  existingSchemas = ['public', 'audit', 'vault', 'precedent'],
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
      if (sql.includes('FROM pg_roles WHERE rolname')) {
        return roleExists ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes('information_schema.schemata')) {
        const present = existingSchemas.includes(String(args![0]));
        return present ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
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

describe('SCHEMA_TABLE_PRIVILEGES', () => {
  it('grants full DML on public and application schemas', () => {
    expect(SCHEMA_TABLE_PRIVILEGES.public).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    expect(SCHEMA_TABLE_PRIVILEGES.vault).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    expect(SCHEMA_TABLE_PRIVILEGES.precedent).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });

  it('grants the audit schema APPEND-ONLY (no UPDATE/DELETE) for Part 11 tamper-evidence', () => {
    expect(SCHEMA_TABLE_PRIVILEGES.audit).toEqual(['SELECT', 'INSERT']);
    expect(SCHEMA_TABLE_PRIVILEGES.audit).not.toContain('UPDATE');
    expect(SCHEMA_TABLE_PRIVILEGES.audit).not.toContain('DELETE');
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

    // public gets full DML; audit is append-only.
    expect(
      statements.some((s) =>
        /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public"/.test(s),
      ),
    ).toBe(true);
    expect(
      statements.some((s) => /GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA "audit"/.test(s)),
    ).toBe(true);
    expect(
      statements.some((s) => /UPDATE, DELETE ON ALL TABLES IN SCHEMA "audit"/.test(s)),
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

  it('skips schemas that do not exist (no grants emitted for them)', async () => {
    const { db, statements } = makeFakeDb({ existingSchemas: ['public'], roleExists: false });
    const result = await provisionAppServiceRole(db as never, {
      env: { APP_SERVICE_DB_PASSWORD: 'a-sufficiently-long-secret' },
    });
    expect(result.schemas).toEqual(['public(SELECT, INSERT, UPDATE, DELETE)']);
    expect(statements.some((s) => s.includes('IN SCHEMA "audit"'))).toBe(false);
    expect(statements.some((s) => s.includes('IN SCHEMA "vault"'))).toBe(false);
  });
});
