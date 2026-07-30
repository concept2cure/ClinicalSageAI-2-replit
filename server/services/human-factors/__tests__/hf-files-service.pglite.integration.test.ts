/**
 * hf-files-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: an HFE/UE file RECORDED through the service
 * persists in the real hf_engineering_files store and reads back org-scoped, with
 * its element presence map normalized to the canonical IEC 62366-1 element set (so
 * the surface's completeness is computed against a stable denominator, never a
 * stored verdict). Also locks required-input validation, malformed-map rejection,
 * soft-delete, and strict tenant scope.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

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

const DDL = `
CREATE TABLE hf_engineering_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, device text NOT NULL,
  framework text NOT NULL DEFAULT 'IEC 62366-1', present jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
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
});
