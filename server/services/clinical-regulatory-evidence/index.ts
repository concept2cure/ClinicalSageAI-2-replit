/**
 * @fileoverview Clinical-Regulatory Intelligence Graph — public facade.
 * @module server/services/clinical-regulatory-evidence
 *
 * THE integration boundary for the shared evidence graph. Routes, AnA enrichment
 * and every v2 surface call this module; nothing calls an adapter directly. That
 * indirection is the whole point — it is what lets CSR intelligence, FDA CRL
 * intelligence and study design be *views over one spine* rather than three
 * corpora that drift apart.
 *
 * See docs/architecture/CLINICAL_REGULATORY_INTELLIGENCE_GRAPH_DISCOVERY.md.
 *
 * ── Phase status (read this before assuming a method is broken) ─────────────
 *
 * Phase 1 (this) lands the contracts, the facade and the fail-closed scoping.
 * Phases 2–5 land the adapters that give it something to read:
 *
 *   phase 2  csr-adapter.ts          projection from csr_reports/csr_details
 *   phase 4  crl/*                   official FDA CRL ingestion
 *   phase 5  retrieval-adapter.ts    typed atoms + constrained retrieval
 *
 * Until those land, every read here returns an HONEST EMPTY result: zero counts,
 * an exclusion note that says the corpus has not been ingested, and no findings.
 * That is deliberate and correct. A surface showing "no findings ingested yet" is
 * telling the truth; a surface showing sample findings would be teaching users to
 * trust fabricated regulatory evidence, which is the single worst failure mode
 * this product has. Do not "fix" these methods by seeding them.
 *
 * ── Fail-closed scoping (§14) ───────────────────────────────────────────────
 *
 * Every method takes an {@link EvidenceScope} resolved from JWT-bound request
 * context. There is no unscoped read path and no "search everything" mode.
 * Public FDA evidence is global read-only; tenant-private evidence never enters
 * another tenant's retrieval; a lesson derived from private evidence inherits
 * that privacy.
 */

import { createScopedLogger } from '../../utils/logger.js';
import { emptyCoverage } from './coverage-service';
import type {
  Assumption,
  DesignEvidencePanel,
  EvidenceScope,
  EvidenceTrace,
  FindingQuery,
  FindingSearchResult,
  RegulatoryFinding,
  RegulatoryOutcome,
  StressScenario,
} from './types';

const logger = createScopedLogger('clinical-regulatory-evidence');

/**
 * Why the corpus is empty in phase 1. Surfaced verbatim to the user through the
 * coverage strip's exclusion note — it explains the zero rather than leaving a
 * blank that reads as "nothing wrong here".
 */
const NOT_YET_INGESTED =
  'No regulatory evidence has been ingested into this corpus yet. Counts are zero because ' +
  'nothing has been scanned — not because nothing matched your filters.';

/**
 * Has the evidence corpus been ingested? False through phases 1–3; flipped by
 * phase 4 when crl/source-adapter.ts and the ingestion tables land.
 *
 * Kept as one function so there is exactly ONE place that decides whether this
 * service has data, and so the honest-empty path cannot be partially bypassed by
 * a method that forgets to check.
 */
function corpusAvailable(): boolean {
  return false;
}

/** Fail closed: a scope without an organization is an error, not a wildcard. */
function assertScoped(scope: EvidenceScope, op: string): void {
  if (!Number.isInteger(scope.organizationId) || scope.organizationId <= 0) {
    logger.error('refusing unscoped evidence read', { op });
    throw new Error('Organization context required for clinical-regulatory evidence access');
  }
}

export interface CoverageArgs {
  studyId?: string;
  designNodeId?: string;
}

/**
 * §8.1 corpus coverage for a study or design node. Reported, never inferred.
 */
export async function getCoverage(scope: EvidenceScope, _args: CoverageArgs = {}) {
  assertScoped(scope, 'getCoverage');
  if (!corpusAvailable()) return emptyCoverage(NOT_YET_INGESTED);
  // phase 5: coverage-service over the retrieval adapter's observed counts.
  return emptyCoverage(NOT_YET_INGESTED);
}

/**
 * Metadata-constrained finding search. Constraints are applied BEFORE ranking
 * (§8.1) — semantic similarity only ever reorders an already-correct candidate
 * set, it never widens it.
 *
 * Supportive and contradictory evidence are retrieved SEPARATELY and never
 * averaged into a single support score.
 */
export async function searchFindings(
  scope: EvidenceScope,
  _query: FindingQuery = {},
): Promise<FindingSearchResult> {
  assertScoped(scope, 'searchFindings');
  const coverage = await getCoverage(scope);
  if (!corpusAvailable()) {
    return {
      findings: [],
      coverage,
      insufficientEvidence: { reason: NOT_YET_INGESTED, usable: 0, total: 0 },
    };
  }
  // phase 5: retrieval-adapter.constrainedSearch(scope, query)
  return { findings: [], coverage };
}

/** One finding by id, scoped. Null when absent or not visible to this tenant. */
export async function getFinding(
  scope: EvidenceScope,
  _findingId: string,
): Promise<RegulatoryFinding | null> {
  assertScoped(scope, 'getFinding');
  return null;
}

/**
 * A verified application outcome. Returns null when no VERIFIED outcome exists —
 * which the UI renders as "Not verified", never as a blank that reads as fine and
 * never as an outcome inferred from trial status (§4.2).
 */
export async function getOutcome(
  scope: EvidenceScope,
  _applicationNumber: string,
): Promise<RegulatoryOutcome | null> {
  assertScoped(scope, 'getOutcome');
  return null;
}

/**
 * The single payload behind the Study Design evidence panel — all seven §13
 * questions answered from one read, so the panel can never show supporting
 * evidence that has loaded next to contradictions that have not.
 */
export async function getDesignEvidence(
  scope: EvidenceScope,
  designNodeId: string,
  designNodeType = 'unknown',
): Promise<DesignEvidencePanel> {
  assertScoped(scope, 'getDesignEvidence');
  return {
    designNodeId,
    designNodeType,
    comparableStudies: [],
    observations: [],
    pooled: null,
    findings: [],
    stressScenarios: [],
    assumptions: [],
    contradictions: [],
    coverage: await getCoverage(scope, { designNodeId }),
    trace: null,
  };
}

/** The evidence chain behind a recommendation. Null when the trace id is unknown. */
export async function getTrace(
  scope: EvidenceScope,
  _traceId: string,
): Promise<EvidenceTrace | null> {
  assertScoped(scope, 'getTrace');
  return null;
}

export interface StressTestInput {
  designNodeId: string;
  assumptions?: Assumption[];
}

/**
 * Run regulatory stress scenarios through the EXISTING simulator (§9.1) — this
 * service selects which scenarios matter from CRL patterns; it does not
 * re-implement simulation.
 *
 * The invariant the return shape enforces: a letter may justify WHY a scenario
 * matters, but it may not supply a NUMBER. Every scenario names its parameter
 * source, and `none` ("scenario only") is a legitimate result rather than a
 * reason to invent a value.
 */
export async function runStressTest(
  scope: EvidenceScope,
  _input: StressTestInput,
): Promise<{ scenarios: StressScenario[]; assumptions: Assumption[] }> {
  assertScoped(scope, 'runStressTest');
  if (!corpusAvailable()) return { scenarios: [], assumptions: [] };
  // phase 6: design-risk-service selects scenarios, delegates to the simulator.
  return { scenarios: [], assumptions: [] };
}

export * from './types';
export { emptyCoverage, buildCoverage, isStale } from './coverage-service';

/** Exposed for the routes' honest "corpus not ingested" messaging and for tests. */
export const CORPUS_NOT_INGESTED_REASON = NOT_YET_INGESTED;
export { corpusAvailable };
