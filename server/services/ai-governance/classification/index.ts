/**
 * Content classification — public surface.
 *
 * getContentClassifier() returns the configured classifier:
 *   AI_CLASSIFIER_MODE=heuristic (default) → HeuristicContentClassifier
 *   AI_CLASSIFIER_MODE=slm                 → SlmContentClassifier (falls back to
 *                                            heuristic until a model is served)
 *
 * @module server/services/ai-governance/classification
 */

import type { ContentClassifier } from './types';
import { HeuristicContentClassifier } from './heuristic-classifier';
import { SlmContentClassifier } from './slm-classifier';

export * from './types';
export { HeuristicContentClassifier } from './heuristic-classifier';
export { SlmContentClassifier } from './slm-classifier';

let cached: ContentClassifier | null = null;

export function resolveContentClassifier(): ContentClassifier {
  const mode = (process.env.AI_CLASSIFIER_MODE || 'heuristic').toLowerCase();
  if (mode === 'slm') return new SlmContentClassifier();
  return new HeuristicContentClassifier();
}

export function getContentClassifier(): ContentClassifier {
  if (!cached) cached = resolveContentClassifier();
  return cached;
}

export function resetContentClassifier(): void {
  cached = null;
}
