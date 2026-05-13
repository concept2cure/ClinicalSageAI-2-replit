/**
 * Idempotent loader for the CMC RTF trigger pattern library. Skips
 * patterns whose `patternCode` is already present for the given
 * organization so re-runs do not duplicate rows.
 */

import { rtfTriggerService } from '../rtf-trigger-service';
import { createScopedLogger } from '../../../utils/logger';
import { CMC_RTF_PATTERNS } from './cmc-rtf-patterns';

const log = createScopedLogger('seed-cmc-rtf');

export interface SeedCmcRtfResult {
  inserted: string[];
  skipped: string[];
}

export async function seedCmcRtf(
  organizationId: string,
): Promise<SeedCmcRtfResult> {
  const existing = await rtfTriggerService.searchPatterns({
    organizationId,
    category: 'cmc_data',
    limit: 200,
  });
  const existingCodes = new Set(existing.map(p => p.patternCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of CMC_RTF_PATTERNS) {
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

  log.info('CMC RTF seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
