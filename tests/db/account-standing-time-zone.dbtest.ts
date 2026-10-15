/**
 * When a membership began is read in the time zone it was written in, so the
 * session check of plan P0-4b R1 does not depend on the database running in UTC
 * (security audit 2026-09-24 IAM-04 (b); 21 CFR 11.300(c), HIPAA
 * 164.312(a)(2)(iii); the product also targets APPI deployments in Japan).
 *
 * ── The defect this pins (reproduced 2026-10-01, before the fix) ───────────
 * The standing (server/services/account-standing.ts readAccountStanding) reads
 * organization_users.created_at to tell whether a session began before its
 * membership. That column is a timestamp WITHOUT time zone, DEFAULT now()
 * (migrations/0000_sweet_joseph.sql), and every writer leaves it to that
 * default (sign-up, SSO provisioning, SCIM, invitation, first-run setup), so it
 * holds the writing connection's local time. The standing read it as UTC.
 *   · Under Asia/Tokyo the membership read 32 400 s (9 h) in the future, and
 *     every session begun in the nine hours after a membership was created was
 *     refused as ended at every door.
 *   · Under America/Los_Angeles it read 7 or 8 h in the past, and a session
 *     begun before the membership, which R1 ends, stayed current.
 * Nothing pins or asserts the database's TimeZone: not Terraform, not
 * server/db, not the deploy workflow.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 * The standing reads `created_at AT TIME ZONE current_setting('TimeZone')`:
 * the naive value in the zone of the connection reading it, which is the zone
 * every writer's default wrote it in (no connection sets its own TimeZone).
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * The membership is written by its column default through a connection in the
 * zone under test, and read by the production standing statement through the
 * runtime pool (server/db/runtime.ts) opened in the same zone (PGOPTIONS, which
 * the runtime pool passes through). That is a database whose TimeZone setting
 * is that zone. Utc is the control. The clock is not faked.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbstz": organisation 93331; the one email starts `dbstz-`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const ORG = 93331;
const TAG = 'dbstz';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const ZONES = ['Etc/UTC', 'Asia/Tokyo', 'America/Los_Angeles'] as const;

let owner: Pool;
let userId = 0;
const savedPgOptions = process.env.PGOPTIONS;

async function cleanup(): Promise<void> {
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  const orgs = (await owner.query(`SELECT uuid::text AS uuid FROM organizations WHERE id = $1`, [ORG])).rows as Array<{
    uuid: string;
  }>;
  await owner.query('DELETE FROM organizations WHERE id = $1', [ORG]);
  if (orgs.length > 0) {
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        orgs.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();
  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status) VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, 'Lane Time Zone', 'x', $2) RETURNING id`,
    [`${TAG}-member-${RUN}@example.invalid`, ORG],
  );
  userId = user.rows[0].id as number;
}, 60_000);

afterAll(async () => {
  if (savedPgOptions === undefined) delete process.env.PGOPTIONS;
  else process.env.PGOPTIONS = savedPgOptions;
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbstz] cleanup left rows:', err?.message));
    await owner.end();
  }
});

describe('R1: a membership begun under any database time zone is read at the moment it began', () => {
  for (const zone of ZONES) {
    it(`under ${zone}: a session begun after the membership is current, one begun before it is over`, async () => {
      // The membership, written as every writer writes it: by the column default, in the zone.
      const writer = new Pool({ connectionString: databaseUrl, max: 1, options: `-c TimeZone=${zone}` });
      const before = Math.floor(Date.now() / 1000);
      try {
        await writer.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG, userId]);
        await writer.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [
          ORG,
          userId,
        ]);
      } finally {
        await writer.end();
      }
      const after = Math.floor(Date.now() / 1000);

      // The production standing statement, through a runtime pool opened in the same zone.
      vi.resetModules();
      process.env.PGOPTIONS = `-c TimeZone=${zone}`;
      const standingModule = await import('../../server/services/account-standing');
      const runtime = await import('../../server/db/runtime');
      const { runWithPreAuthScope } = await import('../../server/db/tenantStore');
      try {
        const shown = await runWithPreAuthScope('dbstz:reader-zone', () => runtime.getPool().query('SHOW TimeZone'));
        expect(shown.rows[0].TimeZone ?? shown.rows[0].timezone, 'the reader is not in the zone under test').toBe(zone);

        const standing = await standingModule.readAccountStandingBeforeTenant(userId, ORG);
        const began = standing.membershipBeganAtSeconds;
        // Soft, so a failing run shows all three answers, not the first.
        expect
          .soft(
            standingModule.sessionEndedByStanding({ sst: after, iat: after }, standing),
            'a session begun after the membership was ended',
          )
          .toBe(false);
        expect
          .soft(
            standingModule.sessionEndedByStanding({ sst: before - 1, iat: before - 1 }, standing),
            'a session begun before the membership stayed current',
          )
          .toBe(true);
        expect
          .soft(
            typeof began === 'number' && began >= before && began <= after,
            `the membership began between ${before} and ${after}; the standing read ${began} (${
              typeof began === 'number' ? began - before : 'n/a'
            } s from the first)`,
          )
          .toBe(true);
      } finally {
        await runtime.getPool().end().catch(() => {});
      }
    });
  }
});
