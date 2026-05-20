/**
 * Idempotent loader for the EMA CHMP question pattern library.
 */

import { emaQuestionTaxonomyService } from '../ema-question-taxonomy-service';
import { createScopedLogger } from '../../../utils/logger';
import { EMA_QUESTION_PATTERNS } from './ema-question-patterns';

const log = createScopedLogger('seed-ema-questions');

export interface SeedEmaQuestionsResult {
  inserted: string[];
  skipped: string[];
}

export async function seedEmaQuestions(
  organizationId: string,
): Promise<SeedEmaQuestionsResult> {
  const existing = await emaQuestionTaxonomyService.searchPatterns({
    organizationId,
    limit: 500,
  });
  const existingCodes = new Set(existing.map(p => p.patternCode));

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const seed of EMA_QUESTION_PATTERNS) {
    if (existingCodes.has(seed.patternCode)) {
      skipped.push(seed.patternCode);
      continue;
    }
    await emaQuestionTaxonomyService.createPattern({
      ...seed,
      organizationId,
    });
    inserted.push(seed.patternCode);
  }

  log.info('EMA question seed complete', {
    organizationId,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
  });

  return { inserted, skipped };
}
