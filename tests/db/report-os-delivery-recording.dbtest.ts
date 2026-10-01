/**
 * P1-44 (DP-50, second half), against the real database: a Report OS delivery
 * is answered 'sent' only when its correspondence row, its delivery record and
 * its chained audit row committed together.
 *
 * Through the real router on the shared two-tenant fixture — `app_service`, not
 * superuser, no BYPASSRLS, `app.rls_enforce=on`, asserted by the fixture. A
 * refused write is made real with a BEFORE INSERT trigger scoped to this run's
 * own subject (or this tenant's chain row) and dropped in `finally`, so nothing
 * else writing the shared tables is touched.
 *
 * Counts are read through the OWNER pool, which is exempt from RLS: reading
 * through the app role would be circular.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportOsRouter from '../../server/routes/report-os';
import logger from '../../server/utils/logger';
import {
  TAG,
  ORG_B,
  owner,
  tokenB,
  ids,
  auth,
  accessToken,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const TYPE_ID = `${TAG}.delivery_status`;
const REFUSE_FN = `p144_refuse_${process.pid}`;
const ro = express();
ro.use(express.json());
ro.use('/api/report-os', reportOsRouter);

let openRun: number;
let finalRun: number;
let submission: string;

/* A delivery carries finalize's tier (DP-61): owner, admin or manager. tokenB
   is a plain member, which is now refused (pinned below). */
let managerToken: string;

beforeAll(async () => {
  await provisionTwoTenantFixture();
  managerToken = accessToken(await provisionMember(ORG_B, 'manager', 'report-manager'), ORG_B, 'manager');
  await owner.query(
    `INSERT INTO report_type_registry (type_id,label,family,allowed_scopes)
     VALUES ($1,$2,'readiness','["project"]'::json)`,
    [TYPE_ID, `${TAG} delivery status`]
  );
  const insertRun = async (status: string) =>
    (
      await owner.query(
        `INSERT INTO report_runs (organization_id,scope_type,scope_id,report_type_id,status,dependency_summary)
         VALUES ($1,'project',$2,$3,$4,'{}'::json) RETURNING id`,
        [ORG_B, ids.B.projects, TYPE_ID, status]
      )
    ).rows[0].id as number;
  openRun = await insertRun('completed');
  finalRun = await insertRun('final');
  submission = (
    await owner.query(
      `INSERT INTO c2c_submissions (organization_id,project_id,submission_type,regulator,lifecycle_state)
       VALUES ($1,$2,'NDA','FDA','drafting') RETURNING id::text AS id`,
      [ORG_B, ids.B.projects]
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await owner?.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON c2c_correspondence`).catch(() => {});
  await owner?.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON audit_logs`).catch(() => {});
  await owner?.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON project_memory_entries`).catch(() => {});
  await owner?.query(`DROP FUNCTION IF EXISTS ${REFUSE_FN}()`).catch(() => {});
  await removeDeliveryAuditRows().catch((err) => console.warn('[P1-44] audit rows left in place:', err));
  await teardownTwoTenantFixture();
});

/** audit_logs is append-only; as its owner, lift the DELETE trigger for this tenant's delivery rows only. */
async function removeDeliveryAuditRows(): Promise<void> {
  const cleanup = await owner.connect();
  try {
    await cleanup.query('BEGIN');
    await cleanup.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await cleanup.query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND action LIKE 'report\\_os.delivery\\_%'`, [ORG_B]);
    await cleanup.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await cleanup.query('COMMIT');
  } catch (err) {
    await cleanup.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cleanup.release();
  }
}

/** Everything a delivery with `subject` left behind, read as the owner. */
async function traces(subject: string) {
  const letters = await owner.query(
    'SELECT id::text AS id, direction, status FROM c2c_correspondence WHERE organization_id = $1 AND subject = $2',
    [ORG_B, subject]
  );
  const records = await owner.query(
    `SELECT title FROM project_memory_entries
      WHERE organization_id = $1 AND subcategory = 'report_delivery_record' AND content LIKE $2`,
    [ORG_B, `%${subject}%`]
  );
  const chain = await owner.query(
    `SELECT action, record_id, table_name, new_values::jsonb AS details, sha256_chain IS NOT NULL AS chained
       FROM audit_logs WHERE tenant_id = $1 AND action LIKE 'report\\_os.delivery\\_%'
        AND new_values::jsonb ->> 'subject' = $2`,
    [ORG_B, subject]
  );
  return { letters: letters.rows, records: records.rows, chain: chain.rows };
}

async function refuseOn(table: 'c2c_correspondence' | 'audit_logs' | 'project_memory_entries', when: string, run: () => Promise<void>) {
  await owner.query(
    `CREATE FUNCTION ${REFUSE_FN}() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN RAISE EXCEPTION 'refused by the P1-44 dbtest'; END $$`
  );
  await owner.query(`CREATE TRIGGER ${REFUSE_FN} BEFORE INSERT ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${REFUSE_FN}()`);
  try {
    await run();
  } finally {
    await owner.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON ${table}`);
    await owner.query(`DROP FUNCTION IF EXISTS ${REFUSE_FN}()`);
  }
}

const send = (subject: string, runId = openRun) =>
  request(ro)
    .post('/api/report-os/deliveries')
    .set(auth(managerToken))
    .send({ runId, channel: 'platform_send', submissionId: submission, subject, recipients: ['agency-contact'], captureForLearning: false });

describe('POST /api/report-os/deliveries on the record (P1-44)', () => {
  it('a plain member cannot deliver: 403, no letter and no chain row (DP-61)', async () => {
    const subject = `${TAG} member refused`;
    const res = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(tokenB))
      .send({ runId: openRun, channel: 'platform_send', submissionId: submission, subject, recipients: ['agency-contact'], captureForLearning: false });
    expect(res.status).toBe(403);
    const letters = await owner.query('SELECT count(*)::int AS n FROM c2c_correspondence WHERE organization_id = $1 AND subject = $2', [ORG_B, subject]);
    expect(letters.rows[0].n).toBe(0);
  });

  it("platform_send as app_service under RLS: 'sent', with the letter, the record and one chained row", async () => {
    const subject = `${TAG} sent`;
    const res = await send(subject);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { deliveryId, correspondenceId, status } = res.body.data;
    expect(status).toBe('sent');
    const t = await traces(subject);
    expect(t.letters).toEqual([{ id: correspondenceId, direction: 'outbound', status: 'responded' }]);
    expect(t.records).toEqual([{ title: `delivery:${deliveryId}` }]);
    expect(t.chain).toHaveLength(1);
    expect(t.chain[0]).toMatchObject({
      action: 'report_os.delivery_sent',
      record_id: deliveryId,
      table_name: 'report_delivery',
      chained: true,
      details: { correspondenceId, channel: 'platform_send', runId: openRun, submissionId: submission },
    });
  });

  it('a refused correspondence write is not sent: 503, and no record or chain row claims it', async () => {
    const subject = `${TAG} letter refused`;
    let res!: request.Response;
    await refuseOn('c2c_correspondence', `NEW.subject = '${subject}'`, async () => {
      res = await send(subject);
    });
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error.code).toBe('REPORT_DELIVERY_NOT_RECORDED');
    expect(JSON.stringify(res.body)).not.toContain('refused by the P1-44 dbtest');
    expect(await traces(subject)).toEqual({ letters: [], records: [], chain: [] });
  });

  it('a refused chain row is not sent: the letter and the record roll back with it', async () => {
    const subject = `${TAG} chain refused`;
    let res!: request.Response;
    await refuseOn('audit_logs', `NEW.action = 'report_os.delivery_sent' AND NEW.tenant_id = ${ORG_B}`, async () => {
      res = await send(subject);
    });
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(await traces(subject)).toEqual({ letters: [], records: [], chain: [] });
  });

  /* A run made final without the finalize signature (here, written final by
     the owner; in production, a run finalized before finalizing was signed).
     The signed case, through the real finalize, is in
     report-os-registry-seed.dbtest.ts (P1-44b). */
  it('external_pdf_export of a final report with no signature is refused: 409, nothing recorded', async () => {
    const subject = `${TAG} final external`;
    const res = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(managerToken))
      .send({ runId: finalRun, channel: 'external_pdf_export', subject, recipients: ['partner'], captureForLearning: false });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('E_SIGNATURE_REQUIRED');
    expect(res.body.error.message).toContain(`run ${finalRun}`);
    expect(await traces(subject)).toEqual({ letters: [], records: [], chain: [] });
  });
});

/*
 * DP-67 (b), GDPR Art. 5(1)(c), against the real database. A delivery record
 * refused by PostgreSQL reaches the route as drizzle's DrizzleQueryError, whose
 * message is the statement and every parameter: the record, with the subject,
 * the letter and the recipients. The route logged that message. The logger is
 * spied on (its output would otherwise go to stdout), so every line any layer
 * handed it is read back.
 */
describe('a failed delivery logs ids and codes, never the letter (DP-67 (b))', () => {
  it('a delivery record refused by the database: 503, and no log line carries the subject, the letter or a recipient', async () => {
    const subject = `${TAG} record refused`;
    const message = `${TAG} the clarification letter body, which is not for a log`;
    const recipient = `${TAG}-reviewer@agency.example`;
    const lines: Array<{ message: string; context: unknown }> = [];
    const spies = (['error', 'warn', 'info'] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation((m: string, context?: unknown) => {
        lines.push({ message: m, context });
      })
    );
    let res!: request.Response;
    try {
      await refuseOn('project_memory_entries', `NEW.subcategory = 'report_delivery_record' AND NEW.content LIKE '%${subject}%'`, async () => {
        res = await request(ro)
          .post('/api/report-os/deliveries')
          .set(auth(managerToken))
          .send({ runId: openRun, channel: 'platform_send', submissionId: submission, subject, message, recipients: [recipient], captureForLearning: false });
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(await traces(subject)).toEqual({ letters: [], records: [], chain: [] });
    const logged = JSON.stringify(lines);
    for (const text of [subject, message, recipient, 'refused by the P1-44 dbtest']) {
      expect(logged, `the log must not carry "${text}"`).not.toContain(text);
    }
    const failure = lines.find((l) => /report delivery not recorded/.test(l.message));
    expect(failure, 'the failure is logged').toBeDefined();
    // RAISE EXCEPTION's SQLSTATE, read off the query error's cause.
    expect(failure!.context).toMatchObject({ channel: 'platform_send', code: 'P0001', deliveryId: expect.any(String) });
  });
});
