/**
 * Regression guard: a pharmacovigilance READ must fail closed when the database
 * is unreachable, never render the outage as "no data on file."
 *
 * server/db/runtime.ts leaves `pool === null` for the life of a running process
 * when DATABASE_URL is unset or the Pool constructor throws at boot. The pre-fix
 * reads returned `[]` in that case — identical to a legitimately-empty result —
 * so a database outage was published as a clean safety all-clear:
 *   • GET /overview          → { overdueReports: 0, pendingSignals: 0, complianceRate: 100 }
 *   • GET /board             → "no disproportionality signal"
 *   • GET /compliance-matrix → every region "compliant", 0 overdue
 *   • build_sae_line_listing → a "built" SAE listing with 0 serious/fatal cases,
 *                              fed straight into the DSUR / IND annual report.
 * All four route/tool callers already fail closed on a THROWN read; the reads
 * just weren't throwing. Pins "fix(pv): fail closed when the safety DB is
 * unreachable instead of rendering an outage as zero events".
 */
import { describe, it, expect, vi } from 'vitest';

// Simulate a live DB outage: the pool never initialised (pool === null).
vi.mock('../../../db', () => ({ pool: null }));

import {
  getAdverseEvents,
  getOverdueReports,
  getUpcomingReports,
  getPendingSignals,
  getRMPsForProject,
  PvDatabaseUnavailableError,
} from '../pharmacovigilanceService';

describe('pharmacovigilanceService — safety reads fail closed on DB outage', () => {
  const reads: Array<[string, () => Promise<unknown>]> = [
    ['getAdverseEvents', () => getAdverseEvents('org-1')],
    ['getOverdueReports', () => getOverdueReports('org-1')],
    ['getUpcomingReports', () => getUpcomingReports('org-1')],
    ['getPendingSignals', () => getPendingSignals('org-1')],
    ['getRMPsForProject', () => getRMPsForProject('proj-1')],
  ];

  for (const [name, call] of reads) {
    it(`${name} throws (not [] ) when the pool is unavailable`, async () => {
      // The pre-fix bug: these resolved to [] — a DB outage indistinguishable
      // from "queried and found nothing." A safety read must reject instead.
      await expect(call()).rejects.toBeInstanceOf(PvDatabaseUnavailableError);
      await expect(call()).rejects.toMatchObject({ code: 'PV_DATABASE_UNAVAILABLE' });
    });
  }
});
