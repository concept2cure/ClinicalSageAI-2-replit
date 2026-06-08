/**
 * SLM-backed content classifier (seam + safe fallback).
 *
 * Higher-recall PHI/PII/regulatory classification is a job for a small,
 * fine-tuned classification model (1–3B) served on the self-hosted / local
 * lane — cheap, fast, and shippable into an air-gapped install alongside the
 * rest of the stack. Training that model is an ML task (data + GPU) tracked in
 * scripts/ml/; this class is the runtime seam it plugs into.
 *
 * Until a model is wired (AI_CLASSIFIER_SLM_URL unset), classify() delegates to
 * the deterministic HeuristicContentClassifier so the governance layer always
 * has a working classifier and never silently degrades to "no classification".
 *
 * @module server/services/ai-governance/classification/slm-classifier
 */

import {
  type ClassificationResult,
  type ContentClassifier,
} from './types';
import { HeuristicContentClassifier } from './heuristic-classifier';
import { createScopedLogger } from '../../../utils/logger.js';

const log = createScopedLogger('ai-governance:classification');

export class SlmContentClassifier implements ContentClassifier {
  readonly method = 'slm' as const;
  private fallback = new HeuristicContentClassifier();
  private endpoint?: string;
  private warned = false;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.AI_CLASSIFIER_SLM_URL;
  }

  async classify(text: string): Promise<ClassificationResult> {
    if (!this.endpoint) {
      if (!this.warned) {
        log.warn(
          '[AI Governance] AI_CLASSIFIER_SLM_URL unset — content classification ' +
            'is using the heuristic baseline. Train + serve the SLM (see scripts/ml/) ' +
            'for higher recall.',
        );
        this.warned = true;
      }
      // Heuristic result, but stamp method so callers can see the SLM path was
      // requested and fell back.
      const result = await this.fallback.classify(text);
      return { ...result, method: 'heuristic' };
    }

    // Deepen: POST {text} to the SLM endpoint, map its label scores into a
    // ClassificationResult, and reconcile with the heuristic (take the union so
    // structured-identifier precision is never lost). Until then, fall back.
    const result = await this.fallback.classify(text);
    return { ...result, method: 'heuristic' };
  }
}
