/**
 * An eCTD package that assembled but was never recorded must say so.
 *
 * `storePackageRecord` INSERTs into `reg_ectd_packages`. No migration anywhere
 * in this repository creates that table — the live-schema baseline lists it as
 * absent from a full, successful provisioning run — so the INSERT cannot
 * succeed on any database built from this repo. Every package assembled through
 * this service has gone unrecorded: no row saying what was assembled, when, by
 * whom, for which sequence, with what file count and size.
 *
 * The failure was swallowed into a console.warn, and `assembleECTDPackage`
 * returned `success: true` with a clean validation report regardless. For a
 * filing package the assembly record is part of the record, and "we have the
 * bytes but no account of producing them" is precisely what an inspection asks
 * about — so the one place a user would look said nothing was wrong.
 *
 * The package must still assemble (a storage problem should not destroy work a
 * user is waiting on), so the assertion is not that it fails — it is that the
 * validation report tells the truth about what was and was not persisted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two things make the seam here non-obvious, and both send a naive mock past the
// code under test:
//   - tests/setup.ts installs a process-wide vi.mock('pg') whose pool answers
//     every query with an empty result, so a module mock of db.js loses to it and
//     the INSERT quietly succeeds;
//   - `pool` exported from db.js is a lazy Proxy over getPool(), so spying on it
//     sets a property nothing ever consults.
// Spying on the pool getPool() actually returns drives the real code path.
import { getPool } from '../../db.js';

import { assembleECTDPackage } from '../documentExportService';

const OPTIONS = {
  projectId: 1,
  organizationId: 1,
  userId: 1,
  sequenceNumber: '0000',
  submissionType: 'IND',
  region: 'us',
} as any;

/** Answers every read the assemble path makes; `onPackageInsert` decides the write. */
function mockDb(onPackageInsert: () => Promise<{ rows: unknown[] }>) {
  vi.spyOn(getPool() as any, 'query').mockImplementation((async (sql: string) => {
    const text = String(sql);
    if (/reg_ectd_packages/i.test(text)) return onPackageInsert();
    if (/FROM projects/i.test(text)) {
      return { rows: [{ name: 'Study 101', description: 'd', metadata: { submissionType: 'IND' } }] };
    }
    if (/concept2cure_artifacts|project_sections/i.test(text)) {
      return {
        rows: [
          {
            // The assemble loop reads camelCase off the row.
            sectionCode: 'm2.5',
            section_code: 'm2.5',
            title: 'Clinical Overview',
            content: '<p>Endpoint met.</p>',
            status: 'final',
          },
        ],
      };
    }
    return { rows: [] };
  }) as any);
}

describe('assembleECTDPackage — the assembly record', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports in the validation report when the package could not be recorded', async () => {
    // Exactly what a database built from this repo does: the table is not there.
    mockDb(async () => {
      throw new Error('relation "reg_ectd_packages" does not exist');
    });

    const result = await assembleECTDPackage(OPTIONS);

    const entry = result.validationReport.find(
      (e: any) => e.ruleId === 'package_record_not_stored',
    );
    expect(entry, 'an unrecorded package left no trace in the validation report').toBeTruthy();
    expect(entry!.severity).toBe('warning');
    expect(entry!.message).toMatch(/no assembly record/i);
    // The package itself must still be produced — losing the user's work is not
    // an improvement on losing the record of it.
    expect(result.packageId).toBeTruthy();
  }, 30_000);

  it('says nothing when the record was stored', async () => {
    mockDb(async () => ({ rows: [] }));

    const result = await assembleECTDPackage(OPTIONS);

    expect(
      result.validationReport.some((e: any) => e.ruleId === 'package_record_not_stored'),
    ).toBe(false);
  }, 30_000);
});
