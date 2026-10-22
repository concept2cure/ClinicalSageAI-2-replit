/**
 * The consistency and guidance alert summaries say that scan history is not
 * recorded, so no alerts is not a clean result (2026-10-15).
 *
 * What the code used to do: a scan writes a row only for what it finds, and no
 * table on the deploy path records scan runs. After a scan that found nothing,
 * the summary read `lastScanAt: null` — "never scanned" — and nothing in it said
 * that a clean scan leaves no trace. With an alert on record, `lastScanAt` was
 * the newest alert's creation time, presented as the time of the last scan.
 *
 * Real DDL on PGlite: both alert migrations, and concept2cure_artifacts as the
 * base migration and the citations migration create it.
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

import { getConsistencyAlertsSummary, scanProjectConsistency } from '../cross-artifact-consistency-scanner';
import { getGuidanceAlertsSummary, scanArtifactsForGuidanceChange } from '../guidance-impact-scanner';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const run = (sql: string, p: unknown[] = []) => holder.pg.query(sql, p);
const ORG = 7;
const NOT_A_CLEAN_RESULT = /scan history is not recorded.*no alerts is not a clean result/i;

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['concept2cure_artifacts']));
  await holder.pg.exec(read('db/migrations/20260508_artifact_citations.sql'));
  await holder.pg.exec(read('db/migrations/20260508_consistency_alerts.sql'));
  await holder.pg.exec(read('db/migrations/20260508_guidance_alerts.sql'));
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(async () => {
  await holder.pg.exec(
    `DELETE FROM cross_artifact_consistency_alerts; DELETE FROM guidance_alerts; DELETE FROM concept2cure_artifacts;`,
  );
  // Two artifacts with nothing to contradict, in a section (2.5) no ICH M4S rule maps.
  await run(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, project_id, organization_id, type, category, title, content, ctd_section, citations)
     VALUES ('art_a', 1, $1, 'document', 'document', 'A', 'x', '2.5', '[]'::jsonb),
            ('art_b', 1, $1, 'document', 'document', 'B', 'y', '2.5', '[]'::jsonb)`,
    [ORG],
  );
});

describe('after a scan that found nothing', () => {
  it('the consistency summary says scan history is not recorded, not that nothing was scanned', async () => {
    expect(await scanProjectConsistency(1, ORG)).toMatchObject({ contradictionsFound: 0 });

    const s = await getConsistencyAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(false);
    expect(s.scanHistory).toEqual({ recorded: false, note: expect.stringMatching(NOT_A_CLEAN_RESULT) });
    expect(s.lastAlertAt).toBeNull();
    expect(s, 'a clean scan read as lastScanAt: null, "never scanned"').not.toHaveProperty('lastScanAt');
  });

  it('the guidance summary says scan history is not recorded, not that nothing was scanned', async () => {
    const scan = await scanArtifactsForGuidanceChange({
      guidanceCode: 'ICH M4S(R3)', prevVersion: 'R2', newVersion: 'R3', authority: 'ICH', organizationId: ORG,
    });
    expect(scan.artifactsAffected).toBe(0);

    const s = await getGuidanceAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(false);
    expect(s.scanHistory).toEqual({ recorded: false, note: expect.stringMatching(NOT_A_CLEAN_RESULT) });
    expect(s.lastAlertAt).toBeNull();
    expect(s).not.toHaveProperty('lastScanAt');
  });
});

describe('with an alert on record', () => {
  it("names the newest alert's time as an alert time, and still says scans are not recorded", async () => {
    await run(
      `INSERT INTO cross_artifact_consistency_alerts
         (organization_id, project_id, artifact_a_id, artifact_a_pk, sentence_content_hash, sentence_text,
          artifact_b_id, artifact_b_pk, severity, created_at)
       VALUES ($1, 1, 'art_a', 1, 'h1', 'A sentence.', 'art_b', 2, 'major', '2026-10-03T10:00:00Z')`,
      [ORG],
    );
    await run(
      `INSERT INTO guidance_alerts
         (organization_id, project_id, artifact_id, artifact_pk, guidance_code, guidance_authority,
          new_version, severity, affected_sections, created_at)
       VALUES ($1, 1, 'art_a', 1, 'ICH M4S(R3)', 'ICH', 'R3', 'minor', '[]'::jsonb, '2026-10-04T10:00:00Z')`,
      [ORG],
    );

    const c = await getConsistencyAlertsSummary(ORG, { projectId: 1 });
    expect(c).toMatchObject({ assessed: true, lastAlertAt: '2026-10-03T10:00:00.000Z', scanHistory: { recorded: false } });
    const g = await getGuidanceAlertsSummary(ORG, { projectId: 1 });
    expect(g).toMatchObject({ assessed: true, lastAlertAt: '2026-10-04T10:00:00.000Z', scanHistory: { recorded: false } });
  });
});
