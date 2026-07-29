/**
 * IVD lifecycle capability manifest.
 *
 * A self-documenting catalog of every IVD lifecycle engine/endpoint, with its
 * category, method, a one-line description, and behavioral flags (deterministic,
 * seeded Monte-Carlo, persistable). Complements the OpenAPI contract and powers
 * GET /api/ivd-lifecycle/capabilities so clients can discover the surface at
 * runtime.
 *
 * Pure data; kept in lockstep with the routes in server/routes/ivd-lifecycle.ts.
 */

export type CapabilityCategory =
  | 'classification'
  | 'companion-diagnostic'
  | 'analytical'
  | 'clinical'
  | 'software'
  | 'change'
  | 'manufacturing'
  | 'surveillance'
  | 'authoring'
  | 'registration'
  | 'simulation'
  | 'decision-analytics'
  | 'economics'
  | 'portfolio'
  | 'governance';

export interface Capability {
  /** HTTP path relative to /api/ivd-lifecycle. */
  path: string;
  method: 'GET' | 'POST';
  category: CapabilityCategory;
  title: string;
  description: string;
  /** Deterministic given inputs (no randomness). */
  deterministic: boolean;
  /** Uses a seeded Monte-Carlo (reproducible per seed). */
  seeded?: boolean;
  /** Result is knowledge-cited. */
  cited?: boolean;
  /** Supports opt-in persistence via save:true. */
  persistable?: boolean;
}

export const IVD_CAPABILITIES: readonly Capability[] = Object.freeze([
  // Classification & CDx
  { path: '/classify/ivdr', method: 'POST', category: 'classification', title: 'IVDR Annex VIII classification', description: 'Rule-based EU IVD class (A–D) with rule trace, NB requirement, confidence, and FDA-pathway mapping.', deterministic: true, cited: true },
  { path: '/cdx/pair', method: 'POST', category: 'companion-diagnostic', title: 'CDx pairing', description: 'Biomarker-aware drug↔Dx co-development readiness, dual FDA/EU scores, confidence.', deterministic: true, cited: true },
  { path: '/study-design', method: 'POST', category: 'clinical', title: 'Study-program designer', description: 'Analytical + clinical study plan with sample sizes, effort, and a phased timeline.', deterministic: true, cited: true },

  // Simulation
  { path: '/review-simulation', method: 'POST', category: 'simulation', title: 'Reviewer simulation', description: 'Mock FDA/NB deficiencies, readiness score, strengths, remediation roadmap.', deterministic: true, cited: true, persistable: true },
  { path: '/review-simulation/distribution', method: 'POST', category: 'simulation', title: 'Probabilistic review outcome', description: 'Monte-Carlo over evidence-completion probabilities → readiness + verdict distribution.', deterministic: false, seeded: true },
  { path: '/diagnostic-accuracy/montecarlo', method: 'POST', category: 'clinical', title: 'Diagnostic-accuracy credible intervals', description: 'Beta-posterior Monte-Carlo CIs for sensitivity/specificity/PPV/NPV from a 2×2.', deterministic: false, seeded: true },
  { path: '/risk-register/simulate', method: 'POST', category: 'simulation', title: 'Residual-risk Monte-Carlo', description: 'ISO 14971 residual-risk harm-exposure distribution and serious-event probability.', deterministic: false, seeded: true },

  // Decision analytics & economics
  { path: '/evidence/sensitivity', method: 'POST', category: 'decision-analytics', title: 'Evidence sensitivity / ROI', description: 'Tornado (by readiness impact) and ROI rankings (per week, per $100k) of missing evidence.', deterministic: true },
  { path: '/time-to-market', method: 'POST', category: 'decision-analytics', title: 'Time-to-market Monte-Carlo', description: 'Triangular per-study durations → total + per-phase week distributions (P50/P90).', deterministic: false, seeded: true },
  { path: '/decision/emv', method: 'POST', category: 'economics', title: 'Expected monetary value', description: 'EMV/NPV + break-even probability + go/no-go from value, P(success), and cost.', deterministic: true },
  { path: '/decision/go-no-go', method: 'POST', category: 'economics', title: 'Investment decision tree', description: 'Submit-now vs complete-evidence-first branches ranked by NPV with success uplift.', deterministic: true },
  { path: '/decision/evpi', method: 'POST', category: 'economics', title: 'Expected value of perfect information', description: 'Upper bound on what de-risking evidence is worth under scenario uncertainty.', deterministic: true },
  { path: '/coverage/simulate', method: 'POST', category: 'economics', title: 'Coverage / revenue model', description: 'Coverage-adjusted revenue + NPV (marketValueUsd) from volume, price, and payer mix.', deterministic: true },
  { path: '/benchmark', method: 'POST', category: 'decision-analytics', title: 'Benchmark vs norms', description: 'Readiness/timeline/cost percentiles and bands against pathway norms.', deterministic: true },

  // Orchestration & portfolio
  { path: '/program-plan', method: 'POST', category: 'simulation', title: 'Program-plan orchestrator', description: 'Chains classify→design→readiness→ROI→timeline into one executive summary.', deterministic: false, seeded: true, cited: true, persistable: true },
  { path: '/program-plan/brief', method: 'POST', category: 'authoring', title: 'Executive brief', description: 'Renders a program plan to a structured Markdown brief artifact.', deterministic: false, seeded: true, persistable: true },
  { path: '/scenarios/compare', method: 'POST', category: 'portfolio', title: 'Scenario comparison', description: 'Ranks candidate evidence plans by readiness × time × cost.', deterministic: false, seeded: true },
  { path: '/portfolio/simulate', method: 'POST', category: 'portfolio', title: 'Portfolio simulation', description: 'Rolls program profiles into readiness mix, worklist, and deficiency themes.', deterministic: true, persistable: true },
  { path: '/portfolio/batch', method: 'POST', category: 'portfolio', title: 'Batch portfolio runner', description: 'Builds full plans for many programs and aggregates a portfolio dashboard.', deterministic: false, seeded: true, persistable: true },

  // Governance
  { path: '/calibration/backtest', method: 'POST', category: 'governance', title: 'Model back-test', description: 'Validates the readiness→approval model against labeled outcomes (Brier/AUC/reliability).', deterministic: true },
  { path: '/drift/detect', method: 'POST', category: 'governance', title: 'Drift detection', description: 'Flags stale saved assessments and re-scores recomputable types when the corpus changes.', deterministic: true },
]);

export interface CapabilitiesManifest {
  count: number;
  categories: CapabilityCategory[];
  capabilities: readonly Capability[];
}

/** Return the capability manifest, optionally filtered by category. */
export function listCapabilities(category?: string): CapabilitiesManifest {
  const caps = category
    ? IVD_CAPABILITIES.filter(c => c.category === category)
    : IVD_CAPABILITIES;
  const categories = [...new Set(IVD_CAPABILITIES.map(c => c.category))];
  return { count: caps.length, categories, capabilities: caps };
}
