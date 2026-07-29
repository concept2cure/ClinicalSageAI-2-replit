/**
 * AnA Reporting Tool Specifications — Insights layer.
 *
 * Self-contained tool specs + pure argument validators that let the assistant
 * drive the Report-OS "Insights" surface conversationally. Each tool is a
 * `ToolSpec` ({ name, description, schema }) paired with a zod schema for
 * deterministic argument validation.
 *
 * Design notes for reviewers (RA/CRO context):
 * - AnA is a narrator and explainer over governed report outputs. It never
 *   originates a metric, score, or probability; those values come only from
 *   deterministic Report-OS providers and explicitly disclosed models. See
 *   {@link ANA_REPORTING_GUARDRAIL}.
 * - These definitions are intentionally *not* wired into the live tool
 *   executor. They provide the contract (specs), the input gate (validators),
 *   and a pure intent router for a later integration step.
 * - No DB access, no IO. Pure and unit-testable.
 */

import { z } from 'zod';
import { reportScopeEnum, type ReportScope } from '@shared/schema/report-os';

/**
 * Governing guardrail for every AnA reporting interaction. Surfaced in the
 * descriptions of the generative tools so the model is reminded — at the point
 * of tool selection — that it explains numbers but never invents them.
 */
export const ANA_REPORTING_GUARDRAIL =
  'AnA narrates and explains report outputs; it never originates a metric, score, or probability — ' +
  'those come only from deterministic providers and disclosed models.';

/**
 * The shape every reporting tool exposes to the assistant's tool layer.
 * Intentionally minimal: a stable name, a reviewer-grade natural-language
 * description, and the zod schema used to validate arguments.
 */
export interface ToolSpec {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared field schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Report scope enum, derived from the canonical Report-OS scope list. */
const scopeSchema = z.enum(reportScopeEnum as unknown as [ReportScope, ...ReportScope[]]);

/** An ISO-8601 "as of" instant used for point-in-time / snapshot reporting. */
const asOfSchema = z
  .string()
  .min(1, 'asOf must be a non-empty ISO-8601 timestamp')
  .describe('Optional point-in-time anchor (ISO-8601) for snapshot/as-of reporting');

const scopeIdSchema = z.string().min(1, 'scopeId is required');

// ─────────────────────────────────────────────────────────────────────────────
// Tool argument schemas
// ─────────────────────────────────────────────────────────────────────────────

export const listReportTypesSchema = z
  .object({
    scope: scopeSchema,
    persona: z.string().min(1).optional(),
    clientSegment: z.string().min(1).optional(),
  })
  .strict();

export const generateReportSchema = z
  .object({
    scope: scopeSchema,
    scopeId: scopeIdSchema,
    reportTypeId: z.string().min(1, 'reportTypeId is required'),
    asOf: asOfSchema.optional(),
  })
  .strict();

export const explainBlockersSchema = z
  .object({
    runId: z.number().int().positive('runId must be a positive integer'),
  })
  .strict();

export const portfolioReadinessSchema = z
  .object({
    programGroupId: z.number().int().positive('programGroupId must be a positive integer'),
    asOf: asOfSchema.optional(),
  })
  .strict();

export const regionalGapAnalysisSchema = z
  .object({
    scopeId: scopeIdSchema,
    market: z.string().min(1, 'market is required (e.g. FDA, EMA, PMDA)'),
  })
  .strict();

export const compareRegionsSchema = z
  .object({
    scopeId: scopeIdSchema,
    markets: z
      .array(z.string().min(1))
      .min(2, 'compare_regions requires at least two markets')
      .describe('Target markets to compare, e.g. ["FDA", "EMA", "PMDA"]'),
  })
  .strict();

export const predictionModelEnum = z.enum([
  'deficiency_risk',
  'readiness_trajectory',
  'trial_pos',
]);

export const getPredictionSchema = z
  .object({
    scope: scopeSchema,
    scopeId: scopeIdSchema,
    model: predictionModelEnum,
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// Tool specifications
// ─────────────────────────────────────────────────────────────────────────────

const LIST_REPORT_TYPES: ToolSpec = {
  name: 'list_report_types',
  description:
    'List the report types available for a given scope and persona, filtered by what the org is ' +
    'entitled to. Use this before generating anything so the user is only offered governed report ' +
    'types their scope (account, program, project, study, submission, document), role, and client ' +
    'segment actually permit.',
  schema: listReportTypesSchema,
};

const GENERATE_REPORT: ToolSpec = {
  name: 'generate_report',
  description:
    'Generate (run) a governed report at a scope. Returns confidence, blockers, and a ' +
    'provenance-linked body. Never fabricates numbers: ' +
    ANA_REPORTING_GUARDRAIL +
    ' Every metric traces back to a deterministic provider, and the run is gated by the ' +
    'truthfulness rules before it can be promoted toward final.',
  schema: generateReportSchema,
};

const EXPLAIN_BLOCKERS: ToolSpec = {
  name: 'explain_blockers',
  description:
    'Explain, in regulatory terms, why a report run is blocked from final and what evidence would ' +
    'clear each blocker. Translates dependency/provider blockers into reviewer-grade narrative — ' +
    'which missing artifact, unresolved gap, or stale data dependency is holding the run, and the ' +
    'concrete remediation that would unblock it.',
  schema: explainBlockersSchema,
};

const PORTFOLIO_READINESS: ToolSpec = {
  name: 'portfolio_readiness',
  description:
    'Summarize submission readiness, risk, and timeline across a program group (portfolio/board ' +
    'view). Aggregates per-program readiness, surfaces the critical-path risks and slipping ' +
    'milestones, and frames the portfolio for an executive or steering-committee audience.',
  schema: portfolioReadinessSchema,
};

const REGIONAL_GAP_ANALYSIS: ToolSpec = {
  name: 'regional_gap_analysis',
  description:
    "Identify the dossier/section/artifact gaps for a target market (e.g. FDA, EMA, PMDA, Health " +
    "Canada, MHRA, TGA, NMPA, MFDS) against that market's submission standard. Maps the current " +
    'evidence and CTD/eCTD structure to the regional requirement set and reports each missing or ' +
    'deficient section with its severity and the standard it fails.',
  schema: regionalGapAnalysisSchema,
};

const COMPARE_REGIONS: ToolSpec = {
  name: 'compare_regions',
  description:
    'Compare submission readiness and requirement deltas across multiple markets for one program ' +
    '(global harmonization view). Highlights where regional requirements diverge, which artifacts ' +
    'are reusable across markets, and which region-specific gaps drive the sequencing of a ' +
    'multi-region filing strategy.',
  schema: compareRegionsSchema,
};

const GET_PREDICTION: ToolSpec = {
  name: 'get_prediction',
  description:
    'Return a prediction report with mandatory method/validation disclosure. Predictions are ' +
    'advisory, never a regulatory guarantee. ' +
    ANA_REPORTING_GUARDRAIL +
    ' The disclosed model (deficiency_risk, readiness_trajectory, or trial_pos), its validation ' +
    'status, and its confidence are always presented alongside the result so reviewers can weigh ' +
    'the estimate appropriately.',
  schema: getPredictionSchema,
};

/** All reporting tool specs, in stable presentation order. */
export const REPORT_TOOL_SPECS: ToolSpec[] = [
  LIST_REPORT_TYPES,
  GENERATE_REPORT,
  EXPLAIN_BLOCKERS,
  PORTFOLIO_READINESS,
  REGIONAL_GAP_ANALYSIS,
  COMPARE_REGIONS,
  GET_PREDICTION,
];

/** String union of every reporting tool name. */
export type ReportToolName =
  | 'list_report_types'
  | 'generate_report'
  | 'explain_blockers'
  | 'portfolio_readiness'
  | 'regional_gap_analysis'
  | 'compare_regions'
  | 'get_prediction';

// ─────────────────────────────────────────────────────────────────────────────
// Lookup, validation, and intent routing (all pure)
// ─────────────────────────────────────────────────────────────────────────────

const SPEC_BY_NAME: ReadonlyMap<string, ToolSpec> = new Map(
  REPORT_TOOL_SPECS.map(spec => [spec.name, spec]),
);

/**
 * Resolve a tool spec by name. Returns `undefined` for unknown names so callers
 * can fail closed rather than throwing.
 */
export function getToolSpec(name: string): ToolSpec | undefined {
  return SPEC_BY_NAME.get(name);
}

export type ValidateToolArgsResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: string[] };

/**
 * Validate raw arguments for a named reporting tool.
 *
 * Looks up the spec, runs `schema.safeParse`, and returns either the parsed
 * value or a flattened list of human-readable errors. Unknown tool names fail
 * with an error rather than throwing.
 */
export function validateToolArgs(
  name: ReportToolName,
  args: unknown,
): ValidateToolArgsResult {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) {
    return { ok: false, errors: [`Unknown reporting tool: ${String(name)}`] };
  }

  const parsed = spec.schema.safeParse(args);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const flattened = parsed.error.flatten();
  const errors: string[] = [
    ...flattened.formErrors,
    ...Object.entries(flattened.fieldErrors).flatMap(([field, messages]) =>
      (messages ?? []).map(message => `${field}: ${message}`),
    ),
  ];

  return {
    ok: false,
    errors: errors.length > 0 ? errors : ['Invalid arguments'],
  };
}

export type IntentRouteResult =
  | { matched: true; name: ReportToolName; spec: ToolSpec }
  | { matched: false; candidates: ReportToolName[] };

/**
 * Pure intent router: map a free-text user utterance to the most likely
 * reporting tool. Deterministic and dependency-free — it scores each tool on
 * keyword overlap and returns the single best match, or the ranked candidate
 * list when nothing clears the bar. Intended for routing hints, not as a
 * substitute for the model's own tool selection.
 */
export function routeIntent(utterance: string): IntentRouteResult {
  const text = (utterance ?? '').toLowerCase();
  const tokens = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));

  const keywords: Record<ReportToolName, string[]> = {
    list_report_types: ['list', 'available', 'types', 'options', 'which', 'reports'],
    generate_report: ['generate', 'run', 'create', 'produce', 'build', 'report'],
    explain_blockers: ['blocker', 'blocked', 'why', 'explain', 'stuck', 'final'],
    portfolio_readiness: ['portfolio', 'board', 'program', 'group', 'across', 'executive'],
    regional_gap_analysis: ['gap', 'gaps', 'market', 'region', 'fda', 'ema', 'pmda', 'missing'],
    compare_regions: ['compare', 'comparison', 'versus', 'harmonization', 'markets', 'delta'],
    get_prediction: ['predict', 'prediction', 'forecast', 'risk', 'trajectory', 'likelihood'],
  };

  const scored = (Object.keys(keywords) as ReportToolName[])
    .map(name => ({
      name,
      score: keywords[name].reduce((acc, kw) => acc + (tokens.has(kw) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score > 0 && (scored[1]?.score ?? 0) < best.score) {
    const spec = SPEC_BY_NAME.get(best.name)!;
    return { matched: true, name: best.name, spec };
  }

  return {
    matched: false,
    candidates: scored.filter(s => s.score > 0).map(s => s.name),
  };
}
