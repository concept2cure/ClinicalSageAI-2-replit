/** The assembly commit's transport cases (a lost COMMIT, access revoked after it, a transaction-local tenant), split
 * out of authoring-assembly.pglite.test.ts, whose HTTP fixture and single-connection seam they share. */
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AssemblyPlan } from '../../../shared/authoring/assembly';

interface CommitSeam { sql: string[]; commitFault: '' | 'before' | 'after' | 'revoked'; releases: unknown[]; tenantLocal: boolean }
interface CommitFixture {
  seam: CommitSeam;
  plan(extra?: Record<string, unknown>): Promise<AssemblyPlan>;
  commit(plan: Pick<AssemblyPlan, 'fingerprint'>, extra?: Record<string, unknown>): PromiseLike<Response>;
  stored(): Promise<unknown[]>;
  releaseCleanup(): Promise<void>;
}

export function registerAssemblyCommitCases(fixture: CommitFixture): void {
  describe('uncertain assembly commit transport', () => {
    it.each(['before', 'after'] as const)('discards the client without rollback/retry when the %s-COMMIT transport fails', async fault => {
      const planned = await fixture.plan();
      fixture.seam.commitFault = fault; fixture.seam.sql.length = 0;
      const response = await fixture.commit(planned);
      await fixture.releaseCleanup();
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body).not.toHaveProperty('data');
      expect(fixture.seam.sql.filter(sql => sql === 'COMMIT')).toHaveLength(1);
      expect(fixture.seam.sql).not.toContain('ROLLBACK');
      expect(fixture.seam.releases).toEqual([expect.any(Error)]);
      expect(await fixture.stored()).toHaveLength(fault === 'after' ? 3 : 1);
      const checked = await fixture.plan();
      expect(checked.rows.filter(row => row.disposition === 'append')).toHaveLength(fault === 'after' ? 0 : 2);
    });

    it('answers a confirmed build where the tenant scope is local to each transaction (RLS enforced)', async () => {
      // J3 human test, 2026-11-06: "Build document" wrote, then answered 503: the post-COMMIT re-admission read no project.
      const planned = await fixture.plan();
      fixture.seam.tenantLocal = true; fixture.seam.sql.length = 0;
      const response = await fixture.commit(planned);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.sections).toHaveLength(3);
      expect(await fixture.stored()).toHaveLength(3);
      expect(fixture.seam.sql).not.toContain('ROLLBACK');
      expect(fixture.seam.releases).toEqual([undefined]);
    });

    it('withholds private content if project access is revoked after a confirmed commit', async () => {
      const planned = await fixture.plan();
      fixture.seam.commitFault = 'revoked'; fixture.seam.sql.length = 0;
      const response = await fixture.commit(planned);
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body).not.toHaveProperty('data');
      expect(JSON.stringify(response.body)).not.toContain('Original authored text');
      expect(await fixture.stored()).toHaveLength(3);
      expect(fixture.seam.sql).not.toContain('ROLLBACK');
      expect(fixture.seam.releases).toEqual([undefined]);
    });
  });
}
