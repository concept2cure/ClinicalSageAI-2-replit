/**
 * The SAP generator reads no other organization's reports, plans no method on
 * a count of them, and reports a failed read as a failure.
 *
 * generateSAP read csr_reports for "similar protocols" with no organization
 * filter, and the only use of what came back was its length: five or more
 * rows, from any tenant, switched a Phase 3 primary analysis from MMRM to a
 * GLMM and added reference-based imputation ("In a real implementation, would
 * extract and analyze methods from similar trials"). A failed read returned [].
 * storeSapSegments read the protocol's csr_reports row by id, unscoped, and
 * stored nothing; updateSap read it by id, unscoped, and took its indication
 * and phase. getSapByProtocolId answered a failed file read with the null that
 * means "no SAP", and getSapSegmentsByProtocolId with [].
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';

const H = vi.hoisted(() => ({ selects: 0, wheres: [] as unknown[], rows: [] as unknown[] }));

vi.mock('../../db', () => {
  const chain = {
    select: () => {
      H.selects += 1;
      return chain;
    },
    from: () => chain,
    where: (condition: unknown) => {
      H.wheres.push(condition);
      return chain;
    },
    limit: async () => H.rows,
  };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});

import SapGenerator from '../sap-generator-service';

const REQUIRED = {
  indication: 'Type 2 diabetes',
  phase: 'Phase 3',
  sample_size: 400,
  primary_endpoint: 'HbA1c change from baseline at week 24',
};
/** Six reports matching the indication and phase, none of them the caller's. */
const OTHER_TENANTS_REPORTS = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, organizationId: 99, indication: 'Type 2 diabetes', phase: 'Phase 3' }));

const rendered = (condition: unknown) => new PgDialect().sqlToQuery(condition as never);

beforeEach(() => {
  H.selects = 0;
  H.wheres = [];
  H.rows = [];
  // generateSAP writes <protocol_id>_sap.txt under data/sap; not from a test.
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateSAP', () => {
  it('plans the same primary analysis however many reports anybody holds, and reads none of them', async () => {
    H.rows = OTHER_TENANTS_REPORTS;
    const { sapContent } = await SapGenerator.generateSAP(REQUIRED);

    expect(sapContent, 'six reports switched the Phase 3 primary analysis').not.toMatch(/GLMM|Reference-based imputation/);
    expect(sapContent).toContain('The primary endpoint will be analyzed using mixed model for repeated measures (MMRM).');
    expect(H.selects, 'csr_reports was read with no organization filter').toBe(0);
  });

  it('reads no csr_reports row for the protocol it is filed under', async () => {
    H.rows = [{ id: 5, organizationId: 99 }];
    await SapGenerator.generateSAP({ ...REQUIRED, protocol_id: '5' });
    expect(H.selects, "another organization's report was read by id").toBe(0);
  });
});

describe('updateSap', () => {
  it("reads the protocol only within the caller's organization", async () => {
    H.rows = [{ id: 5, indication: 'NSCLC', phase: 'Phase 2' }];
    await SapGenerator.updateSap('5', 3, { sample_size: 120, primary_endpoint: 'PFS' }).catch(() => null);

    expect(H.wheres).toHaveLength(1);
    const query = rendered(H.wheres[0]);
    expect(query.sql, 'the protocol was read by id alone').toMatch(/"organization_id" = \$\d/);
    expect(query.params).toEqual(expect.arrayContaining([5, 3]));
  });

  it('refuses to read a protocol for no organization', async () => {
    const err = await SapGenerator.updateSap('5', undefined as unknown as number, { sample_size: 120, primary_endpoint: 'PFS' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'the protocol was read with no organization').toBeInstanceOf(Error);
    expect(H.selects).toBe(0);
  });
});

describe('reading a saved SAP', () => {
  const unreadable = () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });
  };

  it('fails when the saved SAP cannot be read, rather than reporting that there is none', async () => {
    unreadable();
    const err = await SapGenerator.getSapByProtocolId('5').then(() => null, (e: unknown) => e);
    expect(err, 'an unreadable SAP was reported as no SAP (null)').toBeInstanceOf(Error);
  });

  it('fails when the segments cannot be read, rather than reporting none', async () => {
    unreadable();
    const err = await SapGenerator.getSapSegmentsByProtocolId('5').then(() => null, (e: unknown) => e);
    expect(err, 'an unreadable SAP was reported as having no segments ([])').toBeInstanceOf(Error);
  });

  it('still answers null for a SAP that was never saved', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(await SapGenerator.getSapByProtocolId('5')).toBeNull();
  });
});
