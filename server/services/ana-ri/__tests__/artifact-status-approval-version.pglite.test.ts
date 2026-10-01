/**
 * update_artifact_status (AnA) is not the approval act: it may set a status,
 * but it records no approved or locked version, so nothing it does makes an
 * artifact filable — and it says so.
 *
 * 2026-09-23 (W5/D7, final pass): product decision — only the governed
 * approval act (the status route's review → approved and authoring-actions
 * approve-artifact, which apply the role table / governed authority and the P12
 * review quorum) may make an artifact filable (artifactApproval,
 * server/services/ectd/package-content-fingerprint.ts). The residual-repair
 * rounds made this command record approved_version_id (round 2: on any arrival
 * at 'approved'; round 3: on review → approved with the quorum) and
 * published_version_id on a lock. That recorded an approval for roles the
 * status route refuses (manager, super_admin) and a lock without the route's
 * role check or attestation. Both are reverted to HEAD: the status is written,
 * no version is recorded, and the success message says, when the result is
 * not filable, why and what files it. Kept from the repair: a lock must cover
 * the approval (approved → locked over an unreviewed edit is refused).
 * Superseded: the round-2/3 cases that pinned the recording.
 * Proven against real Postgres (PGlite) through the real handler, judged by
 * the real filing rule.
 *
 * 2026-10-01 (D5) — supersedes the cases above that pinned "succeeds and records
 * nothing": approving and locking through this command are now the status
 * route's electronic signature, committed through the same act
 * (server/services/ana-ri/ana-signed-artifact-act.ts; the signed cases are in
 * ana-signed-artifact-act.pglite.integration.test.ts). What these cases pin
 * now is the other half: without a verified signature the command approves
 * and locks nothing, from every state the earlier cases started from, and
 * leaves the row as it found it. Moving to review or draft is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));

import { updateArtifactStatus } from '../command-executor';
import { artifactApproval } from '../../ectd/package-content-fingerprint';

let pglite: import('@electric-sql/pglite').PGlite;
const ctx = { userId: 42, organizationId: 1 } as never;

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
      published_at TIMESTAMP,
      locked_at TIMESTAMP,
      locked_by_id INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, status, ctd_section, version)
      VALUES (1, 1, 1, 'Drug Substance Spec', 'review', '3.2.S', 1);
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

interface Row {
  status: string;
  version: number;
  approved_version_id: number | null;
  published_version_id: number | null;
  locked_at: Date | null;
  locked_by_id: number | null;
}
async function row(): Promise<Row> {
  const r = await pglite.query<Row>(
    'SELECT status, version, approved_version_id, published_version_id, locked_at, locked_by_id FROM concept2cure_artifacts WHERE artifact_id = 1'
  );
  return r.rows[0];
}
const filable = (r: Row) =>
  artifactApproval({
    status: r.status,
    version: r.version,
    approvedVersionId: r.approved_version_id,
    publishedVersionId: r.published_version_id,
  });
/** An edit after approval, as PUT …/artifacts/:id makes it: version bumps, status stays. */
const editToNextVersion = () =>
  pglite.query('UPDATE concept2cure_artifacts SET version = version + 1 WHERE artifact_id = 1');
const change = (to: 'draft' | 'review' | 'approved' | 'locked') =>
  updateArtifactStatus(ctx, { projectId: 1, artifactId: 1, status: to });

/** The governed approval act's write (status route review → approved). */
const governedApprove = () =>
  pglite.query("UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = version WHERE artifact_id = 1");
/** Refused as needing a signature, and the row is as it was. */
async function expectUnsignedRefusal(to: 'approved' | 'locked'): Promise<void> {
  const before = await row();
  const res = await change(to);
  expect(res.success).toBe(false);
  expect((res as { error?: string }).error).toBe('PART11_SIGNATURE_REQUIRED');
  expect(await row()).toEqual(before);
}

describe('update_artifact_status approves only as an electronic signature', () => {
  it('review → approved without a signature: refused, nothing recorded', async () => {
    await expectUnsignedRefusal('approved');
    expect((await row()).status).toBe('review');
  });

  it.each(['archived', 'superseded', 'rejected'])('%s → approved without a signature: refused, nothing recorded', async from => {
    await pglite.query('UPDATE concept2cure_artifacts SET status = $1, version = 3 WHERE artifact_id = 1', [from]);
    await expectUnsignedRefusal('approved');
  });

  it('an artifact the governed act approved stays filable, and an unsigned approved → approved changes nothing', async () => {
    await governedApprove();
    await expectUnsignedRefusal('approved');
    expect(filable(await row())).toEqual({ filable: true });
  });

  it('approved → approved after an unreviewed edit does not re-stamp the approval', async () => {
    await governedApprove();
    await editToNextVersion();
    await expectUnsignedRefusal('approved');
    const r = await row();
    expect(r.approved_version_id).toBe(1);
    expect(filable(r)).toMatchObject({ filable: false, reason: 'edited-after-approval' });
  });
});

describe('update_artifact_status locks only as an electronic signature', () => {
  it('approved (governed, at v1) → locked without a signature: refused, not locked, no locked version', async () => {
    await governedApprove();
    await expectUnsignedRefusal('locked');
    const r = await row();
    expect(r.status).toBe('approved');
    expect(r.published_version_id).toBeNull();
  });

  it('approved → locked after an unreviewed edit: refused, nothing written', async () => {
    await governedApprove();
    await editToNextVersion();
    await expectUnsignedRefusal('locked');
  });

  it('approved with no approved version recorded → locked: refused (fail closed)', async () => {
    await pglite.query("UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = NULL WHERE artifact_id = 1");
    await expectUnsignedRefusal('locked');
  });

  it('review and back are unchanged: the moves that are not signatures still run', async () => {
    await governedApprove();
    const r1 = await change('review');
    expect(r1.success).toBe(true);
    const back = await row();
    expect(back.status).toBe('review');
    // Leaving approved clears the recorded version (the trigger in production;
    // this table has none, so the column is as the earlier write left it).
    const d1 = await change('draft');
    expect(d1.success).toBe(true);
    expect((await row()).status).toBe('draft');
  });
});
