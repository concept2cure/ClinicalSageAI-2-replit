/**
 * Minting the runtime role must work as the RDS master, who is not a superuser.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * On Amazon RDS the master user is LOGIN CREATEROLE CREATEDB and a member of
 * rds_superuser — but NOT a PostgreSQL superuser, and without BYPASSRLS or
 * REPLICATION. provisionAppServiceRole aligned an existing role with:
 *
 *     ALTER ROLE app_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 *                                 NOBYPASSRLS NOREPLICATION PASSWORD …
 *
 * PostgreSQL refuses to let a non-superuser NAME the SUPERUSER, BYPASSRLS or
 * REPLICATION attribute in ALTER ROLE — even to set it to NO:
 *
 *     ERROR:  permission denied to alter role
 *     DETAIL: Only roles with the SUPERUSER attribute may change the SUPERUSER attribute.
 *
 * And the role always exists by then: 080_gcc creates app_service NOLOGIN
 * earlier in the same install. So the step that mints the one role the
 * production runtime is allowed to connect as failed on RDS every time, after
 * the schema had been written. Every CI provisioning run connects as the true
 * superuser `postgres`, so none of them could ever see it.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The RDS shape, on a real server: a scratch database OWNED BY a non-superuser
 * CREATEROLE role, which also creates app_service the way the migration does.
 * Then provisioning as that role must (a) succeed, (b) leave the role able to
 * log in and still not superuser / BYPASSRLS / replication, and (c) REFUSE,
 * rather than report success, when the pre-existing role carries an attribute
 * only a superuser could clear.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { provisionAppServiceRole, scramSha256Verifier } from '../../scripts/db/provision-app-role.mjs';

const SUFFIX = `${process.pid}_${Math.floor(Math.random() * 1e6)}`;
const MASTER = `rds_master_${SUFFIX}`;
const MASTER_PW = `rds-master-pw-${SUFFIX}-0000000`;
const DB = `c2c_rdsshape_${SUFFIX}`;
const APP_ROLE = `app_service_${SUFFIX}`;
const APP_PW = `app-service-pw-${SUFFIX}-000000`;
const TAINTED_ROLE = `app_bypass_${SUFFIX}`;

let admin: Pool; // the test cluster's superuser — used only to build the RDS shape
let master: Pool; // the RDS-shaped master, connected to its own database

function urlFor(user: string, password: string, database: string): string {
  const u = new URL(databaseUrl);
  u.username = user;
  u.password = password;
  u.pathname = `/${database}`;
  return u.toString();
}

beforeAll(async () => {
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`CREATE ROLE ${MASTER} LOGIN CREATEROLE CREATEDB PASSWORD '${MASTER_PW}'`);
  await admin.query(`CREATE DATABASE ${DB} OWNER ${MASTER}`);

  master = new Pool({ connectionString: urlFor(MASTER, MASTER_PW, DB), max: 1 });
  // As on RDS, the master owns the schema it migrated — and creates the
  // runtime role the way 080_gcc does, before the provisioning step runs.
  await master.query('CREATE SCHEMA app');
  await master.query('CREATE TABLE app.widgets (id int primary key, organization_id int not null)');
  await master.query(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
});

afterAll(async () => {
  await master?.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => {});
    for (const r of [APP_ROLE, TAINTED_ROLE, MASTER]) {
      await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => {});
    }
    await admin.end();
  }
});

describe('provisionAppServiceRole as an RDS-shaped (non-superuser) master', () => {
  it('the master really is RDS-shaped: CREATEROLE, not superuser, no BYPASSRLS', async () => {
    const { rows } = await master.query(
      'SELECT rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolcreaterole: true, rolbypassrls: false });
  });

  it('mints the existing runtime role: LOGIN, and still not superuser / BYPASSRLS / replication', async () => {
    // Record everything sent to the server, statements and bind parameters.
    const sent: string[] = [];
    const recording = {
      query: (text: string, values?: unknown[]) => {
        sent.push(text, ...(values ?? []).map(String));
        return master.query(text, values as never);
      },
    };
    const result = await provisionAppServiceRole(recording as never, {
      env: { APP_SERVICE_DB_ROLE: APP_ROLE, APP_SERVICE_DB_PASSWORD: APP_PW },
    });
    expect(result.skipped).toBe(false);

    // The plaintext never left this process (log_statement=ddl on RDS writes
    // every ALTER ROLE to CloudWatch); the server stored the verifier sent.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((x) => x.includes(APP_PW))).toEqual([]);
    const stored = await admin.query('SELECT rolpassword FROM pg_authid WHERE rolname = $1', [APP_ROLE]);
    expect(stored.rows[0].rolpassword).toMatch(/^SCRAM-SHA-256\$4096:/);

    const { rows } = await master.query(
      `SELECT rolcanlogin, rolsuper, rolbypassrls, rolreplication, rolcreatedb, rolcreaterole
         FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]).toEqual({
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      rolreplication: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  });

  it('the minted role can connect with the password and read what it was granted', async () => {
    const runtime = new Pool({ connectionString: urlFor(APP_ROLE, APP_PW, DB), max: 1 });
    try {
      const { rows } = await runtime.query('SELECT count(*)::int AS n FROM app.widgets');
      expect(rows[0].n).toBe(0);
    } finally {
      await runtime.end();
    }
  });

  // The login above shows the role can LOG IN and read its grants. It cannot
  // show the verifier is right: a server whose pg_hba trusts the connection
  // (this one locally, and CI's may) accepts any password. So compare with the
  // server's own arithmetic instead: let PostgreSQL hash a password, read back
  // the salt it chose, and compute ours with that salt. Equal strings mean the
  // server would verify our verifier exactly as it verifies its own.
  it("computes the same SCRAM verifier PostgreSQL computes for the same password and salt", async () => {
    const probe = `scram_probe_${SUFFIX}`;
    const client = await admin.connect();
    try {
      await client.query("SET password_encryption = 'scram-sha-256'");
      await client.query(`CREATE ROLE ${probe} LOGIN PASSWORD '${APP_PW}'`);
      const { rows } = await client.query('SELECT rolpassword FROM pg_authid WHERE rolname = $1', [probe]);
      const serverVerifier: string = rows[0].rolpassword;
      const m = serverVerifier.match(/^SCRAM-SHA-256\$(\d+):([^$]+)\$/);
      expect(m).not.toBeNull();
      const ours = scramSha256Verifier(APP_PW, {
        salt: Buffer.from(m![2], 'base64'),
        iterations: Number(m![1]),
      });
      expect(ours).toBe(serverVerifier);
    } finally {
      await client.query(`DROP ROLE IF EXISTS ${probe}`).catch(() => {});
      client.release();
    }
  });

  it('REFUSES a pre-existing role it cannot make safe, instead of reporting it minted', async () => {
    // A role someone created BYPASSRLS as a true superuser. The RDS master
    // cannot clear that attribute, so provisioning must not claim success.
    await admin.query(`CREATE ROLE ${TAINTED_ROLE} NOLOGIN BYPASSRLS`);
    // PostgreSQL 16+ requires ADMIN OPTION to alter another role at all; on RDS
    // the master holds it for roles it created. Grant it so the refusal tested
    // is the attribute, not the membership.
    await admin.query(`GRANT ${TAINTED_ROLE} TO ${MASTER} WITH ADMIN OPTION`).catch(() => {});

    await expect(
      provisionAppServiceRole(master, {
        env: { APP_SERVICE_DB_ROLE: TAINTED_ROLE, APP_SERVICE_DB_PASSWORD: APP_PW },
      }),
    ).rejects.toThrow(/BYPASSRLS/);
  });
});
