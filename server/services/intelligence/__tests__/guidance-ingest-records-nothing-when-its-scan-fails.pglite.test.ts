/**
 * A guidance ingest records nothing when its impact scan fails, and a guidance
 * scan covers one organization (2026-10-15).
 *
 * What the code used to do:
 *  - ingestGuidanceUpdate committed the new version to the shared
 *    guidance_reference_index, then scanned. When the scan failed the version
 *    stayed recorded, so every later ingest of that version answered
 *    changed: false and scanned nothing: no alert was ever raised for the
 *    change, and nothing said so.
 *  - scanArtifactsForGuidanceChange and ingestGuidanceUpdate took the
 *    organization as optional. Without one, the scan read every organization's
 *    artifacts and wrote an alert into each.
 *
 * Real DDL on PGlite: concept2cure_artifacts as the base and citations
 * migrations create it, and the guidance migration.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../../db/runtime.js', async () => {
  const { pglitePool } = await import('../../ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { getPool: () => pool };
});

import { ingestGuidanceUpdate, scanArtifactsForGuidanceChange } from '../guidance-impact-scanner';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const run = (sql: string, p: unknown[] = []) => holder.pg.query(sql, p);
const CODE = 'ICH M4S(R3)';
const UPDATE = { guidanceCode: CODE, authority: 'ICH' as const, newVersion: 'R3', organizationId: 7 };

async function withoutTable(table: string, fn: () => Promise<void>) {
  await run(`ALTER TABLE ${table} RENAME TO ${table}_hidden`);
  try {
    await fn();
  } finally {
    await run(`ALTER TABLE ${table}_hidden RENAME TO ${table}`);
  }
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['concept2cure_artifacts']));
  await holder.pg.exec(read('db/migrations/20260508_artifact_citations.sql'));
  await holder.pg.exec(read('db/migrations/20260508_guidance_alerts.sql'));
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(async () => {
  await holder.pg.exec(
    `DELETE FROM guidance_alerts; DELETE FROM guidance_reference_index; DELETE FROM concept2cure_artifacts;`,
  );
  // One nonclinical overview (CTD 2.4, mapped to ICH M4S) in each of two organizations.
  await run(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, ctd_section)
     VALUES ('art_7', 1, 7, 'document', 'document', 'Org 7 overview', 'x', '2.4'),
            ('art_8', 2, 8, 'document', 'document', 'Org 8 overview', 'y', '2.4')`,
  );
});

describe('ingestGuidanceUpdate', () => {
  it('leaves the version unrecorded when its scan fails, so the next ingest scans the change', async () => {
    await withoutTable('guidance_alerts', async () => {
      await expect(ingestGuidanceUpdate(UPDATE)).rejects.toMatchObject({ code: '42P01' });
    });

    const registry = await run(`SELECT current_version FROM guidance_reference_index WHERE guidance_code = $1`, [CODE]);
    expect(registry.rows, 'a version whose scan failed was recorded as ingested').toEqual([]);

    const retry = await ingestGuidanceUpdate(UPDATE);
    expect(retry.upsert.changed).toBe(true);
    expect(retry.scan).toMatchObject({ artifactsAffected: 1, alertsCreated: 1 });
  });

  it('refuses an update that names no organization, before recording anything', async () => {
    const noOrg: Partial<typeof UPDATE> = { ...UPDATE };
    delete noOrg.organizationId;
    await expect(
      ingestGuidanceUpdate(noOrg as unknown as Parameters<typeof ingestGuidanceUpdate>[0]),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect((await run(`SELECT 1 FROM guidance_reference_index`)).rows).toEqual([]);
    expect((await run(`SELECT 1 FROM guidance_alerts`)).rows).toEqual([]);
  });
});

describe('scanArtifactsForGuidanceChange', () => {
  it("reads and writes only the named organization's rows", async () => {
    const result = await scanArtifactsForGuidanceChange({
      guidanceCode: CODE, prevVersion: 'R2', newVersion: 'R3', authority: 'ICH', organizationId: 7,
    });

    expect(result).toMatchObject({ artifactsAffected: 1, alertsCreated: 1 });
    const alerts = await run(`SELECT organization_id, artifact_id FROM guidance_alerts`);
    expect(alerts.rows).toEqual([{ organization_id: 7, artifact_id: 'art_7' }]);
  });

  it('refuses a scan that names no organization, instead of scanning every one', async () => {
    const input = { guidanceCode: CODE, prevVersion: 'R2', newVersion: 'R3', authority: 'ICH' as const };
    await expect(
      scanArtifactsForGuidanceChange(input as unknown as Parameters<typeof scanArtifactsForGuidanceChange>[0]),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect((await run(`SELECT 1 FROM guidance_alerts`)).rows).toEqual([]);
  });
});
