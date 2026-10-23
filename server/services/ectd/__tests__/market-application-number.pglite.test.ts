/**
 * A package carries its own market's application number (decision P-44,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; 2026-10-22).
 *
 * A project records one application number, and every package read it,
 * whatever its market. The EU packager writes it into <procedure-number>, so
 * an MAA added to an NDA project (FILING_SPINE F22) packaged under the US NDA
 * number. The project's number is now its home market's: a submission in the
 * project's primary agency's region reads it, as before. A submission for
 * another market reads the number recorded on that submission, and with none
 * recorded its package is refused by name, never built with the project's.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { assembleSubmissionEctd } from '../assemble-from-core';
import { isHomeMarket, packageIdentityRefusal, readSubmissionPackageIdentity, recordedPackageIdentitySnapshot, PackageIdentityMissingError } from '../package-identity';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const NDA = '11111111-1111-4111-8111-111111111111';
const EMA_HOME = '22222222-2222-4222-8222-222222222222';
const q = () => ({ query: (text: string, params?: unknown[]) => harness.pglite.query(text, params) as Promise<{ rows: unknown[] }> });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(readFileSync('migrations/20261022b_submissions_market_application_number.sql', 'utf8'));
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure Therapeutics');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_name, application_number, primary_agency) VALUES
      ('${NDA}', ${ORG}, 'Vorelinib (NDA)', 'VR-1', 'NDA', 'Vorelinib', '214321', 'FDA'),
      ('${EMA_HOME}', ${ORG}, 'Vorelinib (MAA)', 'VR-2', 'MAA', 'Vorelinib', 'EMEA-H-C-005123', 'EMA');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id, application_number) VALUES
      (1, 'US NDA, the home market', 'nda', 'pharma', 'fda', ${ORG}, ${USER}, '${NDA}', NULL),
      (2, 'EU MAA added, no number recorded', 'maa', 'pharma', 'eu', ${ORG}, ${USER}, '${NDA}', NULL),
      (3, 'EU MAA added, its number recorded', 'maa', 'pharma', 'eu', ${ORG}, ${USER}, '${NDA}', 'EMEA-H-C-005124'),
      (4, 'EU MAA of an EMA project, the home market', 'maa', 'pharma', 'eu', ${ORG}, ${USER}, '${EMA_HOME}', NULL),
      (5, 'a stale number on a home-market submission is not read', 'nda', 'pharma', 'fda', ${ORG}, ${USER}, '${NDA}', '999999');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (21, 2, 'eu', '0000', ${ORG}, ${USER}),
      -- A sequence of another region under the US home submission (security
      -- review, 2026-10-22): its package is built for the sequence's region.
      (22, 1, 'eu', '0001', ${ORG}, ${USER});
  `);
});
afterAll(async () => { await harness?.close(); });

const read = (id: number) => readSubmissionPackageIdentity(q(), ORG, id);

/** Each damaged-record case restores its own changes before the next check. */
async function withChangedRecord(sql: string, params: unknown[], check: () => Promise<void>) {
  await harness.pglite.exec('BEGIN');
  try {
    await harness.pglite.query(sql, params);
    await check();
  } finally {
    await harness.pglite.exec('ROLLBACK');
  }
}

describe('a package carries its own market\'s application number (P-44)', () => {
  it("the home market reads the project's number", async () => {
    expect((await read(1)).applicationNumber).toBe('214321');
    expect((await read(4)).applicationNumber).toBe('EMEA-H-C-005123');
    expect((await read(5)).applicationNumber).toBe('214321');
  });

  it("another market reads the number recorded on its submission, never the project's", async () => {
    expect((await read(3)).applicationNumber).toBe('EMEA-H-C-005124');
    const unrecorded = await read(2);
    expect(unrecorded.applicationNumber).toBeNull();
    const refusal = packageIdentityRefusal(unrecorded, 'Nothing was built.');
    expect(refusal?.message).toMatch(/EU market/);
    expect(refusal?.message).toMatch(/record the number its agency assigned on the submission/);
    expect(refusal?.message).not.toContain('214321');
  });

  it("the market is the package's region: a sequence of another region never borrows its submission's number", async () => {
    const eu = { region: 'eu' };
    expect((await readSubmissionPackageIdentity(q(), ORG, 1, eu)).applicationNumber).toBeNull();
    expect((await readSubmissionPackageIdentity(q(), ORG, 3, eu)).applicationNumber).toBe('EMEA-H-C-005124');
    expect((await readSubmissionPackageIdentity(q(), ORG, 3, { region: 'fda' })).applicationNumber).toBe('214321');
    await expect(assembleSubmissionEctd({ submissionId: 1, organizationId: ORG, userId: USER, sequenceNumber: '0001' }))
      .rejects.toBeInstanceOf(PackageIdentityMissingError);
  });

  it('the export of an added market with no number recorded is refused, and nothing is built', async () => {
    await expect(assembleSubmissionEctd({ submissionId: 2, organizationId: ORG, userId: USER, sequenceNumber: '0000' }))
      .rejects.toBeInstanceOf(PackageIdentityMissingError);
  });
});

describe('unresolved market identity never borrows a recorded application number', () => {
  it.each(['not-a-market', '', '   ', null])('an explicit unresolved package region (%j) never borrows either recorded number', async (region) => {
    const identity = await readSubmissionPackageIdentity(q(), ORG, 3, { region });
    expect(identity.applicationNumber).toBeNull();
    expect(identity.marketResolutionProblem).toMatch(/package market is not recognized/);
    const refusal = packageIdentityRefusal(identity, 'Nothing was built.');
    expect(refusal?.message).toMatch(/correct the submission or sequence region before packaging/);
    expect(refusal?.message).not.toMatch(/record the number|records no agency application number|214321|005124/);
  });

  it.each(['not-an-agency', '', '   '])('an unresolved home agency (%j) cannot authorize the project or submission number', async (agency) => {
    await withChangedRecord('UPDATE regulatory_programs SET primary_agency = $1 WHERE id = $2', [agency, NDA], async () => {
      for (const id of [1, 3]) {
        const identity = await read(id);
        expect(identity.applicationNumber).toBeNull();
        expect(identity.marketResolutionProblem).toMatch(/primary agency is not recognized/);
        expect(packageIdentityRefusal(identity, 'Nothing was built.')?.message)
          .toMatch(/correct the project's primary agency before packaging/);
      }
    });
  });

  it('two identical unknown region strings do not establish home ownership', () => {
    expect(isHomeMarket('unrecorded', 'unrecorded')).toBe(false);
    expect(isHomeMarket(null, null)).toBe(false);
    expect(isHomeMarket('eu', 'unknown')).toBe(false);
    expect(isHomeMarket('unknown', 'FDA')).toBe(false);
  });

  it('recognized aliases preserve the home number, non-home number and exact version-1 snapshot bytes', async () => {
    for (const region of [' US ', 'fda', 'FDA']) {
      expect(isHomeMarket(region, 'FDA')).toBe(true);
      const identity = await readSubmissionPackageIdentity(q(), ORG, 1, { region });
      expect(identity.applicationNumber).toBe('214321');
      expect(identity.marketResolutionProblem).toBeUndefined();
      expect(JSON.stringify(recordedPackageIdentitySnapshot(identity, { region }))).toBe(JSON.stringify({
        version: 1,
        identity: {
          programId: NDA, applicationNumber: '214321', applicantSponsorId: null,
          applicantName: 'Concept2Cure Therapeutics', applicantId: null,
          contact: { name: null, phone: null, email: null },
        },
      }));
    }
    for (const region of [' EU ', 'ema', 'EMA']) {
      expect((await readSubmissionPackageIdentity(q(), ORG, 3, { region })).applicationNumber).toBe('EMEA-H-C-005124');
    }
    const home = await readSubmissionPackageIdentity(q(), ORG, 1);
    expect(recordedPackageIdentitySnapshot({ ...home, marketResolutionProblem: 'runtime diagnosis' }))
      .toEqual(recordedPackageIdentitySnapshot(home));
  });

  it('a known sequence may prove home despite an unknown submission region, but cannot read its non-home number', async () => {
    await withChangedRecord('UPDATE submissions SET primary_region = $1 WHERE id = 3', ['unknown'], async () => {
      expect((await readSubmissionPackageIdentity(q(), ORG, 3, { region: 'FDA' })).applicationNumber).toBe('214321');
      const nonHome = await readSubmissionPackageIdentity(q(), ORG, 3, { region: 'EMA' });
      expect(nonHome.applicationNumber).toBeNull();
      expect(nonHome.marketResolutionProblem).toMatch(/submission's market is not recognized/);
      expect(packageIdentityRefusal(nonHome, 'Nothing was built.')?.message).toMatch(/correct its primary region/);
      expect((await read(3)).applicationNumber).toBeNull();
    });
  });

  it('a missing, deleted or foreign submission never yields a number; a deleted project cannot lend a submission its own number', async () => {
    expect((await read(999999)).applicationNumber).toBeNull();
    expect((await readSubmissionPackageIdentity(q(), ORG + 1, 3)).applicationNumber).toBeNull();
    await withChangedRecord('UPDATE submissions SET deleted_at = now() WHERE id = 3', [], async () => {
      expect((await read(3)).applicationNumber).toBeNull();
    });
    await withChangedRecord('UPDATE regulatory_programs SET deleted_at = now() WHERE id = $1', [NDA], async () => {
      const identity = await read(3);
      expect(identity.applicationNumber).toBeNull();
      expect(packageIdentityRefusal(identity, 'Nothing was built.')).not.toBeNull();
    });
    await withChangedRecord('UPDATE submissions SET program_id = NULL WHERE id = 3', [], async () => {
      const identity = await read(3);
      expect(identity.applicationNumber).toBeNull();
      expect(identity.marketResolutionProblem).toMatch(/not anchored to a project/);
      expect(identity.marketResolutionProblem).not.toMatch(/record the number on the project/);
      expect(packageIdentityRefusal(identity, 'Nothing was built.')?.message).toMatch(/not anchored to a project/);
    });
  });
});
