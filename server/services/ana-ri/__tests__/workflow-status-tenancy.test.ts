/**
 * `getWorkflowStatus` must read only the caller's own artifacts.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The function ACCEPTED `organizationId?: number` and never referenced it. Both
 * of its reads filtered on project_id alone:
 *
 *     SELECT DISTINCT type FROM concept2cure_artifacts WHERE project_id = $1 …
 *     SELECT DISTINCT ctd_section FROM concept2cure_artifacts WHERE project_id = $1 …
 *
 * `concept2cure_artifacts.organization_id` is INTEGER NOT NULL
 * (db/migrations/20260311_concept2cure_artifacts.sql:10), so the column was
 * there the whole time.
 *
 * This has a wider blast radius than the CMC block next door: context
 * enrichment calls buildWorkflowContext on every turn where a submission type
 * is known, not only behind a `/cmc` slash command. The result — which artifact
 * types exist and which CTD sections carry content — is rendered into the
 * model's prompt as this project's submission progress. Given another sponsor's
 * project id, it was theirs.
 *
 * Both reads also sit in bare `catch {}` blocks, so a failure is
 * indistinguishable from "no artifacts" — which is why an unscoped read could
 * never announce itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));
vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
}));

import { getWorkflowStatus } from '../workflow-orchestration';

const artifactReads = () =>
  poolQuery.mock.calls.filter((c: unknown[]) => String(c[0]).includes('concept2cure_artifacts'));

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('getWorkflowStatus is tenant-scoped', () => {
  it('scopes every artifact read to the caller organization', async () => {
    await getWorkflowStatus(42, 'ind', 7);

    const reads = artifactReads();
    expect(reads.length, 'no artifact read was issued, so this proves nothing').toBeGreaterThan(0);
    for (const call of reads) {
      const sql = String(call[0]);
      expect(sql, `unscoped artifact read: ${sql.replace(/\s+/g, ' ').trim()}`).toMatch(
        /organization_id\s*=\s*\$/,
      );
      expect(call[1] as unknown[]).toContain(7);
    }
  });

  it('issues no artifact read at all without an organization', async () => {
    // Fail closed, matching context-enrichment's "no organization, no memory".
    // A token with no org claim genuinely reaches this code path.
    await getWorkflowStatus(42, 'ind', undefined);
    expect(artifactReads().map((c: unknown[]) => String(c[0]))).toHaveLength(0);
  });

  it('still returns the workflow definition when the org is absent', async () => {
    // Failing closed must degrade the PROGRESS, not erase the workflow itself —
    // otherwise the fix would look like "return null for everything".
    const status = await getWorkflowStatus(42, 'ind', undefined);
    expect(status, 'the workflow registry entry was dropped along with the reads').toBeTruthy();
  });

  it('returns null for a submission type with no workflow, scoped or not', async () => {
    expect(await getWorkflowStatus(42, 'not-a-real-type', 7)).toBeNull();
  });
});
