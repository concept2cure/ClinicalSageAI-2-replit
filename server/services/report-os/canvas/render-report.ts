/**
 * @fileoverview Governed report render for the AnA canvas (no persistence).
 * @module server/services/report-os/canvas/render-report
 *
 * Produces a live, governed RenderedReport for a (typeId, scope) — reusing the
 * EXACT pipeline the /runs path uses: computeInitialRun (the orchestrator) →
 * evaluateTruthfulness → renderReport. It does NOT persist an immutable run
 * (that is what POST /runs does when the user commits); this is the live render
 * AnA narrates in the canvas. Because it goes through the same orchestrator +
 * truthfulness gate, every value is governed and traceable — a canvas render is
 * never a new number source, and it is always `partial` (never a sealed final).
 */

import { computeInitialRun } from '../orchestrator';
import { computeDomainRun, reportEngineFor, reportTypeNotComputedMessage } from '../report-engine';
import { renderReport, gapsWereEvaluated, type RenderInput } from '../render/render';
import { evaluateTruthfulness, type TruthfulnessRules } from '../truthfulness';
import { REPORT_TYPE_SEED } from '../taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../taxonomy-global';
import { PREDICTION_NOT_A_RUN, PREDICTION_REPORT_TYPES, isPredictionFamily } from '../prediction/report-types';
import type { ReportScope } from '@shared/schema/report-os';

const ALL_SEED = [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED, ...PREDICTION_REPORT_TYPES];
const SEED_BY_ID = new Map(ALL_SEED.map((t) => [t.typeId, t]));

/** Is this a known governed report type? */
export function isKnownReportType(typeId: string): boolean {
  return SEED_BY_ID.has(typeId);
}

export interface GovernedRenderResult {
  rendered: ReturnType<typeof renderReport>;
  /** A measured confidence, or null when the engine measures none (report-engine.ts). */
  confidence: number | null;
  blockers: string[];
  criticalBlockerCount: number;
}

/**
 * Render one governed report panel live. Throws if `typeId` is unknown (callers
 * gate on `isKnownReportType` first). The result carries a `disclosure`/gaps
 * section per the type's truthfulness rules and is always `partial`.
 */
export async function renderGovernedReport(
  organizationId: number,
  params: { typeId: string; scopeType: ReportScope; scopeId: string; submissionType?: string },
): Promise<GovernedRenderResult> {
  const def = SEED_BY_ID.get(params.typeId);
  if (!def) throw new Error(`Unknown report type: ${params.typeId}`);
  if (isPredictionFamily(def.family)) throw new Error(PREDICTION_NOT_A_RUN);
  /* Only a type an engine computes is rendered (report-engine.ts). The live
     render passed the type id as a registry id the orchestrator never reads,
     so every type came back as the readiness digest under its own title
     (QA 2026-10-08, j8). A document-scoped lineage trace is a stored run's
     document, not a live render. */
  const engine = reportEngineFor(params.typeId, params.scopeType);
  if (engine == null || engine === 'lineage') throw new Error(reportTypeNotComputedMessage(def.label));

  const computed =
    engine === 'domain'
      ? await computeDomainRun(params.typeId, organizationId, params.scopeType, params.scopeId)
      : await computeInitialRun(organizationId, params.scopeType, params.scopeId, {
          explicitSubmissionType: params.submissionType,
        });

  const rules = (def.truthfulnessRules ?? {}) as TruthfulnessRules;
  const truthfulness = evaluateTruthfulness(
    {
      requestedStatus: 'partial', // a live canvas render is advisory, never sealed
      confidence: computed.confidence,
      blockers: computed.blockers,
      criticalBlockers: computed.criticalBlockers,
      gapsSection: gapsWereEvaluated(computed.summary),
      // The generic renderer emits no disclosure block.
      disclosure: false,
    },
    rules,
  );

  const rendered = renderReport({
    reportTypeId: params.typeId,
    reportTypeLabel: def.label,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    providers: computed.providers as RenderInput['providers'],
    confidence: computed.confidence,
    blockers: computed.blockers,
    summary: computed.summary,
    status: truthfulness.allowedStatus,
    truthfulness,
  });

  return {
    rendered,
    confidence: computed.confidence,
    blockers: computed.blockers,
    criticalBlockerCount: computed.criticalBlockers.length,
  };
}
