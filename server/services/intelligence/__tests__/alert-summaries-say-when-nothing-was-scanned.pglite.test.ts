/**
 * The consistency and guidance alert stores say when nothing was scanned, and
 * a store that cannot be read is an error (2026-10-15, finding 7).
 *
 * What the code used to do:
 *  - getConsistencyAlertsSummary / getGuidanceAlertsSummary returned a zeroed
 *    summary ("0 open, 0 critical") both when no scan had ever run and when
 *    the alert table did not exist (42P01 → the empty summary). Nothing in the
 *    summary told those apart from "scanned, nothing open", so the readiness
 *    aggregator scored both stores 100.
 *  - The summaries were organisation-wide only, and `bySeverity` counted
 *    resolved alerts, so a project was charged for other projects' alerts and
 *    for alerts already resolved.
 *  - The list and transition reads turned a missing table into "no alerts" /
 *    "not found"; the scans turned an unreadable artifacts table into "0
 *    contradictions found" and swallowed alert inserts that failed.
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

import {
  getConsistencyAlertsSummary,
  listConsistencyAlerts,
  acknowledgeConsistencyAlert,
  scanProjectConsistency,
} from '../cross-artifact-consistency-scanner';
import {
  getGuidanceAlertsSummary,
  listGuidanceAlerts,
  resolveGuidanceAlert,
  scanArtifactsForGuidanceChange,
} from '../guidance-impact-scanner';

const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const ORG = 7;
const run = (sql: string, p: unknown[] = []) => holder.pg.query(sql, p);

/** Rename a table away for the body of `fn`, and always put it back. */
async function withoutTable(table: string, fn: () => Promise<void>) {
  await run(`ALTER TABLE ${table} RENAME TO ${table}_hidden`);
  try {
    await fn();
  } finally {
    await run(`ALTER TABLE ${table}_hidden RENAME TO ${table}`);
  }
}

async function consistencyAlert(projectId: number, severity: string, status: string, createdAt: string, n: number) {
  await run(
    `INSERT INTO cross_artifact_consistency_alerts
       (organization_id, project_id, artifact_a_id, artifact_a_pk, sentence_content_hash, sentence_text,
        artifact_b_id, artifact_b_pk, severity, status, created_at)
     VALUES ($1, $2, $3, 1, $4, 'A sentence.', 'artifact_b', 2, $5, $6, $7)`,
    [ORG, projectId, `artifact_a_${n}`, `hash_${n}`, severity, status, createdAt],
  );
}

async function guidanceAlert(projectId: number, severity: string, status: string, createdAt: string, n: number) {
  await run(
    `INSERT INTO guidance_alerts
       (organization_id, project_id, artifact_id, artifact_pk, guidance_code, guidance_authority,
        new_version, severity, affected_sections, status, created_at)
     VALUES ($1, $2, $3, 1, 'ICH M4S(R3)', 'ICH', 'R3', $4, '[]'::jsonb, $5, $6)`,
    [ORG, projectId, `artifact_${n}`, severity, status, createdAt],
  );
}

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
});

describe('the consistency alert summary', () => {
  it('says nothing was assessed when no scan result is on record', async () => {
    const s = await getConsistencyAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(false);
    expect(s.lastAlertAt).toBeNull();
  });

  it('is an error, not a zeroed summary, when the alert table does not exist', async () => {
    await withoutTable('cross_artifact_consistency_alerts', async () => {
      await expect(getConsistencyAlertsSummary(ORG)).rejects.toMatchObject({ code: '42P01' });
      await expect(listConsistencyAlerts({ organizationId: ORG, projectId: 1 })).rejects.toMatchObject({
        code: '42P01',
      });
      await expect(
        acknowledgeConsistencyAlert('00000000-0000-4000-8000-000000000000', ORG, 3),
      ).rejects.toMatchObject({ code: '42P01' });
    });
  });

  it("is the project's own: its newest alert's time, and only its open alerts by severity", async () => {
    await consistencyAlert(1, 'critical', 'resolved', '2026-10-01T10:00:00Z', 1);
    await consistencyAlert(1, 'major', 'open', '2026-10-03T10:00:00Z', 2);
    await consistencyAlert(2, 'critical', 'open', '2026-10-05T10:00:00Z', 3);

    const s = await getConsistencyAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(true);
    expect(s.lastAlertAt).toBe('2026-10-03T10:00:00.000Z');
    expect(s.openBySeverity).toEqual({ critical: 0, major: 1, minor: 0, info: 0 });
    expect(s.openCritical).toBe(0);
    expect(s.totalOpen).toBe(1);
    expect(s.topArtifacts.map(a => a.artifactId)).toEqual(['artifact_a_2']);

    // Organisation-wide, the other project's open critical alert is counted.
    const org = await getConsistencyAlertsSummary(ORG);
    expect(org.openCritical).toBe(1);
    expect(org.lastAlertAt).toBe('2026-10-05T10:00:00.000Z');
  });
});

describe('the guidance alert summary', () => {
  it('says nothing was assessed when no scan result is on record', async () => {
    const s = await getGuidanceAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(false);
    expect(s.lastAlertAt).toBeNull();
  });

  it('is an error, not a zeroed summary, when the alert table does not exist', async () => {
    await withoutTable('guidance_alerts', async () => {
      await expect(getGuidanceAlertsSummary(ORG)).rejects.toMatchObject({ code: '42P01' });
      await expect(listGuidanceAlerts({ organizationId: ORG, projectId: 1 })).rejects.toMatchObject({
        code: '42P01',
      });
      await expect(
        resolveGuidanceAlert('00000000-0000-4000-8000-000000000000', ORG, 3),
      ).rejects.toMatchObject({ code: '42P01' });
    });
  });

  it("is the project's own: its newest alert's time, and only its open alerts by severity", async () => {
    await guidanceAlert(1, 'critical', 'resolved', '2026-10-01T10:00:00Z', 1);
    await guidanceAlert(1, 'minor', 'acknowledged', '2026-10-02T10:00:00Z', 2);
    await guidanceAlert(2, 'critical', 'open', '2026-10-06T10:00:00Z', 3);

    const s = await getGuidanceAlertsSummary(ORG, { projectId: 1 });
    expect(s.assessed).toBe(true);
    expect(s.lastAlertAt).toBe('2026-10-02T10:00:00.000Z');
    expect(s.openBySeverity).toEqual({ critical: 0, major: 0, minor: 1, info: 0 });
    expect(s.openCritical).toBe(0);
    expect(s.totalOpen).toBe(1);
    expect(s.topAffectedArtifacts.map(a => a.artifactId)).toEqual(['artifact_2']);
  });
});

describe('a scan that cannot read or write says so', () => {
  async function seedContradiction() {
    const cites = (target: string) =>
      JSON.stringify([
        {
          sentenceIndex: 0,
          paragraphIndex: 0,
          text: 'The NOAEL was 50 mg/kg/day.',
          contentHash: 'h1',
          status: 'contradicted',
          sources: [{ artifactId: target, relationship: 'contradicts', passageSnippet: 'NOAEL 10 mg/kg/day' }],
        },
      ]);
    await run(
      `INSERT INTO concept2cure_artifacts
         (artifact_id, project_id, organization_id, type, category, title, content, ctd_section, citations)
       VALUES ('art_a', 1, $1, 'document', 'document', 'A', 'x', '2.4', $2::jsonb),
              ('art_b', 1, $1, 'document', 'document', 'B', 'y', '2.4', '[]'::jsonb)`,
      [ORG, cites('art_b')],
    );
  }

  it('the consistency scan does not report 0 contradictions from an artifacts table it could not read', async () => {
    await withoutTable('concept2cure_artifacts', async () => {
      await expect(scanProjectConsistency(1, ORG)).rejects.toMatchObject({ code: '42P01' });
    });
  });

  it('the consistency scan fails when an alert it found could not be stored', async () => {
    await seedContradiction();
    await withoutTable('cross_artifact_consistency_alerts', async () => {
      await expect(scanProjectConsistency(1, ORG)).rejects.toMatchObject({ code: '42P01' });
    });
    // With the store present, the same scan records the alert.
    const ok = await scanProjectConsistency(1, ORG);
    expect(ok).toMatchObject({ contradictionsFound: 1, alertsCreated: 1 });
  });

  it('the guidance scan does not report 0 affected artifacts from a table it could not read', async () => {
    const input = { guidanceCode: 'ICH M4S(R3)', prevVersion: 'R2', newVersion: 'R3', authority: 'ICH' as const, organizationId: ORG };
    await withoutTable('concept2cure_artifacts', async () => {
      await expect(scanArtifactsForGuidanceChange(input)).rejects.toMatchObject({ code: '42P01' });
    });
  });

  it('the guidance scan fails when an alert it found could not be stored', async () => {
    await seedContradiction();
    const input = { guidanceCode: 'ICH M4S(R3)', prevVersion: 'R2', newVersion: 'R3', authority: 'ICH' as const, organizationId: ORG };
    await withoutTable('guidance_alerts', async () => {
      await expect(scanArtifactsForGuidanceChange(input)).rejects.toMatchObject({ code: '42P01' });
    });
    const ok = await scanArtifactsForGuidanceChange(input);
    expect(ok).toMatchObject({ artifactsAffected: 2, alertsCreated: 2 });
  });
});
