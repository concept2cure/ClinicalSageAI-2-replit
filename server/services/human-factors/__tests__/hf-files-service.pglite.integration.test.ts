/**
 * hf-files-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: an HFE/UE file RECORDED through the service
 * persists in the real hf_engineering_files store and reads back org-scoped, with
 * its element presence map normalized to the canonical IEC 62366-1 element set (so
 * the surface's completeness is computed against a stable denominator, never a
 * stored verdict). Also locks required-input validation, malformed-map rejection,
 * soft-delete, and strict tenant scope.
 *
 * D2, 2026-10-29 (docs/evidence/D2-ONE-ANA/2026-10-29/device-features-human-factors/):
 * the schema is the real one, applied from the creating migrations
 * (20260524 regulatory_programs, 20260801 hf_engineering_files) and
 * 20261029's program key, instead of a hand-written copy that would not have
 * the column. A file recorded with a project reads back only under that
 * project; a file recorded without one is the organization's unscoped file
 * and no project read returns it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import {
  createHfFile, listHfFiles, getHfFile, deleteHfFile, HfFileValidationError, HF_ELEMENT_KEYS,
} from '../hf-files-service';

const ORG = 7;
const OTHER = 9;

const ROOT = join(__dirname, '..', '..', '..', '..');
const MIGRATIONS = [
  'migrations/20260524_program_workbench_schema.sql',
  'db/migrations/20260801_hf_files_store.sql',
  'migrations/20261029_hf_engineering_files_program_key.sql',
];
const P_ORG = '11111111-1111-4111-8111-111111111111'; // organization 7
const P_ORG_2 = '22222222-2222-4222-8222-222222222222'; // organization 7, a second project
const P_OTHER = '33333333-3333-4333-8333-333333333333'; // organization 9

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);`);
  for (const f of MIGRATIONS) await pglite.exec(readFileSync(join(ROOT, f), 'utf8'));
  for (const [id, org] of [[P_ORG, ORG], [P_ORG_2, ORG], [P_OTHER, OTHER]] as const) {
    await pglite.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, '510K', 'device', 'FDA', $5)`,
      [id, org, id, id.slice(0, 8), id],
    );
  }
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM hf_engineering_files;`); });

describe('hf-files-service', () => {
  it('records a file, reads it back, and normalizes the element presence map', async () => {
    const created = await createHfFile(ORG, {
      device: 'BX-204 CGM — continuous glucose monitor',
      present: {
        useSpecification: true,
        criticalTasks: 1,             // truthy but not === true → coerced to false
        summativeEvaluation: false,
        bogusElement: true,           // unknown key → dropped
      } as unknown as Record<string, boolean>,
      createdBy: 42,
    });
    expect(created.id).toBeTruthy();
    expect(created.organization_id).toBe(ORG);
    expect(created.created_by).toBe(42);
    expect(created.framework).toBe('IEC 62366-1');

    const rows = await listHfFiles(ORG);
    expect(rows).toHaveLength(1);
    const present = rows[0].present;
    // Normalized to exactly the canonical element set; only strict `true` counts.
    expect(Object.keys(present).sort()).toEqual([...HF_ELEMENT_KEYS].sort());
    expect(present.useSpecification).toBe(true);
    expect(present.criticalTasks).toBe(false);
    expect(present.summativeEvaluation).toBe(false);
    expect(present.userProfiles).toBe(false); // absent → false
    expect('bogusElement' in present).toBe(false);
  });

  it('defaults an absent present to every element false', async () => {
    const created = await createHfFile(ORG, { device: 'DxAssay — RT-PCR companion diagnostic' });
    expect(Object.keys(created.present)).toHaveLength(HF_ELEMENT_KEYS.length);
    expect(Object.values(created.present).every((v) => v === false)).toBe(true);
  });

  it('rejects a missing device or a malformed presence map', async () => {
    await expect(createHfFile(ORG, { device: '' })).rejects.toBeInstanceOf(HfFileValidationError);
    await expect(createHfFile(ORG, { device: '   ' })).rejects.toBeInstanceOf(HfFileValidationError);
    await expect(createHfFile(ORG, { device: 'x', present: 'not-an-object' as unknown }))
      .rejects.toBeInstanceOf(HfFileValidationError);
    await expect(createHfFile(ORG, { device: 'x', present: ['array'] as unknown }))
      .rejects.toBeInstanceOf(HfFileValidationError);
    expect(await listHfFiles(ORG)).toEqual([]);
  });

  it('is strictly tenant-scoped and soft-delete aware', async () => {
    const mine = await createHfFile(ORG, { device: 'Mine device' });
    await createHfFile(OTHER, { device: 'Theirs device' });

    expect((await listHfFiles(ORG)).map((r) => r.device)).toEqual(['Mine device']);
    expect(await getHfFile(OTHER, mine.id)).toBeNull();          // no cross-tenant read

    expect(await deleteHfFile(ORG, mine.id)).toBe(true);
    expect(await listHfFiles(ORG)).toEqual([]);                   // soft-deleted excluded
    expect(await getHfFile(ORG, mine.id)).toBeNull();
    expect(await deleteHfFile(ORG, mine.id)).toBe(false);        // already gone
  });

  it('records the project a file is created for, and reads it back only under that project', async () => {
    const keyed = await createHfFile(ORG, { device: 'Alpha pump', programId: P_ORG });
    await createHfFile(ORG, { device: 'Beta pump', programId: P_ORG_2 });
    await createHfFile(ORG, { device: 'Unscoped pump' });
    expect(keyed.program_id).toBe(P_ORG);

    expect((await listHfFiles(ORG, { programId: P_ORG })).map((r) => r.device)).toEqual(['Alpha pump']);
    expect((await listHfFiles(ORG, { programId: P_ORG_2 })).map((r) => r.device)).toEqual(['Beta pump']);
    // Another organization's project is never read through this organization.
    expect(await listHfFiles(ORG, { programId: P_OTHER })).toEqual([]);
  });

  it('keeps a file with no project out of every project read', async () => {
    const unscoped = await createHfFile(ORG, { device: 'Unscoped pump' });
    expect(unscoped.program_id).toBeNull();
    expect(await listHfFiles(ORG, { programId: P_ORG })).toEqual([]);
    // The organization read without a project is unchanged: it still returns the file.
    expect((await listHfFiles(ORG)).map((r) => r.device)).toEqual(['Unscoped pump']);
  });

  it('refuses, at the database, a file naming another organization\'s project', async () => {
    await expect(createHfFile(ORG, { device: 'Cross pump', programId: P_OTHER })).rejects.toMatchObject({ code: '23503' });
    expect(await listHfFiles(ORG)).toEqual([]);
  });
});
