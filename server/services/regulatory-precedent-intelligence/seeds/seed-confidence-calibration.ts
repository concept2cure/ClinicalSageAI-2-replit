/**
 * Idempotent loader for the precedent-application + confidence
 * calibration rule library.
 */

import { confidenceCalibrationService } from '../confidence-calibration-service';
import { createScopedLogger } from '../../../utils/logger';
import { PRECEDENT_APPLICATION_RULES } from './precedent-application-rules';

const log = createScopedLogger('seed-confidence-calibration');

export interface SeedConfidenceCalibrationResult {
  inserted: string[];
  skipped: string[];
}

export async function seedConfidenceCalibration(
  organizationId: string,
): Promise<SeedConfidenceCalibrationResult> {
  const existing = await confidenceCalibrationService.searchRules({
    organizationId,
    limit: 500,
  });
  const existingCodes = new Set(existing.map(r => r.ruleCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of PRECEDENT_APPLICATION_RULES) {
    if (existingCodes.has(seed.ruleCode)) {
      skipped.push(seed.ruleCode);
      continue;
    }
    await confidenceCalibrationService.createRule({
      ...seed,
      organizationId,
    });
    inserted.push(seed.ruleCode);
  }

  log.info('Confidence calibration seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
