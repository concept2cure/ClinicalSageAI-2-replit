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
 * ── ONE spine (the reconciliation this file used to promise) ────────────────
 *
 * Until 2026-07-27 this facade read a PARALLEL table lineage
 * (clinical_evidence_sources + seven siblings, UUID-keyed, drizzle) while the
 * platform's real data flows — CRL ingestion, CSR projection, chat-upload
 * source identity, citations — all wrote the cre_* spine
 * (db/migrations/20260724_clinical_regulatory_evidence_spine.sql). The split
 * had a concrete casualty: the CRL Library surface read findings through this
 * facade, whose `searchFindings` was a hardcoded empty stub over tables no
 * durable path ever created — so an ingested CRL could never reach the surface
 * built to show it. A note at the bottom of this file said the two models would
 * "be reconciled in the follow-up". This is the follow-up: every read here now
 * goes through evidence-spine.service to the cre_* tables, the duplicate
 * lineage is dropped (see 20260727_drop_clinical_evidence_duplicate_lineage),
 * and the resolved domain contracts (`Resolved*` in types.ts) are served by
 * adapting spine rows — never by a second store.
 *
 * ── Honest empties (unchanged, now load-bearing) ────────────────────────────
 *
 * Two empty states exist and must not be merged. A tenant whose CSR corpus has
 * been projected has real sources and zero findings: saying "nothing has been
 * scanned" would be false, and saying "no findings match your filters" would
 * imply FDA raised none. Where a read genuinely has nothing, it returns an
 * HONEST EMPTY result with a reason. Do not "fix" these methods by seeding them.
 *
 * ── Fail-closed scoping (§14) ───────────────────────────────────────────────
 *
 * Every method takes an {@link EvidenceScope} resolved from JWT-bound request
 * context. There is no unscoped read path and no "search everything" mode.
 * Public FDA evidence is global read-only; tenant-private evidence never enters
 * another tenant's retrieval.
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { buildCoverage, emptyCoverage } from './coverage-service';
import {
  getFindingById, getSource, listFindings, listOutcomes, listRelationshipsFor,
} from './evidence-spine.service';
import { simulateDesignWithRegulatoryStress } from './study-design-evidence.service';
import type { EntityType } from './types';
import type {
  Assumption,
  DesignEvidencePanel,
  Discipline,
  EvidenceScope,
  EvidenceTrace,
  EvidenceVisibility,
  FindingDomain,
  FindingQuery,
  FindingSearchResult,
  FindingSeverity,
  EvidenceMapping,
  RegulatoryFinding,
  RegulatoryOutcomeKind,
  ResolvedRegulatoryFinding,
  ResolvedRegulatoryOutcome,
  EvidenceSource,
  SourceRef,
  StressScenario,
  VerificationState,
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
 * Why findings specifically are empty even when CSR evidence exists. The two
 * states must not be conflated: a tenant with a projected CSR corpus but no
 * ingested letters has real sources and zero findings.
 */
const NO_LETTERS_INGESTED =
  'No FDA letters have been ingested yet, so there are no regulatory findings to search. ' +
  'CSR-derived evidence may still be present — this is a gap in the corpus, not a clean ' +
  'regulatory record.';

/**
 * Source types that could carry a clinical effect, and so belong in the
 * `eligible` denominator. Uses the SPINE vocabulary
 * (types.ts SOURCE_TYPES — 'trial_registry', not the retired lineage's
 * 'registry'). A CRL or review memo is a legitimate source but can never yield
 * an endpoint result, so counting it as eligible would understate how much of
 * the *relevant* corpus was usable.
 */
const CLINICAL_SOURCE_TYPES = ['csr', 'protocol', 'sap', 'trial_registry', 'publication'] as const;

/** Fail closed: a scope without an organization is an error, not a wildcard. */
function assertScoped(scope: EvidenceScope, op: string): void {
  if (!Number.isInteger(scope.organizationId) || scope.organizationId <= 0) {
    logger.error('refusing unscoped evidence read', { op });
    throw new Error('Organization context required for clinical-regulatory evidence access');
  }
}

/** The spine's visibility rule, verbatim: public rows (org NULL) plus own org. */
const VISIBLE = '(organization_id IS NULL OR organization_id = $1)';

export interface CoverageArgs {
  studyId?: string;
  designNodeId?: string;
}

/**
 * Are there any ingested FDA letters visible to this tenant? Findings come from
 * CRL ingestion (writes cre_regulatory_findings); CSR projection populates
 * sources but never findings. One function so exactly one place decides.
 */
async function findingsAvailable(scope: EvidenceScope): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM cre_regulatory_findings WHERE ${VISIBLE} AND deleted_at IS NULL LIMIT 1`,
    [scope.organizationId],
  );
  return rows.length > 0;
}

/**
 * §8.1 corpus coverage. Every count is OBSERVED from the cre_* spine — nothing
 * here estimates a number it did not count.
 *
 * ── All five count the same unit: SOURCES ─────────────────────────────────
 *
 *   scanned     sources visible to this tenant (public + own private)
 *   eligible    of those, source types that could carry a clinical effect
 *   structured  of those, sources whose text was actually extracted
 *               (extraction_status extracted | reconciled | verified)
 *   verified    of those, sources whose extraction is human-verified
 *   cited       of those, sources with ≥1 finding resolving to a page AND a
 *               verbatim excerpt
 *
 * `structured` deliberately means EXTRACTED TEXT, not endpoint observations:
 * the spine has no observation store yet (§5.3 is unbuilt), and counting a
 * table that does not exist was the retired lineage's failure mode. When the
 * observation store lands, `structured`/`verified` tighten to observation-
 * bearing sources — the ladder's meaning is documented here precisely so that
 * change is visible, not silent. `cited` is the strictest deliberately: a
 * number someone might put in a submission has to resolve to a page.
 */
export async function getCoverage(scope: EvidenceScope, args: CoverageArgs = {}) {
  assertScoped(scope, 'getCoverage');
  if (!pool) return emptyCoverage(NOT_YET_INGESTED);

  try {
    const org = scope.organizationId;
    const clinical = `source_type IN (${CLINICAL_SOURCE_TYPES.map(t => `'${t}'`).join(',')})`;

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                                        AS scanned,
         COUNT(*) FILTER (WHERE ${clinical})                             AS eligible,
         COUNT(*) FILTER (WHERE ${clinical}
           AND extraction_status IN ('extracted','reconciled','verified')) AS structured,
         COUNT(*) FILTER (WHERE ${clinical}
           AND extraction_status = 'verified')                           AS verified,
         COUNT(*) FILTER (WHERE ${clinical}
           AND extraction_status = 'verified'
           AND EXISTS (
             SELECT 1 FROM cre_regulatory_findings f
              WHERE f.source_id = cre_evidence_sources.id
                AND (f.organization_id IS NULL OR f.organization_id = $1)
                AND f.deleted_at IS NULL
                AND f.source_page IS NOT NULL
                AND f.source_excerpt IS NOT NULL))                        AS cited,
         MAX(updated_at)                                                 AS freshness
       FROM cre_evidence_sources
       WHERE ${VISIBLE} AND deleted_at IS NULL`,
      [org],
    );

    const r = rows[0] as Record<string, unknown>;
    const scanned = Number(r.scanned) || 0;
    if (scanned === 0) return emptyCoverage(NOT_YET_INGESTED);

    const structured = Number(r.structured) || 0;
    const verified = Number(r.verified) || 0;

    return buildCoverage({
      scanned,
      eligible: Number(r.eligible) || 0,
      structured,
      verified,
      cited: Number(r.cited) || 0,
      exclusionNote:
        verified < structured
          ? `${structured - verified} of ${structured} sources with extracted evidence are not ` +
            'yet human-verified and are excluded from every displayed effect estimate.'
          : null,
      freshness: r.freshness ? new Date(r.freshness as string).toISOString() : null,
    });
  } catch (e) {
    // A spine that is not provisioned is an objectively empty corpus — say so
    // with its reason. Any OTHER failure rethrows: coverage that cannot be
    // counted must not be reported as zero, because a zero reads as "we looked
    // and found nothing".
    if ((e as { code?: string })?.code === '42P01') return emptyCoverage(NOT_YET_INGESTED);
    logger.error('coverage count failed', {
      op: 'getCoverage',
      designNodeId: args.designNodeId ?? null,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

// ─── Spine-row → resolved-contract adaptation ────────────────────────────────

/** Free-form ingestion severity → the display vocabulary. Recognized values map
 *  1:1 (plus the common major/minor synonyms); anything else lands mid-band
 *  rather than silently dropping the finding — the verbatim text is still what
 *  renders, so no wording is invented. */
function normalizeSeverity(raw: string | null): FindingSeverity {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'major') return 'high';
  if (s === 'low' || s === 'minor') return 'low';
  return 'medium';
}

/** Spine verification → display state. `disputed` renders as unreviewed AND
 *  sets `conflict`, which blocks the finding from retrieval-derived claims —
 *  the same posture the §6.1 conflict rule demands. */
function toVerificationState(status: string): VerificationState {
  return status === 'verified' ? 'source_verified' : 'extracted_unreviewed';
}

const DISCIPLINE_SET = new Set<Discipline>([
  'clinical', 'statistical', 'safety', 'clinical_pharmacology', 'cmc',
  'microbiology', 'device', 'labeling', 'facility', 'administrative',
]);

/** Common CRL review-discipline phrasings → the canonical Discipline enum. */
const DISCIPLINE_SYNONYMS: Record<string, Discipline> = {
  biostatistics: 'statistical', statistics: 'statistical', biometrics: 'statistical',
  pharmacovigilance: 'safety', pv: 'safety', clinical_safety: 'safety',
  clinpharm: 'clinical_pharmacology', pharmacology: 'clinical_pharmacology',
  clinical_pharmacology_and_biopharmaceutics: 'clinical_pharmacology',
  chemistry: 'cmc', chemistry_manufacturing_and_controls: 'cmc', product_quality: 'cmc', quality: 'cmc',
  labelling: 'labeling',
  facilities: 'facility', inspection: 'facility', bimo: 'facility',
  regulatory_project_management: 'administrative', rpm: 'administrative', project_management: 'administrative',
};

/** finding_domain is a normalized enum; map the ones with a clean discipline. */
const FINDING_DOMAIN_TO_DISCIPLINE: Record<FindingDomain, Discipline> = {
  clinical: 'clinical',
  biostatistics: 'statistical',
  clinical_pharmacology: 'clinical_pharmacology',
  cmc: 'cmc',
  safety: 'safety',
  labeling: 'labeling',
  facility: 'facility',
  nonclinical: 'administrative', // no nonclinical Discipline member — bucket as unclassified
  other: 'administrative',
};

/**
 * Resolve a finding's review discipline HONESTLY. The stored fdaReviewDiscipline
 * is free text; it was previously cast straight to Discipline (so an unrecognized
 * value became an invalid enum) and, when null, defaulted to 'clinical' — a
 * fabricated attribution. This validates the raw value, then falls back to a
 * mapping from the normalized finding_domain, then to 'administrative' as the
 * explicit "not stated / not derivable" bucket. It never invents 'clinical'.
 */
function normalizeDiscipline(raw: string | null, domain: FindingDomain | null): Discipline {
  if (raw) {
    const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (DISCIPLINE_SET.has(key as Discipline)) return key as Discipline;
    if (DISCIPLINE_SYNONYMS[key]) return DISCIPLINE_SYNONYMS[key];
  }
  if (domain && FINDING_DOMAIN_TO_DISCIPLINE[domain]) return FINDING_DOMAIN_TO_DISCIPLINE[domain];
  return 'administrative';
}

/**
 * Map a source's storage visibility to the DTO's EvidenceVisibility WITHOUT
 * collapsing project_private into tenant_private (the previous behavior widened
 * how private a project-scoped source appeared). Global-public sources carry a
 * NULL org, so they resolve to 'public' regardless of class.
 */
function toVisibility(src: EvidenceSource | null): EvidenceVisibility {
  if (src == null || src.organizationId == null) return 'public';
  switch (src.visibilityClass) {
    case 'project_private':
      return 'project_private';
    case 'global_public':
      return 'public';
    case 'tenant_private':
    default:
      return 'tenant_private';
  }
}

function toSourceRef(src: EvidenceSource | null, finding: RegulatoryFinding): SourceRef {
  // `cre_evidence_sources.version` is TEXT and holds the label the DOCUMENT
  // declares ("3", "3.2", "2b"); SourceRef.version is a number. The conversion
  // used to be a bare `parseInt`, which silently reports a "3.2" document as
  // version 3 — a number in a provenance field that is not the document's
  // version and that a reader cannot tell apart from one that is. Anything the
  // number cannot carry losslessly is reported as not recorded, which is the
  // honest answer; the label itself stays readable on the source row.
  //
  // The narrowness is the point rather than the goal: SourceRef.version should
  // be a string, matching the column. Widening it is a DTO change that reaches
  // the client fixtures, so it is left as its own step.
  const raw = src?.version != null ? String(src.version).trim() : '';
  const version = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : NaN;
  return {
    sourceId: String(finding.sourceId),
    applicationType: src?.applicationType ?? '',
    applicationNumber: src?.applicationNumber ?? finding.applicationIdentifier ?? '',
    letterDate: src?.documentDate ?? null,
    page: finding.sourcePage,
    locator: null,
    // Verbatim excerpt or nothing — a paraphrase attributed to a regulator
    // would be a fabrication (SourceRef contract).
    excerpt: finding.sourceExcerpt,
    officialUrl: src?.officialUrl ?? null,
    checksum: src?.checksum ?? null,
    version: Number.isFinite(version) ? version : null,
    visibility: toVisibility(src),
  };
}

function toResolvedFinding(f: RegulatoryFinding, src: EvidenceSource | null): ResolvedRegulatoryFinding {
  const mappings: EvidenceMapping[] = [];
  const status = f.explicitOrInferred;
  if (f.affectedCtdSection) mappings.push({ kind: 'ctd', value: f.affectedCtdSection, status });
  if (f.affectedIchE3Section) mappings.push({ kind: 'ich_e3', value: f.affectedIchE3Section, status });
  if (f.affectedStudyDesignFeature) {
    mappings.push({ kind: 'design_node', value: f.affectedStudyDesignFeature, status });
  }
  if (f.findingCategory) mappings.push({ kind: 'deficiency', value: f.findingCategory, status });

  return {
    findingId: String(f.id),
    severity: normalizeSeverity(f.severity),
    discipline: normalizeDiscipline(f.fdaReviewDiscipline, f.findingDomain),
    category: f.findingCategory ?? f.findingDomain ?? 'uncategorized',
    finding: f.normalizedSummary ?? f.findingText ?? '',
    requestedAction: f.requestedAction,
    // Derived from structure, never guessed: a finding tied to studies applies
    // to a study; otherwise it applies at application level.
    applicability: f.relatedStudyIds.length > 0 ? 'study' : 'application',
    epistemicStatus: f.explicitOrInferred,
    verification: toVerificationState(f.verificationStatus),
    reviewedAt: f.verificationStatus === 'verified' ? f.updatedAt : null,
    conflict: f.verificationStatus === 'disputed',
    mappings,
    source: toSourceRef(src, f),
  };
}

/** Sources for a set of findings, one read per distinct id, as a map. */
async function sourcesFor(orgId: number, findings: RegulatoryFinding[]) {
  const map = new Map<number, EvidenceSource | null>();
  for (const id of new Set(findings.map(f => f.sourceId))) {
    map.set(id, await getSource(orgId, id));
  }
  return map;
}

// ─── Findings ────────────────────────────────────────────────────────────────

/** Constraints the spine cannot evaluate yet. §8.1 says constraints narrow the
 *  candidate set BEFORE ranking — silently ignoring one would widen results,
 *  which is the exact failure the section forbids. So an unsupported constraint
 *  fails closed with its reason instead of pretending to have been applied. */
const UNSUPPORTED_QUERY_KEYS = ['modality', 'endpointClass', 'control', 'designNode'] as const;

/**
 * Metadata-constrained finding search over the cre_* spine. Constraints are
 * applied before any ranking; supportive and contradictory evidence are never
 * averaged into a single score.
 *
 * This was a hardcoded empty stub while findings lived behind the retired
 * lineage. It is now the real read that lets an ingested CRL reach the CRL
 * Library surface.
 */
export async function searchFindings(
  scope: EvidenceScope,
  query: FindingQuery = {},
): Promise<FindingSearchResult> {
  assertScoped(scope, 'searchFindings');
  const coverage = await getCoverage(scope);

  const unsupported = UNSUPPORTED_QUERY_KEYS.filter(k => query[k] != null && query[k] !== '');
  if (unsupported.length > 0) {
    return {
      findings: [],
      coverage,
      insufficientEvidence: {
        reason:
          `The corpus index cannot evaluate the constraint${unsupported.length > 1 ? 's' : ''} ` +
          `${unsupported.join(', ')} yet. Results are withheld rather than returned with a ` +
          'constraint silently ignored.',
        usable: 0,
        total: 0,
      },
    };
  }

  let rows: RegulatoryFinding[];
  try {
    rows = await listFindings(scope.organizationId, { limit: query.limit });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') rows = [];
    else throw e;
  }

  if (rows.length === 0) {
    return {
      findings: [],
      coverage,
      insufficientEvidence: {
        reason: coverage.scanned === 0 ? NOT_YET_INGESTED : NO_LETTERS_INGESTED,
        usable: 0,
        total: 0,
      },
    };
  }

  const sources = await sourcesFor(scope.organizationId, rows);
  const lc = (v: string | null | undefined) => (v ?? '').toLowerCase();

  const matched = rows.filter(f => {
    const src = sources.get(f.sourceId) ?? null;
    // Filter on the SAME normalized discipline the DTO exposes, so a discipline
    // filter matches what the row actually displays as (not the raw free text).
    if (query.discipline && normalizeDiscipline(f.fdaReviewDiscipline, f.findingDomain) !== query.discipline) {
      return false;
    }
    if (query.category && lc(f.findingCategory) !== lc(query.category)) return false;
    if (query.ctdSection && !(f.affectedCtdSection ?? '').startsWith(query.ctdSection)) return false;
    if (query.ichE3Section && !(f.affectedIchE3Section ?? '').startsWith(query.ichE3Section)) return false;
    if (query.applicationType && lc(src?.applicationType) !== lc(query.applicationType)) return false;
    if (query.indication && lc(src?.indication) !== lc(query.indication)) return false;
    if (query.phase && lc(src?.phase) !== lc(query.phase)) return false;
    if (query.verification) {
      if (toVerificationState(f.verificationStatus) !== query.verification) return false;
    }
    if (query.text) {
      const t = lc(query.text);
      if (!lc(f.findingText).includes(t) && !lc(f.normalizedSummary).includes(t)) return false;
    }
    return true;
  });

  // Empty-with-filters is a DIFFERENT truth from empty-corpus: letters exist,
  // nothing matched. No insufficientEvidence envelope — the zero is the answer.
  return {
    findings: matched.map(f => toResolvedFinding(f, sources.get(f.sourceId) ?? null)),
    coverage,
  };
}

/** One finding by id, scoped. Null when absent or not visible to this tenant. */
export async function getFinding(
  scope: EvidenceScope,
  findingId: string,
): Promise<ResolvedRegulatoryFinding | null> {
  assertScoped(scope, 'getFinding');
  const id = Number.parseInt(findingId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const row = await getFindingById(scope.organizationId, id);
    if (!row) return null;
    return toResolvedFinding(row, await getSource(scope.organizationId, row.sourceId));
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return null;
    throw e;
  }
}

/**
 * A verified application outcome. Returns null when no VERIFIED outcome exists —
 * which the UI renders as "Not verified", never as a blank that reads as fine
 * and never as an outcome inferred from trial status (§4.2).
 */
export async function getOutcome(
  scope: EvidenceScope,
  applicationNumber: string,
): Promise<ResolvedRegulatoryOutcome | null> {
  assertScoped(scope, 'getOutcome');
  if (!applicationNumber) return null;

  let outcomes;
  try {
    outcomes = await listOutcomes(scope.organizationId, { applicationIdentifier: applicationNumber });
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return null;
    throw e;
  }

  const verified = outcomes.find(o => o.verificationStatus === 'verified');
  if (!verified) return null;

  // Only outcome types the resolved vocabulary can express are returned. A
  // verified 'information_request' (etc.) is real but not representable here;
  // translating it to the nearest kind would assert an outcome that did not
  // happen, so it is withheld with a log line rather than approximated.
  const KINDS: RegulatoryOutcomeKind[] = ['crl', 'resubmission', 'approval', 'withdrawal', 'unresolved'];
  if (!KINDS.includes(verified.outcomeType as RegulatoryOutcomeKind)) {
    logger.warn('verified outcome not expressible in resolved vocabulary', {
      applicationNumber,
      outcomeType: verified.outcomeType,
    });
    return null;
  }

  const src = verified.sourceId != null
    ? await getSource(scope.organizationId, verified.sourceId)
    : null;

  return {
    applicationType: src?.applicationType ?? '',
    applicationNumber,
    letterDate: verified.outcomeDate,
    outcome: verified.outcomeType as RegulatoryOutcomeKind,
    resubmissionState: null,
    // Study linkage is not modeled on outcomes yet; null is the honest answer,
    // and an inferred link would need its own epistemic label anyway.
    studyLink: null,
    verifiedAt: verified.updatedAt ?? null,
  };
}

// ─── Design evidence, traces, stress tests ───────────────────────────────────

/** Human labels for the regulatory-stress scenarios the evidence layer selects. */
const STRESS_LABELS: Record<string, string> = {
  reduced_treatment_effect: 'Reduced treatment effect',
  higher_dropout: 'Higher dropout',
  missing_not_at_random: 'Missing not at random',
  subgroup_heterogeneity: 'Subgroup heterogeneity',
  site_variability: 'Site / regional variability',
  endpoint_misclassification: 'Endpoint misclassification',
  safety_event_increase: 'Increased safety events',
  multiplicity_penalty: 'Multiplicity penalty',
  protocol_deviation_impact: 'Protocol-deviation impact',
};

/**
 * Map a selected regulatory-stress scenario to the panel DTO. The evidence layer
 * only SELECTS which scenarios are defensible (driven by the FDA findings on
 * record); the parameter values are the caller's and are executed on the existing
 * simulator — so `result` is null and `parameterSource` is 'none' here. Selection,
 * never a minted number (§8/§9.1).
 */
function toStressScenarioDto(s: { key: string; rationale: string; drivenBy: number[] }): StressScenario {
  return {
    scenarioId: s.key,
    label: STRESS_LABELS[s.key] ?? s.key,
    selectedBy: null,
    parameterSource: 'none',
    parameterNote: s.rationale,
    result: null,
    resultTone: 'neutral',
  };
}

/**
 * Resolve a design node's PRIMARY ENDPOINT from the protocol-authoring store. The
 * endpoint is the one clinical attribute a design node reliably carries as
 * structured data (`c2c_protocol_dev.objectives`); indication and phase live only
 * in free-text title/prose, so they are deliberately NOT parsed here. Org-scoped
 * and best-effort — any miss (no row, no table, malformed JSON) returns null and
 * the caller falls back to honest-empty rather than scoping evidence on a guess.
 */
async function resolveDesignEndpoint(scope: EvidenceScope, designNodeId: string): Promise<string | null> {
  const id = designNodeId.trim();
  // The design node is a real protocol_documents id (integer). Resolve its primary
  // endpoint from the normalized protocol store — the same store the converged
  // /api/protocol-dev read serves. Non-numeric ids never match a protocol document,
  // so they resolve to null (honest-empty) rather than a guess.
  if (!/^\d+$/.test(id)) return null;
  try {
    const { rows } = await pool.query(
      `SELECT endpoint FROM protocol_objectives
        WHERE protocol_document_id = $1::int AND organization_id = $2
          AND endpoint IS NOT NULL AND btrim(endpoint) <> ''
        ORDER BY (objective_type = 'primary') DESC, order_index, id
        LIMIT 1`,
      [id, scope.organizationId],
    );
    const ep = rows.length > 0 ? (rows[0] as { endpoint?: unknown }).endpoint : null;
    return typeof ep === 'string' && ep.trim() ? ep.trim() : null;
  } catch {
    return null;
  }
}

const TRACE_ENTITIES: readonly EntityType[] = [
  'source', 'study', 'finding', 'outcome', 'design_feature', 'result_observation', 'design_lesson', 'atom',
];

/** Parse a trace ref: "<entityType>:<id>" or a bare numeric finding id. */
function parseTraceRef(traceId: string): { entityType: EntityType; entityId: string } | null {
  const raw = (traceId ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^([a-z_]+):(.+)$/i);
  if (m && (TRACE_ENTITIES as readonly string[]).includes(m[1].toLowerCase())) {
    return { entityType: m[1].toLowerCase() as EntityType, entityId: m[2].trim() };
  }
  if (/^\d+$/.test(raw)) return { entityType: 'finding', entityId: raw };
  return null;
}

/**
 * The single payload behind the Study Design evidence panel. Coverage is real
 * (counted from the spine). `findings` is the design node's ENDPOINT-scoped FDA
 * precedent — the reliable structured signal a node carries — and `stressScenarios`
 * are the defensible regulatory-stress tests the findings on record select. The
 * indication-scoped arrays (comparableStudies / observations / pooled) stay
 * honest-empty because the design-node store carries no clean indication to scope
 * them by; the coverage exclusion note explains the zero rather than guessing.
 */
export async function getDesignEvidence(
  scope: EvidenceScope,
  designNodeId: string,
  designNodeType = 'unknown',
): Promise<DesignEvidencePanel> {
  assertScoped(scope, 'getDesignEvidence');
  const coverage = await getCoverage(scope, { designNodeId });
  const endpoint = await resolveDesignEndpoint(scope, designNodeId);

  const findings = endpoint
    ? (await searchFindings(scope, { text: endpoint, limit: 50 })).findings
    : [];

  let stressScenarios: StressScenario[] = [];
  try {
    const plan = await simulateDesignWithRegulatoryStress(scope.organizationId, { indication: '' });
    stressScenarios = plan.scenarios.map(toStressScenarioDto);
  } catch {
    /* honest-empty on a scenario-selection failure */
  }

  return {
    designNodeId,
    designNodeType,
    comparableStudies: [],
    observations: [],
    pooled: null,
    findings,
    stressScenarios,
    assumptions: [],
    contradictions: [],
    coverage,
    trace: null,
  };
}

/**
 * The evidence chain behind a recommendation. `traceId` is a spine entity ref
 * ("finding:123", "source:45", or a bare finding id); the chain is the relationship
 * edges around that entity, each inspectable with its source and flagged when
 * inferred. Null when the ref is unparseable or has no edges — never a fabricated
 * chain.
 */
export async function getTrace(
  scope: EvidenceScope,
  traceId: string,
): Promise<EvidenceTrace | null> {
  assertScoped(scope, 'getTrace');
  const ref = parseTraceRef(traceId);
  if (!ref) return null;

  let rels;
  try {
    rels = await listRelationshipsFor(scope.organizationId, ref.entityType, ref.entityId);
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return null;
    throw e;
  }
  if (rels.length === 0) return null;

  const coverage = await getCoverage(scope);
  const byType = new Map<string, number>();
  for (const r of rels) byType.set(r.relationshipType, (byType.get(r.relationshipType) ?? 0) + 1);
  const chain: { step: string; count: number | null }[] = [
    { step: `${ref.entityType} ${ref.entityId}`, count: null },
    ...[...byType.entries()].map(([step, count]) => ({ step, count })),
  ];

  return {
    traceId,
    corpusSnapshot: coverage.freshness ?? 'current',
    chain,
    calculations: [],
    assumptions: [],
    contradictions: [],
    coverage,
    reviewState: rels.some(r => r.isInferred) ? 'extracted' : 'human_reviewed',
    recalculateRequired: false,
  };
}

export interface StressTestInput {
  designNodeId: string;
  assumptions?: Assumption[];
}

/**
 * Select the defensible regulatory-stress scenarios for a design — driven by the
 * FDA findings on record (§8: CRLs inform WHICH tests matter, never the parameter
 * values). The values remain the caller's and are executed on the existing
 * simulator, so scenarios return selected-not-run. Honest-empty when no letters are
 * on record.
 */
export async function runStressTest(
  scope: EvidenceScope,
  input: StressTestInput,
): Promise<{ scenarios: StressScenario[]; assumptions: Assumption[] }> {
  assertScoped(scope, 'runStressTest');
  const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
  if (!(await findingsAvailable(scope))) return { scenarios: [], assumptions };
  try {
    const plan = await simulateDesignWithRegulatoryStress(scope.organizationId, { indication: '' });
    return { scenarios: plan.scenarios.map(toStressScenarioDto), assumptions };
  } catch {
    return { scenarios: [], assumptions };
  }
}

export * from './types';
export { emptyCoverage, buildCoverage, isStale } from './coverage-service';

/** Exposed for the routes' honest "corpus not ingested" messaging and for tests. */
export const CORPUS_NOT_INGESTED_REASON = NOT_YET_INGESTED;
export const NO_LETTERS_INGESTED_REASON = NO_LETTERS_INGESTED;
export { findingsAvailable };

/**
 * Clinical Regulatory Evidence — shared domain barrel.
 *
 * The source-agnostic evidence spine (§3): typed contracts + the org-scoped
 * persistence/query service over the cre_* tables. Consumers (CSR adapter,
 * studyDesignEvidenceService, CRL ingestion, AnA tools) import from here.
 */
export * as evidenceSpine from './evidence-spine.service';
export { EvidenceSpineError } from './evidence-spine.service';
export * as csrAdapter from './csr-adapter.service';
export * as studyDesignEvidence from './study-design-evidence.service';
export * as crlIngestion from './crl-ingestion.service';
export * as governance from './governance';
export { INSUFFICIENT_EVIDENCE, UnsupportedClaimError } from './governance';
