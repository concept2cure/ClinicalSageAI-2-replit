/**
 * Recording a market's own application number (decision P-44), on PGlite with
 * the real schema and the real chained audit writer.
 *
 * The project's number is its home market's. A submission for another market
 * records the number its own agency assigned, by one governed act: the
 * project's lead or a manager, a stated reason, a chained audit row naming the
 * old and new value. The home market's submission is refused (its number is
 * the project's), and so are an unusable number and an FDA number that is not
 * six digits. Once recorded, the market's package reads it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
process.env.AUDIT_HMAC_KEY = 'market-application-number-audit-hmac-key-not-a-secret';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
}));

import { readMarketApplicationNumber, recordMarketApplicationNumber } from '../market-application-number';
import { readSubmissionPackageIdentity } from '../../ectd/package-identity';

const ORG = 7;
const LEAD = 11;
const MEMBER = 12;
const NDA = '11111111-1111-4111-8111-111111111111';
const MAA = '22222222-2222-4222-8222-222222222222';
const REASON = 'EMA assigned the procedure number on validation';
let jdb: JourneyDb;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'audit_logs']),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260609_ind_master_data.sql',
      'migrations/20261021_regulatory_programs_applicant_sponsor.sql',
      'migrations/20260604_submission_core_canonical.sql',
      'migrations/20260925b_submissions_program_anchor.sql',
      'migrations/20261022b_submissions_market_application_number.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Concept2Cure', 'c2c', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${LEAD}, 'lead@example.test', 'Robin Lead', 'x'), (${MEMBER}, 'm@example.test', 'Sam Member', 'x')`);
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status, lead_user_id, application_number)
     VALUES ($1, $3, 'NDA', 'N-1', 'nda', 'drug', 'Vorelinib', 'FDA', '["EMA"]'::json, 'active', $4, '214321'),
            ($2, $3, 'MAA', 'M-1', 'maa', 'drug', 'Vorelinib', 'EMA', '["FDA"]'::json, 'active', $4, 'EMEA-H-C-005123')`,
    [NDA, MAA, ORG, LEAD],
  );
  await jdb.pool.query(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
       (1, 'US NDA (home)', 'nda', 'pharma', 'fda', $1, $2, $3),
       (2, 'EU MAA (added market)', 'maa', 'pharma', 'eu', $1, $2, $3),
       (3, 'US NDA added to an EMA project', 'nda', 'pharma', 'fda', $1, $2, $4),
       (4, 'no project', 'maa', 'pharma', 'eu', $1, $2, NULL)`,
    [ORG, LEAD, NDA, MAA],
  );
});
afterAll(async () => { await jdb?.close?.(); });

const lead = { organizationId: ORG, userId: LEAD, orgRole: 'member' };
const record = (submissionId: number, applicationNumber: string, ctx = lead) =>
  recordMarketApplicationNumber({ submissionId, applicationNumber, reason: REASON }, ctx);
const audits = async () => (await jdb.pool.query(
  `SELECT reason, new_values FROM audit_logs WHERE action = 'SUBMISSION_APPLICATION_NUMBER_RECORDED' ORDER BY occurred_at`,
)).rows as Array<{ reason: string; new_values: Record<string, unknown> }>;

describe("recording a market's own application number (P-44)", () => {
  it('the lead records the EU number on the added market, with the reason and a chained audit row; the package reads it', async () => {
    expect((await readSubmissionPackageIdentity(jdb.pool as never, ORG, 2)).applicationNumber).toBeNull();
    const out = await record(2, 'EMEA-H-C-005124');
    expect(out).toEqual({ submissionId: 2, market: 'EU', applicationNumber: 'EMEA-H-C-005124', previous: null, changed: true });
    expect(await audits()).toEqual([expect.objectContaining({
      reason: REASON,
      new_values: expect.objectContaining({ market: 'EU', previous: null, applicationNumber: 'EMEA-H-C-005124' }),
    })]);
    expect((await readSubmissionPackageIdentity(jdb.pool as never, ORG, 2)).applicationNumber).toBe('EMEA-H-C-005124');
    expect((await readSubmissionPackageIdentity(jdb.pool as never, ORG, 1)).applicationNumber).toBe('214321');
  });

  it("the audit row names the project, so the project's feed shows it; the row's read says who recorded it, when and why", async () => {
    expect((await audits())[0].new_values).toMatchObject({ programId: NDA });
    const read = await readMarketApplicationNumber(2, { organizationId: ORG });
    expect(read).toMatchObject({ home: false, market: 'EU', applicationNumber: 'EMEA-H-C-005124', homeAgency: 'FDA' });
    expect(read.lastRecorded).toMatchObject({ by: 'Robin Lead', reason: REASON });
    expect((await readMarketApplicationNumber(1, { organizationId: ORG })).lastRecorded).toBeNull();
  });

  it('the same number again writes nothing', async () => {
    expect((await record(2, 'EMEA-H-C-005124')).changed).toBe(false);
    expect(await audits()).toHaveLength(1);
  });

  it.each([
    { what: 'the home market', id: 1, number: '214322', ctx: lead, code: 'INVALID_STATE', message: /home market \(FDA\)/ },
    { what: 'a member who is not the lead', id: 2, number: 'EMEA-H-C-9', ctx: { ...lead, userId: MEMBER }, code: 'FORBIDDEN', message: /lead or an organization manager/ },
    { what: 'a number with a slash', id: 2, number: 'EMEA/H/C/005124', ctx: lead, code: 'VALIDATION', message: /A slash is not accepted yet/ },
    { what: 'an FDA number that is not six digits', id: 3, number: '21432', ctx: lead, code: 'VALIDATION', message: /six/i },
    { what: 'a submission with no project', id: 4, number: 'EMEA-H-C-1', ctx: lead, code: 'UNANCHORED_SUBMISSION', message: /not anchored/ },
  ])('$what is refused, and nothing is written', async ({ id, number, ctx, code, message }) => {
    const before = await audits();
    await expect(record(id, number, ctx)).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
    expect(await audits()).toEqual(before);
  });

  it('a manager may record it, and the FDA rule takes a six-digit number; a frozen sequence does not stop a first recording', async () => {
    await jdb.pool.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, status, frozen_at)
       VALUES (3, 'fda', '0000', $1, $2, 'frozen', now())`, [ORG, LEAD]);
    const out = await record(3, '214399', { organizationId: ORG, userId: MEMBER, orgRole: 'admin' });
    expect(out).toMatchObject({ market: 'US', applicationNumber: '214399', changed: true });
  });

  it('a number a frozen or dispatched sequence was built under is not changed, and nothing is written', async () => {
    await jdb.pool.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
       VALUES (2, 'eu', '0000', $1, $2, 'dispatched', 'sent')`, [ORG, LEAD]);
    const before = await audits();
    await expect(record(2, 'EMEA-H-C-005125')).rejects.toMatchObject({
      code: 'INVALID_STATE', message: expect.stringMatching(/Sequence 0000 of this market is frozen or dispatched under EMEA-H-C-005124/),
    });
    expect(await audits()).toEqual(before);
    expect((await readMarketApplicationNumber(2, { organizationId: ORG })).applicationNumber).toBe('EMEA-H-C-005124');
  });
});
