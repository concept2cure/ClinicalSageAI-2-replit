/**
 * May a request that names a project go on? Yes when it names none, or when the
 * organization owns it. Otherwise this has already answered, in one wording for
 * every route that takes a client-supplied project id: 404 "Project not found"
 * when the organization does not own the project, 503 when the check could not
 * run. The caller then returns without reading or writing anything.
 *
 * The question itself is programInOrganization's
 * (server/services/c2c/program-access.ts); this only words the refusal. Read by
 * mdx-udi.ts, mdx-labeling.ts, human-factors.ts and mdx-engineering.ts (D3,
 * 2026-10-29). q-sub.ts gives the same answers through its service's refusal.
 */
import type { Response } from 'express';
import { pool } from '../db';
import { programInOrganization } from '../services/c2c/program-access';
import { notFoundInTenant } from './api-response';
import { isVerificationUnavailable, respondVerificationUnavailable } from './verification-outcome';

export async function admitProject(
  res: Response,
  log: Parameters<typeof respondVerificationUnavailable>[1],
  programId: string | null | undefined,
  orgId: number,
): Promise<boolean> {
  if (!programId) return true;
  try {
    if (await programInOrganization(pool, programId, orgId)) return true;
    notFoundInTenant(res, 'Project');
  } catch (err) {
    if (!isVerificationUnavailable(err)) throw err;
    respondVerificationUnavailable(res, log, 'The project ownership check', err);
  }
  return false;
}
