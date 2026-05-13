/**
 * Idempotent loader for the CRL trigger pattern library. Skips patterns whose
 * `patternCode` is already present for the given organization so re-runs do
 * not duplicate rows.
 */

import { crlTriggerService } from '../crl-trigger-service';
import { createScopedLogger } from '../../../utils/logger';
import { CRL_TRIGGER_PATTERNS } from './crl-trigger-patterns';

const log = createScopedLogger('seed-crl-triggers');

export interface SeedCrlTriggersResult {
  inserted: string[];
  skipped: string[];
}

export async function seedCrlTriggers(
  organizationId: string,
): Promise<SeedCrlTriggersResult> {
  const existing = await crlTriggerService.searchPatterns({
    organizationId,
    limit: 500,
  });
  const existingCodes = new Set(existing.map(p => p.patternCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of CRL_TRIGGER_PATTERNS) {
    if (existingCodes.has(seed.patternCode)) {
      skipped.push(seed.patternCode);
      continue;
    }
    await crlTriggerService.createPattern({
      ...seed,
      organizationId,
    });
    inserted.push(seed.patternCode);
  }

  log.info('CRL trigger seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
