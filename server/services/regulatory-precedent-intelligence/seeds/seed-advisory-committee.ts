/**
 * Idempotent loader for the FDA Advisory Committee risk pattern library.
 * Skips patterns whose `patternCode` is already present for the given
 * organization so re-runs do not duplicate rows.
 */

import { advisoryCommitteeService } from '../advisory-committee-service';
import { createScopedLogger } from '../../../utils/logger';
import { ADVISORY_COMMITTEE_PATTERNS } from './advisory-committee-patterns';

const log = createScopedLogger('seed-advisory-committee');

export interface SeedAdvisoryCommitteeResult {
  inserted: string[];
  skipped: string[];
}

export async function seedAdvisoryCommittee(
  organizationId: string,
): Promise<SeedAdvisoryCommitteeResult> {
  const existing = await advisoryCommitteeService.searchPatterns({
    organizationId,
    limit: 500,
  });
  const existingCodes = new Set(existing.map(p => p.patternCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of ADVISORY_COMMITTEE_PATTERNS) {
    if (existingCodes.has(seed.patternCode)) {
      skipped.push(seed.patternCode);
      continue;
    }
    await advisoryCommitteeService.createPattern({
      ...seed,
      organizationId,
    });
    inserted.push(seed.patternCode);
  }

  log.info('Advisory committee seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
