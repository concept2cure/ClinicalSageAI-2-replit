/**
 * Regulatory Authoring Plan generator (Feature 2.4).
 *
 * Before any new artifact is drafted, the authoring plan answers four
 * questions about a CTD section the user is about to author:
 *
 *   1. Sources — which existing artifacts in the dossier feed this
 *      section? Pulled via project-scoped retrieval against the section's
 *      generation-prompt (or a caller-supplied seed query) so we surface
 *      the sentences/passages the next draft should cite.
 *   2. Cross-references — which OTHER CTD sections are linked to this
 *      one? Derived from the citation graph (any artifact in another
 *      section whose citations touch artifacts in this section, AND
 *      anything explicitly linked via dependencies in IND_SECTIONS).
 *   3. Risk factors — what does Shadow Review flag for this section in
 *      this project? Pulled from the project readiness aggregator: open
 *      gaps, low coverage, filing-blocking findings, plus any
 *      therapeutic-area-specific risks.
 *   4. Contradictions — open consistency alerts whose
 *      artifactA OR artifactB lives in this section. The plan surfaces
 *      these BEFORE writing so the author resolves them in the new
 *      draft (or addresses them explicitly).
 *
 * Plus reviewer expectations + guidance refs lifted from the project's
 * therapeutic-area profile when one is set, and a strawman outline
 * pulled from IND_SECTIONS contentType + wordCountRange.
 *
 * Plans are persisted in `authoring_plans`. Status flow:
 *   draft → pending_approval → approved → executed
 *                          → rejected
 * Re-generation against the same (project, section) supersedes the
 * existing active row in place (the unique partial index enforces
 * single-active).
 *
 * Pure assemble + derive helpers are exported for testability.
 *
 * @module server/services/ana/authoring-plan-generator
 */
import { getPool } from '../../db/runtime.js';
import { ragRouter } from '../ragRouter.js';
import { IND_SECTIONS, type INDSection } from '../ind/ind-section-registry.js';
import { getProjectTherapeuticContext } from './therapeutic-area-context.js';
import { getProjectReadinessAggregate } from './project-readiness-aggregator.js';
import { listConsistencyAlerts } from '../intelligence/cross-artifact-consistency-scanner.js';
import { getProjectCitationGraph } from './citation-graph.js';

// ─── Types ────────────────────────────────────────────────────────────

export type AuthoringPlanStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed';

export type AuthoringPlanSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface AuthoringPlanSource {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  /** 0..1 retrieval relevance. */
  relevance: number;
  /** A short excerpt of the most relevant passage. */
  excerpt: string;
  /** Optional locator (page / heading) when retrieval surfaced one. */
  locator?: string;
}

export interface AuthoringPlanCrossRef {
  ctdSection: string;
  title: string | null;
  /** "supports" | "depends_on" | "contradicts" — directional label. */
  relationship: 'supports' | 'depends_on' | 'contradicts';
  /** Number of artifacts / edges backing this cross-ref. */
  weight: number;
  reason: string;
}

export interface AuthoringPlanRiskFactor {
  id: string;
  source:
    | 'shadow_review'
    | 'consistency'
    | 'guidance'
    | 'therapeutic_area'
    | 'section_coverage'
    | 'citation_quality';
  severity: AuthoringPlanSeverity;
  message: string;
  /** Estimated readiness points recovered if mitigated. */
  scoreImpact?: number;
  references?: {
    artifactId?: string;
    ctdSection?: string;
    alertId?: string;
    guidanceCode?: string;
  };
}

export interface AuthoringPlanContradiction {
  alertId: string;
  artifactAId: string;
  artifactBId: string;
  ctdSectionA: string | null;
  ctdSectionB: string | null;
  sentenceText: string;
  contradictingPassage: string | null;
  severity: AuthoringPlanSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
}

export interface AuthoringPlanReviewerExpectation {
  text: string;
  source: 'therapeutic_area' | 'guidance' | 'section_registry';
  guidanceCode?: string;
}

export interface AuthoringPlanGuidanceRef {
  code: string;
  authority: string;
  title: string;
  why?: string;
}

export interface AuthoringPlanOutlineSection {
  heading: string;
  guidance: string;
  /** Optional sub-bullets to seed the draft. */
  bullets?: string[];
}

export interface AuthoringPlan {
  id: string | null;
  organizationId: number;
  projectId: number;
  artifactId: string | null;
  ctdSection: string;
  submissionType: 'IND' | 'NDA' | 'BLA' | 'ALL';
  status: AuthoringPlanStatus;
  title: string;
  summary: string;
  sources: AuthoringPlanSource[];
  crossRefs: AuthoringPlanCrossRef[];
  riskFactors: AuthoringPlanRiskFactor[];
  contradictions: AuthoringPlanContradiction[];
  reviewerExpectations: AuthoringPlanReviewerExpectation[];
  guidanceRefs: AuthoringPlanGuidanceRef[];
  outline: AuthoringPlanOutlineSection[];
  therapeuticArea: string | null;
  generatorVersion: string;
  /** 0..100 — how complete the plan is (more sources / fewer risks → higher). */
  score: number;
  createdAt?: string;
  approvedAt?: string | null;
  approvedBy?: number | null;
  rejectedAt?: string | null;
  rejectedBy?: number | null;
  rejectedReason?: string | null;
  executedAt?: string | null;
  executedArtifactId?: string | null;
}

// ─── Tunables ─────────────────────────────────────────────────────────

const GENERATOR_VERSION = 'authoring-plan-v1';
const MAX_SOURCES = 8;
const MAX_CROSS_REFS = 8;
const MAX_RISK_FACTORS = 12;
const MAX_CONTRADICTIONS = 10;
const SOURCE_EXCERPT_CHARS = 280;
const RETRIEVAL_LIMIT = 16;

const SEVERITY_RANK: Record<AuthoringPlanSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

// ─── Pure helpers ─────────────────────────────────────────────────────

function findSection(ctdSection: string): INDSection | null {
  const exact = IND_SECTIONS.find(s => s.code === ctdSection);
  if (exact) return exact;
  // Tolerate caller-supplied prefixes: '4.2' should resolve to the longest
  // registered prefix match.
  const prefix = IND_SECTIONS.filter(s => ctdSection.startsWith(s.code))
    .sort((a, b) => b.code.length - a.code.length)[0];
  return prefix ?? null;
}

function safeExcerpt(content: string | null | undefined, max = SOURCE_EXCERPT_CHARS): string {
  if (!content) return '';
  const stripped = String(content).replace(/\s+/g, ' ').trim();
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, max - 1).trimEnd()}…`;
}

function dedupePush<T>(arr: T[], key: (item: T) => string, item: T, cap?: number): void {
  const k = key(item);
  if (arr.some(x => key(x) === k)) return;
  if (typeof cap === 'number' && arr.length >= cap) return;
  arr.push(item);
}

/**
 * Pure: derive a structured plan from already-fetched signals.
 * Caller (generateAuthoringPlan) does the IO; we do the synthesis.
 */
export function deriveAuthoringPlan(input: {
  organizationId: number;
  projectId: number;
  ctdSection: string;
  submissionType: 'IND' | 'NDA' | 'BLA' | 'ALL';
  artifactId?: string | null;
  sectionMeta: INDSection | null;
  retrievalDocs: Array<{
    artifactId: string | null;
    title: string;
    content: string;
    relevance: number;
    locator?: string | null;
    ctdSection?: string | null;
  }>;
  readiness: Awaited<ReturnType<typeof getProjectReadinessAggregate>> | null;
  contradictions: Array<{
    id: string;
    artifactAId: string;
    artifactAPk: number;
    artifactACtdSection: string | null;
    artifactBId: string;
    artifactBPk: number;
    artifactBCtdSection: string | null;
    sentenceText: string;
    contradictingPassage: string | null;
    severity: AuthoringPlanSeverity;
    status: 'open' | 'acknowledged' | 'resolved';
  }>;
  graph: Awaited<ReturnType<typeof getProjectCitationGraph>> | null;
  therapeutic: Awaited<ReturnType<typeof getProjectTherapeuticContext>>;
}): AuthoringPlan {
  const {
    organizationId,
    projectId,
    ctdSection,
    submissionType,
    artifactId,
    sectionMeta,
    retrievalDocs,
    readiness,
    contradictions,
    graph,
    therapeutic,
  } = input;

  // 1. Sources — top-K retrieval results, deduped by artifactId, ranked by
  // relevance.
  const sources: AuthoringPlanSource[] = [];
  const sortedDocs = [...retrievalDocs]
    .filter(d => !!d.artifactId)
    .sort((a, b) => b.relevance - a.relevance);
  for (const d of sortedDocs) {
    dedupePush(
      sources,
      s => s.artifactId,
      {
        artifactId: d.artifactId as string,
        ctdSection: d.ctdSection ?? null,
        title: d.title || d.artifactId || 'Untitled',
        relevance: Math.round(d.relevance * 100) / 100,
        excerpt: safeExcerpt(d.content),
        locator: d.locator || undefined,
      },
      MAX_SOURCES
    );
  }

  // 2. Cross-references.
  // 2a. Section dependencies declared in the registry.
  const crossRefs: AuthoringPlanCrossRef[] = [];
  if (sectionMeta?.dependencies?.length) {
    for (const depCode of sectionMeta.dependencies) {
      const depMeta = IND_SECTIONS.find(s => s.code === depCode) ?? null;
      dedupePush(
        crossRefs,
        c => `${c.ctdSection}|${c.relationship}`,
        {
          ctdSection: depCode,
          title: depMeta?.title ?? null,
          relationship: 'depends_on',
          weight: 1,
          reason: `Section ${ctdSection} depends on ${depCode} per CTD registry.`,
        },
        MAX_CROSS_REFS
      );
    }
  }
  // 2b. Citation-graph edges to/from artifacts living in this section.
  if (graph) {
    const inSectionIds = new Set(
      graph.nodes
        .filter(n => n.ctdSection === ctdSection)
        .map(n => n.artifactId)
    );
    if (inSectionIds.size > 0) {
      const linked = new Map<
        string,
        { supports: number; contradicts: number; ctdSection: string | null; title: string | null }
      >();
      for (const edge of graph.edges) {
        const inFrom = inSectionIds.has(edge.fromArtifactId);
        const inTo = inSectionIds.has(edge.toArtifactId);
        if (inFrom === inTo) continue; // intra-section or unrelated
        const otherId = inFrom ? edge.toArtifactId : edge.fromArtifactId;
        const otherNode = graph.nodes.find(n => n.artifactId === otherId);
        if (!otherNode || !otherNode.ctdSection) continue;
        if (otherNode.ctdSection === ctdSection) continue;
        const slot = linked.get(otherNode.ctdSection) ?? {
          supports: 0,
          contradicts: 0,
          ctdSection: otherNode.ctdSection,
          title: otherNode.title ?? null,
        };
        if (edge.relationship === 'supports') slot.supports += edge.sentenceCount;
        else slot.contradicts += edge.sentenceCount;
        linked.set(otherNode.ctdSection, slot);
      }
      const ranked = Array.from(linked.entries())
        .map(([code, v]) => ({ code, ...v }))
        .sort(
          (a, b) =>
            (b.supports + b.contradicts * 2) - (a.supports + a.contradicts * 2)
        );
      for (const r of ranked) {
        if (r.contradicts > 0) {
          dedupePush(
            crossRefs,
            c => `${c.ctdSection}|${c.relationship}`,
            {
              ctdSection: r.code,
              title: r.title,
              relationship: 'contradicts',
              weight: r.contradicts,
              reason: `${r.contradicts} contradicting citation${
                r.contradicts === 1 ? '' : 's'
              } between ${ctdSection} and ${r.code} — resolve before drafting.`,
            },
            MAX_CROSS_REFS
          );
        }
        if (r.supports > 0) {
          dedupePush(
            crossRefs,
            c => `${c.ctdSection}|${c.relationship}`,
            {
              ctdSection: r.code,
              title: r.title,
              relationship: 'supports',
              weight: r.supports,
              reason: `${r.supports} supporting citation${
                r.supports === 1 ? '' : 's'
              } already link ${ctdSection} ↔ ${r.code}.`,
            },
            MAX_CROSS_REFS
          );
        }
      }
    }
  }

  // 3. Risk factors — readiness next-actions touching this section + therapeutic risks.
  const riskFactors: AuthoringPlanRiskFactor[] = [];
  if (readiness?.nextActions?.length) {
    for (const action of readiness.nextActions) {
      const actionSection = action.references?.ctdSection ?? null;
      const matchesSection =
        !actionSection ||
        actionSection === ctdSection ||
        ctdSection.startsWith(actionSection) ||
        actionSection.startsWith(ctdSection);
      if (!matchesSection) continue;
      const sourceMap: Record<typeof action.category, AuthoringPlanRiskFactor['source']> = {
        section_coverage: 'section_coverage',
        citation_quality: 'citation_quality',
        consistency: 'consistency',
        guidance: 'guidance',
        therapeutic_area: 'therapeutic_area',
      };
      dedupePush(
        riskFactors,
        r => `${r.source}|${r.message}`,
        {
          id: action.id,
          source: sourceMap[action.category] ?? 'shadow_review',
          severity: action.severity,
          message: action.message,
          scoreImpact: action.scoreImpact,
          references: action.references,
        },
        MAX_RISK_FACTORS
      );
    }
  }
  // Therapeutic-area generic risk factors (always relevant context).
  if (therapeutic.profile?.riskFactors?.length) {
    for (const txt of therapeutic.profile.riskFactors.slice(0, 4)) {
      dedupePush(
        riskFactors,
        r => `${r.source}|${r.message}`,
        {
          id: `ta-risk-${txt.slice(0, 24).replace(/\W+/g, '-').toLowerCase()}`,
          source: 'therapeutic_area',
          severity: 'minor',
          message: txt,
        },
        MAX_RISK_FACTORS
      );
    }
  }
  riskFactors.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (b.scoreImpact ?? 0) - (a.scoreImpact ?? 0)
  );

  // 4. Contradictions touching this section.
  const sectionContradictions: AuthoringPlanContradiction[] = [];
  for (const c of contradictions) {
    const inA =
      c.artifactACtdSection === ctdSection ||
      (c.artifactACtdSection ?? '').startsWith(ctdSection) ||
      ctdSection.startsWith(c.artifactACtdSection ?? '');
    const inB =
      c.artifactBCtdSection === ctdSection ||
      (c.artifactBCtdSection ?? '').startsWith(ctdSection) ||
      ctdSection.startsWith(c.artifactBCtdSection ?? '');
    if (!inA && !inB) continue;
    sectionContradictions.push({
      alertId: c.id,
      artifactAId: c.artifactAId,
      artifactBId: c.artifactBId,
      ctdSectionA: c.artifactACtdSection,
      ctdSectionB: c.artifactBCtdSection,
      sentenceText: c.sentenceText,
      contradictingPassage: c.contradictingPassage,
      severity: c.severity,
      status: c.status,
    });
    if (sectionContradictions.length >= MAX_CONTRADICTIONS) break;
  }
  sectionContradictions.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );

  // 5. Reviewer expectations.
  const reviewerExpectations: AuthoringPlanReviewerExpectation[] = [];
  if (sectionMeta) {
    reviewerExpectations.push({
      text: `Match the registry guidance: ${sectionMeta.guidance}.`,
      source: 'section_registry',
      guidanceCode: sectionMeta.guidance,
    });
  }
  if (therapeutic.profile?.reviewerExpectations?.length) {
    for (const txt of therapeutic.profile.reviewerExpectations) {
      dedupePush(
        reviewerExpectations,
        r => r.text,
        { text: txt, source: 'therapeutic_area' }
      );
    }
  }

  // 6. Guidance refs from the therapeutic profile (filtered to ones that
  // mention the module / section when possible).
  const guidanceRefs: AuthoringPlanGuidanceRef[] =
    therapeutic.profile?.guidanceRefs?.map(g => ({
      code: g.code,
      authority: g.authority,
      title: g.title,
      why: g.why,
    })) ?? [];

  // 7. Strawman outline driven by content type + word count target.
  const outline = buildOutline(sectionMeta, sources, sectionContradictions);

  // 8. Title + summary.
  const planTitle = sectionMeta
    ? `Authoring plan — ${sectionMeta.code} ${sectionMeta.title}`
    : `Authoring plan — ${ctdSection}`;

  const summaryParts: string[] = [];
  summaryParts.push(`${sources.length} source${sources.length === 1 ? '' : 's'} identified`);
  if (crossRefs.length) {
    summaryParts.push(
      `${crossRefs.length} cross-reference${crossRefs.length === 1 ? '' : 's'}`
    );
  }
  const criticalRisks = riskFactors.filter(r => r.severity === 'critical').length;
  const majorRisks = riskFactors.filter(r => r.severity === 'major').length;
  if (criticalRisks) summaryParts.push(`${criticalRisks} critical risk${criticalRisks === 1 ? '' : 's'}`);
  if (majorRisks) summaryParts.push(`${majorRisks} major risk${majorRisks === 1 ? '' : 's'}`);
  if (sectionContradictions.length) {
    summaryParts.push(
      `${sectionContradictions.length} unresolved contradiction${sectionContradictions.length === 1 ? '' : 's'}`
    );
  }
  if (therapeutic.profile) {
    summaryParts.push(`${therapeutic.profile.displayName} reviewer expectations applied`);
  }
  const summary = summaryParts.join(' · ') || 'Plan ready — no risks detected.';

  // 9. Score.
  const score = computePlanScore({
    sources,
    riskFactors,
    contradictions: sectionContradictions,
    hasTherapeuticContext: !!therapeutic.profile,
  });

  return {
    id: null,
    organizationId,
    projectId,
    artifactId: artifactId ?? null,
    ctdSection,
    submissionType,
    status: 'draft',
    title: planTitle,
    summary,
    sources,
    crossRefs,
    riskFactors,
    contradictions: sectionContradictions,
    reviewerExpectations,
    guidanceRefs,
    outline,
    therapeuticArea: therapeutic.therapeuticArea,
    generatorVersion: GENERATOR_VERSION,
    score,
  };
}

function buildOutline(
  sectionMeta: INDSection | null,
  sources: AuthoringPlanSource[],
  contradictions: AuthoringPlanContradiction[]
): AuthoringPlanOutlineSection[] {
  if (!sectionMeta) return [];
  const heading = `${sectionMeta.code} ${sectionMeta.title}`;
  const wc = sectionMeta.wordCountRange
    ? `${sectionMeta.wordCountRange[0]}–${sectionMeta.wordCountRange[1]} words`
    : null;
  const out: AuthoringPlanOutlineSection[] = [];
  out.push({
    heading: 'Section opener',
    guidance: `Anchor on the regulatory ask: ${sectionMeta.guidance}. Format: ${sectionMeta.contentType}${
      wc ? `, target ${wc}` : ''
    }.`,
  });
  if (sources.length) {
    out.push({
      heading: 'Evidence narrative',
      guidance:
        'Walk through each source in priority order. Cite at the sentence level.',
      bullets: sources
        .slice(0, 5)
        .map(s => `[${s.artifactId}] ${s.title} — ${s.excerpt.slice(0, 120)}`),
    });
  } else {
    out.push({
      heading: 'Evidence narrative',
      guidance:
        'No project-internal sources match this section yet. Pull from external guidance / literature; flag the gap before submission.',
    });
  }
  if (contradictions.length) {
    out.push({
      heading: 'Reconciliation',
      guidance:
        'Address each unresolved contradiction explicitly. Either reconcile in the new draft or cite the chosen interpretation with rationale.',
      bullets: contradictions
        .slice(0, 5)
        .map(c => `${c.artifactAId} ↔ ${c.artifactBId}: ${c.sentenceText.slice(0, 140)}`),
    });
  }
  out.push({
    heading: 'Reviewer-anticipated questions',
    guidance:
      'Pre-empt the top reviewer expectations from the therapeutic-area profile (if set) and the section\'s guidance reference.',
  });
  return out;
}

function computePlanScore(input: {
  sources: AuthoringPlanSource[];
  riskFactors: AuthoringPlanRiskFactor[];
  contradictions: AuthoringPlanContradiction[];
  hasTherapeuticContext: boolean;
}): number {
  let score = 50;
  // Sources push the score up — diminishing returns.
  score += Math.min(input.sources.length, 6) * 5;
  if (input.hasTherapeuticContext) score += 5;
  // Risks pull down by severity.
  for (const r of input.riskFactors) {
    if (r.severity === 'critical') score -= 8;
    else if (r.severity === 'major') score -= 3;
    else if (r.severity === 'minor') score -= 1;
  }
  // Open contradictions are filing-blocking until resolved.
  const openContradictions = input.contradictions.filter(
    c => c.status !== 'resolved'
  ).length;
  score -= openContradictions * 4;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
}

// ─── Live entry ───────────────────────────────────────────────────────

export interface GenerateAuthoringPlanOptions {
  projectId: number;
  organizationId: number;
  organizationUuid?: string | null;
  ctdSection: string;
  submissionType?: 'IND' | 'NDA' | 'BLA' | 'ALL';
  artifactId?: string | null;
  /** Override the retrieval seed query (defaults to the section's
   * generationPrompt). */
  seedQuery?: string;
  /** Persist the plan as draft (default true). When false, returns the
   * derived plan without writing. */
  persist?: boolean;
  /** When persisting, set this status. Default: 'draft'. */
  initialStatus?: 'draft' | 'pending_approval';
  createdBy?: number | null;
}

/**
 * Generate (and optionally persist) an authoring plan for the given
 * (project, ctdSection). Tenant-scoped on every read + write.
 */
export async function generateAuthoringPlan(
  options: GenerateAuthoringPlanOptions
): Promise<AuthoringPlan> {
  const {
    projectId,
    organizationId,
    organizationUuid,
    ctdSection,
    submissionType = 'IND',
    artifactId = null,
    seedQuery,
    persist = true,
    initialStatus = 'draft',
    createdBy = null,
  } = options;

  if (!organizationId) {
    const err = new Error('organizationId is required');
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }
  if (!ctdSection || typeof ctdSection !== 'string') {
    const err = new Error('ctdSection is required');
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }

  const sectionMeta = findSection(ctdSection);

  // 1. Therapeutic context (always, even when no profile registered — the
  // helper handles missing column gracefully).
  const therapeutic = await getProjectTherapeuticContext(
    projectId,
    organizationId
  );

  // 2. Retrieval seed.
  const query =
    seedQuery ??
    sectionMeta?.generationPrompt ??
    `Content for CTD section ${ctdSection}`;

  // 3. Pull supporting passages via project-scoped retrieval. Only when
  // we have an organizationUuid (the pipeline uses it for tenant scoping
  // in lumen_data_atoms). When missing, we degrade gracefully.
  let retrievalDocs: Array<{
    artifactId: string | null;
    title: string;
    content: string;
    relevance: number;
    locator?: string | null;
    ctdSection?: string | null;
  }> = [];
  if (organizationUuid) {
    try {
      const ctx = await ragRouter.retrieve({
        query,
        intent: 'project_scoped',
        limit: RETRIEVAL_LIMIT,
        useReranking: true,
        useMmr: true,
        mmrLambda: 0.7, // preserve prior behaviour (pipeline default was 0.7)
        organizationUuid,
        artifactScope: { projectId, organizationUuid },
      });
      retrievalDocs = ctx.documents.map(d => ({
        artifactId: (d.documentId as string | undefined) ?? d.id ?? null,
        title: d.title || 'Untitled',
        content: d.compressedContent || d.content || '',
        relevance: d.finalScore || d.rerankScore || d.initialScore || 0,
        locator: d.locator ?? null,
        ctdSection: d.sectionTitle ?? null,
      }));
    } catch (err) {
      // Retrieval failure should not block plan generation — risk
      // factors will still surface what's missing.
      retrievalDocs = [];
    }
  }

  // 3b. Decorate retrieval docs with the artifact's actual ctd_section
  // from concept2cure_artifacts when available — pipeline metadata may
  // not carry it consistently.
  if (retrievalDocs.length > 0) {
    const ids = Array.from(
      new Set(
        retrievalDocs
          .map(d => d.artifactId)
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
      )
    );
    if (ids.length > 0) {
      try {
        const { rows } = await getPool().query(
          `SELECT artifact_id, ctd_section, title
             FROM concept2cure_artifacts
            WHERE organization_id = $1
              AND artifact_id = ANY($2::text[])`,
          [organizationId, ids]
        );
        const byId = new Map<string, { ctdSection: string | null; title: string | null }>();
        for (const r of rows) {
          byId.set(r.artifact_id, {
            ctdSection: r.ctd_section ?? null,
            title: r.title ?? null,
          });
        }
        retrievalDocs = retrievalDocs.map(d => {
          const meta = d.artifactId ? byId.get(d.artifactId) : null;
          if (!meta) return d;
          return {
            ...d,
            ctdSection: meta.ctdSection ?? d.ctdSection ?? null,
            title: meta.title || d.title,
          };
        });
      } catch {
        // 42P01 / 42703 → table or column missing; leave docs as-is.
      }
    }
  }

  // 4. Readiness aggregator (parallel-safe — pulls 5 signals internally).
  // 5. Consistency alerts for the project.
  // 6. Citation graph.
  const [readinessResult, consistencyResult, graphResult] = await Promise.all([
    getProjectReadinessAggregate(projectId, organizationId, { submissionType }).catch(() => null),
    listConsistencyAlerts({
      organizationId,
      projectId,
      status: ['open', 'acknowledged'],
      limit: 100,
    }).catch(() => ({ rows: [], total: 0 })),
    getProjectCitationGraph(projectId, organizationId).catch(() => null),
  ]);

  const contradictions = (consistencyResult.rows ?? []).map(c => ({
    id: c.id,
    artifactAId: c.artifactAId,
    artifactAPk: c.artifactAPk,
    artifactACtdSection: c.artifactACtdSection,
    artifactBId: c.artifactBId,
    artifactBPk: c.artifactBPk,
    artifactBCtdSection: c.artifactBCtdSection,
    sentenceText: c.sentenceText,
    contradictingPassage: c.contradictingPassage,
    severity: c.severity as AuthoringPlanSeverity,
    status: c.status as 'open' | 'acknowledged' | 'resolved',
  }));

  const plan = deriveAuthoringPlan({
    organizationId,
    projectId,
    ctdSection,
    submissionType,
    artifactId,
    sectionMeta,
    retrievalDocs,
    readiness: readinessResult,
    contradictions,
    graph: graphResult,
    therapeutic,
  });

  if (!persist) return plan;

  const status: AuthoringPlanStatus = initialStatus;
  const upserted = await upsertActivePlan(plan, status, createdBy);
  return upserted;
}

// ─── Persistence ──────────────────────────────────────────────────────

async function upsertActivePlan(
  plan: AuthoringPlan,
  status: AuthoringPlanStatus,
  createdBy: number | null
): Promise<AuthoringPlan> {
  const sql = `
    INSERT INTO authoring_plans (
      organization_id, project_id, artifact_id, ctd_section, submission_type,
      status, title, summary,
      sources, cross_refs, risk_factors, contradictions,
      reviewer_expectations, guidance_refs, outline,
      therapeutic_area, generator_version, score, metadata, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,
      $9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,
      $13::jsonb,$14::jsonb,$15::jsonb,
      $16,$17,$18,$19::jsonb,$20
    )
    ON CONFLICT (organization_id, project_id, ctd_section)
      WHERE status IN ('draft','pending_approval')
      DO UPDATE SET
        artifact_id            = EXCLUDED.artifact_id,
        submission_type        = EXCLUDED.submission_type,
        status                 = EXCLUDED.status,
        title                  = EXCLUDED.title,
        summary                = EXCLUDED.summary,
        sources                = EXCLUDED.sources,
        cross_refs             = EXCLUDED.cross_refs,
        risk_factors           = EXCLUDED.risk_factors,
        contradictions         = EXCLUDED.contradictions,
        reviewer_expectations  = EXCLUDED.reviewer_expectations,
        guidance_refs          = EXCLUDED.guidance_refs,
        outline                = EXCLUDED.outline,
        therapeutic_area       = EXCLUDED.therapeutic_area,
        generator_version      = EXCLUDED.generator_version,
        score                  = EXCLUDED.score,
        metadata               = EXCLUDED.metadata,
        updated_at             = now()
    RETURNING id, created_at`;

  try {
    const { rows } = await getPool().query(sql, [
      plan.organizationId,
      plan.projectId,
      plan.artifactId,
      plan.ctdSection,
      plan.submissionType,
      status,
      plan.title,
      plan.summary,
      JSON.stringify(plan.sources),
      JSON.stringify(plan.crossRefs),
      JSON.stringify(plan.riskFactors),
      JSON.stringify(plan.contradictions),
      JSON.stringify(plan.reviewerExpectations),
      JSON.stringify(plan.guidanceRefs),
      JSON.stringify(plan.outline),
      plan.therapeuticArea,
      plan.generatorVersion,
      plan.score,
      JSON.stringify({ generatorVersion: plan.generatorVersion }),
      createdBy,
    ]);
    const row = rows[0];
    return {
      ...plan,
      id: row?.id ?? null,
      status,
      createdAt: row?.created_at ? new Date(row.created_at).toISOString() : undefined,
    };
  } catch (err: any) {
    if (err?.code === '42P01') {
      // authoring_plans not migrated yet — return the in-memory plan.
      const e = new Error('authoring_plans table not migrated yet');
      (e as any).code = 'MIGRATION_PENDING';
      throw e;
    }
    throw err;
  }
}

// ─── Read / lifecycle ─────────────────────────────────────────────────

function rowToPlan(r: any): AuthoringPlan {
  const parse = <T>(v: unknown, fallback: T): T => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v) as T;
      } catch {
        return fallback;
      }
    }
    return v as T;
  };
  return {
    id: r.id,
    organizationId: r.organization_id,
    projectId: r.project_id,
    artifactId: r.artifact_id ?? null,
    ctdSection: r.ctd_section,
    submissionType: (r.submission_type ?? 'IND') as AuthoringPlan['submissionType'],
    status: r.status,
    title: r.title ?? '',
    summary: r.summary ?? '',
    sources: parse<AuthoringPlanSource[]>(r.sources, []),
    crossRefs: parse<AuthoringPlanCrossRef[]>(r.cross_refs, []),
    riskFactors: parse<AuthoringPlanRiskFactor[]>(r.risk_factors, []),
    contradictions: parse<AuthoringPlanContradiction[]>(r.contradictions, []),
    reviewerExpectations: parse<AuthoringPlanReviewerExpectation[]>(
      r.reviewer_expectations,
      []
    ),
    guidanceRefs: parse<AuthoringPlanGuidanceRef[]>(r.guidance_refs, []),
    outline: parse<AuthoringPlanOutlineSection[]>(r.outline, []),
    therapeuticArea: r.therapeutic_area ?? null,
    generatorVersion: r.generator_version ?? GENERATOR_VERSION,
    score: typeof r.score === 'number' ? r.score : Number(r.score) || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    approvedBy: r.approved_by ?? null,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : null,
    rejectedBy: r.rejected_by ?? null,
    rejectedReason: r.rejected_reason ?? null,
    executedAt: r.executed_at ? new Date(r.executed_at).toISOString() : null,
    executedArtifactId: r.executed_artifact_id ?? null,
  };
}

export async function getAuthoringPlan(
  id: string,
  organizationId: number
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT * FROM authoring_plans
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [id, organizationId]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export interface ListAuthoringPlansOptions {
  organizationId: number;
  projectId?: number;
  ctdSection?: string;
  status?: AuthoringPlanStatus | AuthoringPlanStatus[];
  limit?: number;
  offset?: number;
}

export async function listAuthoringPlans(
  options: ListAuthoringPlansOptions
): Promise<{ rows: AuthoringPlan[]; total: number }> {
  const filters: string[] = ['organization_id = $1'];
  const params: any[] = [options.organizationId];
  if (typeof options.projectId === 'number') {
    params.push(options.projectId);
    filters.push(`project_id = $${params.length}`);
  }
  if (options.ctdSection) {
    params.push(options.ctdSection);
    filters.push(`ctd_section = $${params.length}`);
  }
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    params.push(statuses);
    filters.push(`status = ANY($${params.length}::text[])`);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const offset = Math.max(0, options.offset ?? 0);

  try {
    const [rowsResult, countResult] = await Promise.all([
      getPool().query(
        `SELECT * FROM authoring_plans ${where}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      getPool().query(
        `SELECT COUNT(*)::int AS c FROM authoring_plans ${where}`,
        params
      ),
    ]);
    return {
      rows: rowsResult.rows.map(rowToPlan),
      total: countResult.rows[0]?.c ?? 0,
    };
  } catch (err: any) {
    if (err?.code === '42P01') return { rows: [], total: 0 };
    throw err;
  }
}

export async function approveAuthoringPlan(
  id: string,
  organizationId: number,
  approvedBy: number | null
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE authoring_plans
          SET status      = 'approved',
              approved_at = now(),
              approved_by = $3,
              updated_at  = now()
        WHERE id = $1
          AND organization_id = $2
          AND status IN ('draft','pending_approval')
        RETURNING *`,
      [id, organizationId, approvedBy]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export async function submitForApproval(
  id: string,
  organizationId: number
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE authoring_plans
          SET status     = 'pending_approval',
              updated_at = now()
        WHERE id = $1
          AND organization_id = $2
          AND status = 'draft'
        RETURNING *`,
      [id, organizationId]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export async function rejectAuthoringPlan(
  id: string,
  organizationId: number,
  rejectedBy: number | null,
  reason: string | null
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE authoring_plans
          SET status          = 'rejected',
              rejected_at     = now(),
              rejected_by     = $3,
              rejected_reason = $4,
              updated_at      = now()
        WHERE id = $1
          AND organization_id = $2
          AND status IN ('draft','pending_approval')
        RETURNING *`,
      [id, organizationId, rejectedBy, reason]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

export async function markAuthoringPlanExecuted(
  id: string,
  organizationId: number,
  executedArtifactId: string | null
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE authoring_plans
          SET status               = 'executed',
              executed_at          = now(),
              executed_artifact_id = COALESCE($3, executed_artifact_id),
              updated_at           = now()
        WHERE id = $1
          AND organization_id = $2
          AND status IN ('approved','draft','pending_approval')
        RETURNING *`,
      [id, organizationId, executedArtifactId]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

/**
 * Find the active (draft or pending_approval) plan for the given
 * (project, section) — used by docx-ledger-collector and the section
 * generator to attach a plan to a downstream artifact.
 */
export async function getActiveAuthoringPlanForSection(
  projectId: number,
  organizationId: number,
  ctdSection: string
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT * FROM authoring_plans
        WHERE organization_id = $1
          AND project_id      = $2
          AND ctd_section     = $3
          AND status IN ('draft','pending_approval','approved')
        ORDER BY
          CASE status
            WHEN 'approved' THEN 0
            WHEN 'pending_approval' THEN 1
            WHEN 'draft' THEN 2
          END,
          created_at DESC
        LIMIT 1`,
      [organizationId, projectId, ctdSection]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}

/**
 * Find the most recently-created plan (any status) attached to a given
 * artifact — used by docx-ledger-collector when an artifact carries an
 * artifact_id.
 */
export async function getLatestAuthoringPlanForArtifact(
  artifactId: string,
  organizationId: number
): Promise<AuthoringPlan | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT * FROM authoring_plans
        WHERE organization_id = $1
          AND (artifact_id = $2 OR executed_artifact_id = $2)
        ORDER BY created_at DESC
        LIMIT 1`,
      [organizationId, artifactId]
    );
    if (rows.length === 0) return null;
    return rowToPlan(rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') return null;
    throw err;
  }
}
