/**
 * Submission-intelligence tools — exposes two pure, production engines to AnA
 * that were previously reachable only through project workflows:
 *
 *   benchmark_precedent_trials -> corpus/precedent-benchmark.computeBenchmark
 *       Evidence-grounded precedent benchmarking (sample size / duration /
 *       designs / endpoints / completion rate) with honest low-N handling.
 *
 *   assess_submission_package  -> regulatory/submissionPackageBuilder.buildPackageManifest
 *       Submission completeness manifest: which required sections/artifacts are
 *       present vs missing for a submission type, given the project's current
 *       state. Resolves the expected blueprint from the in-memory registry.
 *
 * Both engines are deterministic. Package assessment reads the active project’s
 * saved canonical projection; supplied statuses are hypothetical only.
 *
 * @module server/services/ana/submissionIntelligenceTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const BENCHMARK_PRECEDENT_TRIALS: AnaTool = {
  name: 'benchmark_precedent_trials',
  description:
    "Compute an evidence-grounded benchmark from a set of comparable precedent trials for an indication + phase: the distribution of sample sizes and durations, the most common study designs and endpoints, and the empirical completion (success) rate with a 95% CI. DETERMINISTIC and HONEST about low N — distributions and the success rate report assessable:false (with a note) below their evidence thresholds rather than fabricating a confident value. Use to defend a proposed sample size / duration / design against precedent, or to set 510(k)/clinical-program expectations. Report the returned numbers verbatim, including any assessable:false notes; do not invent values the engine declined to summarize.",
  input_schema: {
    type: 'object',
    properties: {
      indication: { type: 'string', description: 'Disease/indication the precedent set is for.' },
      phase: { type: 'string', description: 'Trial phase (e.g. "Phase 3") the precedent set is for.' },
      trials: {
        type: 'array',
        description: 'The comparable precedent trials. Pass null for any field that is unknown for a trial.',
        items: {
          type: 'object',
          properties: {
            sampleSize: { type: ['number', 'null'], description: 'Number of subjects, or null if unknown.' },
            durationWeeks: { type: ['number', 'null'], description: 'Study duration in weeks, or null if unknown.' },
            studyDesign: { type: ['string', 'null'], description: 'Normalized study-design string, or null if unknown.' },
            endpoints: { type: 'array', items: { type: 'string' }, description: 'Primary/secondary endpoint measures (may be empty).' },
            outcome: { type: ['boolean', 'null'], description: 'true = completed/succeeded, false = terminated/failed, null = ongoing/unknown (excluded from the rate).' },
          },
          required: ['endpoints'],
        },
      },
      topN: { type: 'number', description: 'How many top designs/endpoints to return. Default 5.' },
    },
    required: ['indication', 'phase', 'trials'],
  },
};

export const ASSESS_SUBMISSION_PACKAGE: AnaTool = {
  name: 'assess_submission_package',
  description:
    "Assess saved package progress for the active client project and a confirmed registry filing type. Reads the organization-scoped canonical lifecycle projection and explicit filing placements; model-supplied project IDs, sections and approval statuses are ignored in project mode. Reports missing projection rows and required content awaiting review. The projection is not a full inventory: unlinked working documents may exist. No scientific, source-store, signature, dataset, technical-package or transmission readiness is certified. With no accessible active project, asks for one. Use mode hypothetical only for an explicitly requested scenario; hypothetical input can never certify a completed client package.",
  input_schema: {
    type: 'object',
    properties: {
      submissionType: { type: 'string', description: "Submission/application type or registry id (e.g. '510k', 'ind', 'nda', 'bla', 'cer')." },
      mode: { type: 'string', enum: ['project', 'hypothetical'], description: 'Default project: read saved active-project evidence. Hypothetical: explicitly requested modeled scenario only.' },
      projectId: { type: 'string', description: 'Legacy field ignored in project mode; the active project comes from authenticated context.' },
      sections: {
        type: 'array',
        description: "Hypothetical section states only; ignored in project mode.",
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Section code (matches the blueprint, e.g. "device-description").' },
            status: { type: 'string', description: 'Current status (e.g. missing, present, approved, locked, signed).' },
            documentIds: { type: 'array', items: { type: 'string' }, description: 'Document ids attached to this section.' },
          },
          required: ['code', 'status'],
        },
      },
      artifacts: {
        type: 'array',
        description: "Hypothetical artifact states only; ignored in project mode.",
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Artifact type (matches a required artifact type).' },
            status: { type: 'string', description: 'Current status.' },
            documentId: { type: 'string', description: 'Optional document id.' },
          },
          required: ['type', 'status'],
        },
      },
    },
    required: ['submissionType'],
  },
};

/** Submission-intelligence tools, spread into ALL_ANA_TOOLS. */
export const SUBMISSION_INTELLIGENCE_TOOLS: AnaTool[] = [
  BENCHMARK_PRECEDENT_TRIALS,
  ASSESS_SUBMISSION_PACKAGE,
];
