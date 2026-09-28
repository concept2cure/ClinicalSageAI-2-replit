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

// 2026-09-23 (W5/D7, final pass, repair): the message named the status
// route's remedy ("approved → review, then review → approved, which records
// the version approved") — false for this command, which records no version:
// a user who followed it here went round in a circle (lock refused, same
// remedy, forever). The message must name the governed act that records the
// version and say this command records none.
const NAMES_GOVERNED_APPROVE = /An approved version is recorded only by the review workflow's Approve action \(the status route's review → approved, .*authoring-actions approve-artifact\); this command records none/;
const NAMES_GOVERNED_LOCK = /A locked version is recorded only by the review workflow's Lock action \(the status route's approved → locked, or authoring-actions lock-artifact\); this command records none/;
const FALSE_REMEDIES = [
  '(approved → review, then review → approved), which records',
  'then lock it (approved → locked), which records',
  'Filing requires approval through review, which records the approved version.',
];
const expectTruthfulRemedy = (message: string, names: RegExp) => {
  expect(message).toMatch(names);
  for (const f of FALSE_REMEDIES) expect(message).not.toContain(f);
};
/** The governed approval act's write (status route review → approved). */
const governedApprove = () =>
  pglite.query("UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = version WHERE artifact_id = 1");

describe('update_artifact_status sets the status and records no approval', () => {
  it('review → approved succeeds but records no approved version, is not filable, and the message says so', async () => {
    const res = await change('approved');
    expect(res.success).toBe(true);
    const r = await row();
    expect(r.status).toBe('approved');
    expect(r.approved_version_id).toBeNull();
    expect(filable(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
    expectTruthfulRemedy(res.message, NAMES_GOVERNED_APPROVE);
  });

  it.each(['archived', 'superseded', 'rejected'])(
    '%s → approved records no approved version, is not filable, and the message says so',
    async from => {
      await pglite.query('UPDATE concept2cure_artifacts SET status = $1, version = 3 WHERE artifact_id = 1', [from]);
      const res = await change('approved');
      expect(res.success).toBe(true);
      const r = await row();
      expect(r.approved_version_id).toBeNull();
      expect(filable(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
      expectTruthfulRemedy(res.message, NAMES_GOVERNED_APPROVE);
    }
  );

  it('an artifact the governed act approved stays filable through approved → approved, and the message claims nothing', async () => {
    await governedApprove();
    const res = await change('approved');
    expect(res.success).toBe(true);
    expect(filable(await row())).toEqual({ filable: true });
    expect(res.message).not.toMatch(/cannot be filed|not filable|Filing requires|recorded only by/i);
  });

  it('approved → approved does not re-stamp the approval over an unreviewed edit', async () => {
    await governedApprove();
    await editToNextVersion();
    const res = await change('approved');
    const r = await row();
    expect(r.approved_version_id).toBe(1);
    expect(filable(r)).toMatchObject({ filable: false, reason: 'edited-after-approval' });
    expectTruthfulRemedy(res.message, NAMES_GOVERNED_APPROVE);
  });
});

describe('update_artifact_status: a lock must cover the approval, and records no lock version', () => {
  it('approved (governed, at v1) → locked succeeds, records no locked version, and says it cannot be filed yet', async () => {
    await governedApprove();
    const res = await change('locked');
    expect(res.success).toBe(true);
    const r = await row();
    expect(r.status).toBe('locked');
    expect(r.approved_version_id).toBe(1);
    expect(r.published_version_id).toBeNull();
    expect(filable(r)).toMatchObject({ filable: false, reason: 'no-approved-version' });
    expect(res.message).toMatch(/cannot be filed yet/);
    expectTruthfulRemedy(res.message, NAMES_GOVERNED_LOCK);
  });

  it('approved → locked after an unreviewed edit is REFUSED, writes nothing, and asks for re-approval', async () => {
    await governedApprove();
    await editToNextVersion();
    const before = await row();
    const res = await change('locked');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/edited after approval/i);
    expectTruthfulRemedy(res.message, NAMES_GOVERNED_APPROVE);
    expect(res.message).toMatch(
      /Lock it after that through the review workflow's Lock action \(the status route's approved → locked, or authoring-actions lock-artifact\), which records the version locked; this command records none\./
    );
    const after = await row();
    expect(after).toEqual(before);
    expect(after.status).toBe('approved');
  });

  it('approved → locked when no approved version was ever recorded is refused (fail closed)', async () => {
    await pglite.query("UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = NULL WHERE artifact_id = 1");
    const res = await change('locked');
    expect(res.success).toBe(false);
    expect((await row()).status).toBe('approved');
    expectTruthfulRemedy(res.message, NAMES_GOVERNED_APPROVE);
  });

  it('following the message through this command does not go round in a circle: every step names the governed act', async () => {
    // The skeptic's P1: approve here, lock refused, do what the refusal says
    // (approved → review, review → approved) here, lock refused again.
    const a1 = await change('approved');
    const l1 = await change('locked');
    const r2 = await change('review');
    const a2 = await change('approved');
    const l2 = await change('locked');
    expect([a1.success, l1.success, r2.success, a2.success, l2.success]).toEqual([true, false, true, true, false]);
    expect((await row()).approved_version_id).toBeNull();
    for (const m of [a1.message, l1.message, a2.message, l2.message]) expectTruthfulRemedy(m, NAMES_GOVERNED_APPROVE);
    // The governed act then records the version, and a governed lock follows.
    await change('review');
    await governedApprove();
    expect(filable(await row())).toEqual({ filable: true });
  });
});
