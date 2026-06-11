/**
 * Drift detection for saved IVD assessments.
 *
 * When the knowledge corpus version changes, saved assessments may no longer
 * reflect current intelligence. This flags stale assessments (recorded under an
 * older corpus_version) and, where the assessment type is re-computable from its
 * stored inputs (e.g., reviewer simulation, IVDR classification), re-runs the
 * engine and reports the delta — so a portfolio can be proactively re-scored.
 *
 * Deterministic; the recompute reads only static corpora.
 */

import { simulateIvdReview } from './reviewer-simulation-ivd';
import { classifyIvdrAnnexVIII } from './ivdr-classification';

export interface SavedAssessmentRecord {
  id: string;
  assessment_type: string;
  inputs: unknown;
  result?: unknown;
  corpus_version?: string | null;
}

export interface DriftItem {
  id: string;
  assessmentType: string;
  storedVersion: string | null;
  stale: boolean;
  recomputed: boolean;
  /** Whether the recomputed outcome differs from what was stored. */
  changed: boolean;
  previousVerdict?: string | null;
  newVerdict?: string | null;
  readinessDelta?: number | null;
  note?: string;
}

export interface DriftReport {
  currentVersion: string;
  total: number;
  staleCount: number;
  recomputedCount: number;
  changedCount: number;
  items: DriftItem[];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Detect stale assessments and recompute where possible. */
export function detectDrift(records: SavedAssessmentRecord[], currentVersion: string): DriftReport {
  const items: DriftItem[] = records.map(rec => {
    const storedVersion = rec.corpus_version ?? null;
    const stale = storedVersion !== currentVersion;
    const base: DriftItem = {
      id: rec.id,
      assessmentType: rec.assessment_type,
      storedVersion,
      stale,
      recomputed: false,
      changed: false,
    };

    try {
      if (rec.assessment_type === 'reviewer_simulation' && rec.inputs && typeof rec.inputs === 'object') {
        const fresh = simulateIvdReview(rec.inputs as any);
        const prev = (rec.result ?? {}) as any;
        const prevVerdict = typeof prev.verdict === 'string' ? prev.verdict : null;
        const prevReadiness = num(prev.readinessScore);
        const readinessDelta = prevReadiness !== null ? fresh.readinessScore - prevReadiness : null;
        const changed = prevVerdict !== null ? prevVerdict !== fresh.verdict : (readinessDelta !== null && readinessDelta !== 0);
        return { ...base, recomputed: true, changed, previousVerdict: prevVerdict, newVerdict: fresh.verdict, readinessDelta };
      }
      if (rec.assessment_type === 'ivdr_classification' && rec.inputs && typeof rec.inputs === 'object') {
        const fresh = classifyIvdrAnnexVIII(rec.inputs as any);
        const prev = (rec.result ?? {}) as any;
        const prevClass = typeof prev.classification === 'string' ? prev.classification : null;
        const changed = prevClass !== null && prevClass !== fresh.classification;
        return { ...base, recomputed: true, changed, previousVerdict: prevClass, newVerdict: fresh.classification, note: 'classification re-evaluated' };
      }
    } catch {
      return { ...base, note: 'recompute failed (inputs not replayable)' };
    }
    return { ...base, note: 'type not auto-recomputable; flagged for manual review if stale' };
  });

  return {
    currentVersion,
    total: items.length,
    staleCount: items.filter(i => i.stale).length,
    recomputedCount: items.filter(i => i.recomputed).length,
    changedCount: items.filter(i => i.changed).length,
    items,
  };
}
