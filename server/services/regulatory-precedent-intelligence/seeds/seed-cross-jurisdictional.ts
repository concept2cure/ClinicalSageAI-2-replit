/**
 * Idempotent loader for the cross-jurisdictional framework library.
 */

import { crossJurisdictionalService } from '../cross-jurisdictional-service';
import { createScopedLogger } from '../../../utils/logger';
import { CROSS_JURISDICTIONAL_FRAMEWORKS } from './cross-jurisdictional-frameworks';

const log = createScopedLogger('seed-cross-jurisdictional');

export interface SeedCrossJurisdictionalResult {
  inserted: string[];
  skipped: string[];
}

export async function seedCrossJurisdictional(
  organizationId: string,
): Promise<SeedCrossJurisdictionalResult> {
  const existing = await crossJurisdictionalService.searchFrameworks({
    organizationId,
    limit: 500,
  });
  const existingCodes = new Set(existing.map(f => f.frameworkCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of CROSS_JURISDICTIONAL_FRAMEWORKS) {
    if (existingCodes.has(seed.frameworkCode)) {
      skipped.push(seed.frameworkCode);
      continue;
    }
    await crossJurisdictionalService.createFramework({
      ...seed,
      organizationId,
    });
    inserted.push(seed.frameworkCode);
  }

  log.info('Cross-jurisdictional seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
