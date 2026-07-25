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
 *   phase 1  ✅ contracts, facade, fail-closed scoping, schema
 *   phase 2  ✅ csr-adapter.ts — projection from csr_reports/csr_details, so
 *               coverage now counts REAL rows rather than returning zero
 *   phase 4  ⬜ crl/* — official FDA CRL ingestion. Findings come from here, so
 *               `searchFindings` still returns none
 *   phase 5  ⬜ retrieval-adapter.ts — typed atoms + constrained retrieval
 *
 * Two empty states exist and must not be merged. A tenant whose CSR corpus has
 * been projected has real observations and zero findings: saying "nothing has
 * been scanned" would be false, and saying "no findings match your filters"
 * would imply FDA raised none. Both are lies of a kind a regulatory reviewer
 * would act on, so the reasons are kept distinct.
 *
 * Where a read genuinely has nothing, it returns an HONEST EMPTY result with a
 * reason. A surface showing "no findings ingested yet" tells the truth; a
 * surface showing sample findings would teach users to trust fabricated
 * regulatory evidence, which is the worst failure mode this product has. Do not
 * "fix" these methods by seeding them.
 *
 * ── Fail-closed scoping (§14) ───────────────────────────────────────────────
 *
 * Every method takes an {@link EvidenceScope} resolved from JWT-bound request
 * context. There is no unscoped read path and no "search everything" mode.
 * Public FDA evidence is global read-only; tenant-private evidence never enters
 * another tenant's retrieval; a lesson derived from private evidence inherits
 * that privacy.
 */

import { and, count, countDistinct, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

import { db } from '../../db.js';
import { clinicalEvidenceSources, studyResultObservations } from '@shared/schema';
import { createScopedLogger } from '../../utils/logger.js';
import { buildCoverage, emptyCoverage } from './coverage-service';
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
 * Why the corpus is empty. Surfaced verbatim through the coverage strip's
 * exclusion note — it explains the zero rather than leaving a blank that reads
 * as "nothing wrong here".
 */
const NOT_YET_INGESTED =
  'No regulatory evidence has been ingested into this corpus yet. Counts are zero because ' +
  'nothing has been scanned — not because nothing matched your filters.';

/**
 * Why findings specifically are empty even when CSR evidence exists.
 *
 * These two states must not be conflated. A tenant with a projected CSR corpus
 * but no ingested letters has real observations and zero findings — telling them
 * "nothing has been scanned" would be false, and telling them "no findings
 * match" would imply FDA raised none. Neither is true; the letters simply are
 * not in the system yet.
 */
const NO_LETTERS_INGESTED =
  'No FDA letters have been ingested yet, so there are no regulatory findings to search. ' +
  'CSR-derived evidence may still be present — this is a gap in the corpus, not a clean ' +
  'regulatory record.';

/**
 * Are there any ingested FDA letters? Findings come from CRL ingestion, which is
 * phase 4; CSR projection (phase 2) populates sources and observations but never
 * findings. Kept as one function so exactly one place decides.
 */
function findingsAvailable(): boolean {
  return false;
}

/**
 * Source types that could carry a clinical effect, and so belong in the
 * `eligible` denominator. A guidance document or review memo is a legitimate
 * source but can never yield an endpoint result, so counting it as eligible
 * would understate how much of the *relevant* corpus was usable.
 */
const CLINICAL_SOURCE_TYPES = ['csr', 'protocol', 'sap', 'registry', 'publication'] as const;

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
 * §8.1 corpus coverage for a study or design node. Every count is OBSERVED from
 * the graph — nothing here estimates a number it did not count.
 *
 * ── All five count the same unit: SOURCES ─────────────────────────────────
 *
 * This matters more than it looks. The denominators are read as "18 of 31
 * comparable studies carry a machine-readable effect", so mixing units makes the
 * sentence false. Counting `structured` as raw observations while `eligible`
 * counts sources produces a non-monotonic set — one CSR yielding three
 * observations reads as 3 structured out of 1 eligible — and a reader would
 * take that as three separate studies agreeing.
 *
 *   scanned     sources visible to this tenant (public + own private)
 *   eligible    of those, sources that could carry a clinical effect
 *   structured  of those, sources that yielded ≥1 extracted observation
 *   verified    of those, sources with ≥1 human-reviewed observation
 *   cited       of those, sources with ≥1 verified observation resolving to a page
 *
 * `cited` is the strictest deliberately: a number someone might put in a
 * submission has to resolve to a page. CSR projections carry no spans (the
 * source table has none), so a CSR-only corpus legitimately reports cited = 0
 * while the other four are non-zero. That is the honest picture, not a bug.
 */
export async function getCoverage(scope: EvidenceScope, args: CoverageArgs = {}) {
  assertScoped(scope, 'getCoverage');
  if (!db) return emptyCoverage(NOT_YET_INGESTED);

  try {
    // Visibility filter, applied BEFORE anything else (§8.1): public evidence is
    // global; private evidence is this tenant's only. There is no third case.
    const visible = or(
      isNull(clinicalEvidenceSources.organizationId),
      eq(clinicalEvidenceSources.organizationId, scope.organizationId),
    );

    const [scannedRow] = await db
      .select({ n: count() })
      .from(clinicalEvidenceSources)
      .where(visible);

    const [eligibleRow] = await db
      .select({ n: count() })
      .from(clinicalEvidenceSources)
      .where(and(visible, inArray(clinicalEvidenceSources.sourceType, CLINICAL_SOURCE_TYPES)));

    const obsVisible = or(
      isNull(studyResultObservations.organizationId),
      eq(studyResultObservations.organizationId, scope.organizationId),
    );

    /** Distinct SOURCES with an observation matching `extra` — never a raw row count. */
    const sourcesWithObservations = async (extra?: SQL) => {
      const [row] = await db
        .select({ n: countDistinct(studyResultObservations.sourceId) })
        .from(studyResultObservations)
        .where(extra ? and(obsVisible, extra) : obsVisible);
      return row?.n ?? 0;
    };

    const scanned = scannedRow?.n ?? 0;
    if (scanned === 0) return emptyCoverage(NOT_YET_INGESTED);

    const structured = await sourcesWithObservations();
    const verified = await sourcesWithObservations(
      eq(studyResultObservations.verification, 'source_verified'),
    );
    const cited = await sourcesWithObservations(
      and(
        eq(studyResultObservations.verification, 'source_verified'),
        isNotNull(studyResultObservations.sourcePage),
      ),
    );

    return buildCoverage({
      scanned,
      eligible: eligibleRow?.n ?? 0,
      structured,
      verified,
      cited,
      exclusionNote:
        verified < structured
          ? `${structured - verified} of ${structured} sources with structured evidence are not ` +
            'yet human-verified and are excluded from every displayed effect estimate.'
          : null,
      freshness: null,
    });
  } catch (e) {
    // Coverage that cannot be counted is not reported as zero — a zero would
    // read as "we looked and found nothing". Rethrow so the route surfaces an
    // honest error state instead.
    logger.error('coverage count failed', {
      op: 'getCoverage',
      designNodeId: args.designNodeId ?? null,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
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
  if (!findingsAvailable()) {
    return {
      findings: [],
      coverage,
      // The reason distinguishes "no letters ingested" from "nothing matched".
      // Coverage may be non-zero here — CSR projection populates observations
      // without producing a single finding.
      insufficientEvidence: {
        reason: coverage.scanned === 0 ? NOT_YET_INGESTED : NO_LETTERS_INGESTED,
        usable: 0,
        total: 0,
      },
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
  if (!findingsAvailable()) return { scenarios: [], assumptions: [] };
  // phase 6: design-risk-service selects scenarios, delegates to the simulator.
  return { scenarios: [], assumptions: [] };
}

export * from './types';
export { emptyCoverage, buildCoverage, isStale } from './coverage-service';

/** Exposed for the routes' honest "corpus not ingested" messaging and for tests. */
export const CORPUS_NOT_INGESTED_REASON = NOT_YET_INGESTED;
export const NO_LETTERS_INGESTED_REASON = NO_LETTERS_INGESTED;
export { findingsAvailable };
export { projectCsrCorpus, projectCsrToEvidence } from './csr-adapter';


/* ══════════════════════════════════════════════════════════════════════════
   Evidence-spine workstream (claude/quality-assurance-module-tegqkr), landed
   VERBATIM alongside the evidence-graph implementation above. The two models
   overlap (RegulatoryFinding / RegulatoryOutcome / StudyResultObservation are
   defined by both), so this file has duplicate identifiers and does NOT compile
   until the two are reconciled in the follow-up. Nothing is dropped by design.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clinical Regulatory Evidence — shared domain barrel.
 *
 * The source-agnostic evidence spine (§3): typed contracts + the org-scoped
 * persistence/query service over the cre_* tables. Consumers (CSR adapter,
 * studyDesignEvidenceService, CRL ingestion, AnA tools) import from here.
 *
 * @module server/services/clinical-regulatory-evidence
 */

export * from './types';
export * as evidenceSpine from './evidence-spine.service';
export { EvidenceSpineError } from './evidence-spine.service';
export * as csrAdapter from './csr-adapter.service';
export * as studyDesignEvidence from './study-design-evidence.service';
export * as crlIngestion from './crl-ingestion.service';
export * as governance from './governance';
export { INSUFFICIENT_EVIDENCE, UnsupportedClaimError } from './governance';
export * as retrievalAtoms from './retrieval-atoms.service';
export { CRE_ATOM_TYPES, CRE_ATOM_SOURCE_TYPE } from './retrieval-atoms.service';
export type { CreAtomType, AtomDraft } from './retrieval-atoms.service';
