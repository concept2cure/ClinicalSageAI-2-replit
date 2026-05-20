/**
 * Idempotent loader for the seven nonclinical RTF trigger patterns.
 * Skips patterns whose `patternCode` is already present for the given
 * organization so re-runs do not duplicate rows.
 */

import { rtfTriggerService } from '../rtf-trigger-service';
import { createScopedLogger } from '../../../utils/logger';
import { NONCLINICAL_RTF_PATTERNS } from './nonclinical-rtf-patterns';

const log = createScopedLogger('seed-nonclinical-rtf');

export interface SeedNonclinicalRtfResult {
  inserted: string[];
  skipped: string[];
}

export async function seedNonclinicalRtf(
  organizationId: string,
): Promise<SeedNonclinicalRtfResult> {
  const existing = await rtfTriggerService.searchPatterns({
    organizationId,
    category: 'nonclinical_data',
    limit: 100,
  });
  const existingCodes = new Set(existing.map(p => p.patternCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of NONCLINICAL_RTF_PATTERNS) {
    if (existingCodes.has(seed.patternCode)) {
      skipped.push(seed.patternCode);
      continue;
    }
    await rtfTriggerService.createPattern({
      ...seed,
      organizationId,
    });
    inserted.push(seed.patternCode);
  }

  log.info('Nonclinical RTF seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
