/**
 * Render-target-agnostic report document model for Report-OS.
 *
 * These types describe a structured, provenance-linked report independent of
 * any output surface (HTML, PDF, JSON API). They carry no DB or IO concerns.
 */

import type { ReportRunStatus, TruthfulnessEvaluation } from '../truthfulness';

/**
 * A pointer back to the source data a rendered value was derived from.
 */
export interface ProvenanceRef {
  sourceTable: string;
  sourceField?: string;
  recordId?: string | number;
  transformation?: string;
  confidence?: number;
  auditId?: string;
}

/**
 * A single renderable block. Discriminated on `kind`.
 */
export type ReportBlock =
  | { kind: 'summary'; text: string }
  | { kind: 'narrative'; text: string; aiGenerated: true; disclosure: string }
  | {
      kind: 'metric';
      label: string;
      value: number | string | null;
      unit?: string;
      status?: 'ready' | 'partial' | 'missing';
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'table';
      columns: string[];
      rows: Array<Array<string | number | null>>;
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'chart';
      chartType:
        | 'readiness_ring'
        | 'bar'
        | 'trend'
        | 'stacked_bar'
        | 'forecast_band'
        | 'calibration';
      spec: Record<string, unknown>;
      provenance?: ProvenanceRef[];
    }
  | {
      kind: 'gap-list';
      items: Array<{
        title: string;
        severity?: 'critical' | 'high' | 'medium' | 'low';
        message?: string;
      }>;
    }
  | { kind: 'blocker-list'; items: string[] }
  | { kind: 'disclosure'; method: string; confidence?: number; validated: boolean; note: string };

/**
 * An ordered group of blocks under a titled heading.
 */
export interface ReportSection {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

/**
 * The full rendered report document.
 */
export interface RenderedReport {
  reportTypeId: string;
  scopeType: string;
  scopeId: string;
  /** The scope by name (a project's name or code), stored at run creation.
   *  Absent on runs created before it was stored. */
  scopeLabel?: string;
  /** Actual data boundary, separate from the context used to open the report. */
  computedScope?: string;
  /** Stored calculation inputs/results, kept with the sealed document. */
  provenance?: Record<string, unknown>;
  generatedAt: string;
  status: ReportRunStatus;
  sections: ReportSection[];
  truthfulness?: TruthfulnessEvaluation;
}
