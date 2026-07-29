/**
 * Calibrated PTRS (probability of technical and regulatory success) — public surface.
 *
 * Pieces:
 *   - ptrs-model    — pure: feature extraction, trainPtrs (logistic), published
 *                     cold-start prior (Hay 2014), predictPtrs scorer/blender.
 *   - ptrs-service  — IO boundary: corpus-backed training + prior derivation,
 *                     in-process model cache, honest serving.
 *
 * Replaces the hand-tuned `statistics-service.predictTrialSuccess` heuristic with
 * a trained model + honest prior, per GA_READINESS_PLAN workstream #2.
 */

export * from './ptrs-model';
export {
  PtrsService,
  CorpusLabeledTrialSource,
  ptrsService,
  MIN_TRIALS_FOR_PRIOR,
  type LabeledTrial,
  type LabeledTrialFilter,
  type LabeledTrialSource,
} from './ptrs-service';
