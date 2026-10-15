/**
 * update_artifact_status must enforce the controlled-document lifecycle
 * (21 CFR Part 11 §11.10): a document cannot skip its review/approval gates.
 * The lawful forward path is draft → review → approved → locked; regressions
 * (approved → review/draft) and the explicit unlock (locked → draft) stay
 * allowed. Previously only the locked-source case was guarded, so draft → locked
 * (locking an un-reviewed, un-approved document) and draft → approved (approving
 * an un-reviewed one) were both permitted — the permissive-transition defect.
 *
 * Proven against real Postgres (PGlite) through the real handler.
 *
 * 2026-10-01 (D5): approving and locking through this command are the status
 * route's electronic signature (ana-signed-artifact-act.ts). Without one they
 * are refused before anything else is read; the signed steps, and the signed
 * illegal skips refused by the status route's own transition table, are in
 * ana-signed-artifact-act.pglite.integration.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));

import { updateArtifactStatus } from '../command-executor';

let pglite: import('@electric-sql/pglite').PGlite;
const ctx = (organizationId: number) => ({ userId: 1, organizationId }) as never;

beforeEach(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE concept2cure_artifacts (
      id SERIAL PRIMARY KEY,
      artifact_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      title TEXT,
      status TEXT,
      ctd_section TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      approved_version_id INTEGER,
      published_version_id INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, status, ctd_section)
      VALUES (1, 1, 1, 'Drug Substance Spec', 'draft', '3.2.S');
  `);
  h.pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await pglite.query(text, params);
      const rows = r.rows as unknown[];
      const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
      return { rows, rowCount: rows.length > 0 ? rows.length : affected };
    },
  };
});

afterEach(async () => {
  await pglite?.close();
});

async function setStatus(status: string): Promise<void> {
  await pglite.query('UPDATE concept2cure_artifacts SET status = $1 WHERE artifact_id = 1', [status]);
}
async function statusOf(): Promise<string | undefined> {
  const r = await pglite.query<{ status: string }>('SELECT status FROM concept2cure_artifacts WHERE artifact_id = 1');
  return r.rows[0]?.status;
}
const change = (to: 'draft' | 'review' | 'approved' | 'locked', org = 1) =>
  updateArtifactStatus(ctx(org), { projectId: 1, artifactId: 1, status: to });

describe('update_artifact_status — lawful lifecycle steps are allowed', () => {
  it('draft → review', async () => {
    await setStatus('draft');
    expect((await change('review')).success).toBe(true);
    expect(await statusOf()).toBe('review');
  });
  it('review → approved needs an electronic signature: unsigned, refused and unchanged', async () => {
    await setStatus('review');
    const res = await change('approved');
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(await statusOf()).toBe('review');
  });
  it('approved → locked needs an electronic signature: unsigned, refused and unchanged', async () => {
    await setStatus('approved');
    await pglite.query('UPDATE concept2cure_artifacts SET approved_version_id = version WHERE artifact_id = 1');
    const res = await change('locked');
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(await statusOf()).toBe('approved');
  });
  it('locked → draft (explicit unlock)', async () => {
    await setStatus('locked');
    expect((await change('draft')).success).toBe(true);
    expect(await statusOf()).toBe('draft');
  });
});

describe('update_artifact_status — illegal skips are blocked (Part 11)', () => {
  it('draft → locked is refused and does not mutate the row', async () => {
    await setStatus('draft');
    const res = await change('locked');
    expect(res.success).toBe(false);
    expect(await statusOf()).toBe('draft');
  });
  it('review → locked is refused', async () => {
    await setStatus('review');
    const res = await change('locked');
    expect(res.success).toBe(false);
    expect(await statusOf()).toBe('review');
  });
  it('draft → approved is refused (must be reviewed first)', async () => {
    await setStatus('draft');
    const res = await change('approved');
    expect(res.success).toBe(false);
    expect(await statusOf()).toBe('draft');
  });
  it('locked → approved is refused (unlock to draft only)', async () => {
    await setStatus('locked');
    const res = await change('approved');
    expect(res.success).toBe(false);
    expect(await statusOf()).toBe('locked');
  });
});

describe('update_artifact_status — tenant isolation', () => {
  it('another org cannot transition this org\'s artifact', async () => {
    await setStatus('draft');
    const res = await change('review', 2);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
    expect(await statusOf()).toBe('draft');
  });
});
