/**
 * Living Record Spine — Document-Section Binder.
 *
 * Closes the structural gap that made change propagation dead for pharma
 * documents: nothing bound a governed fact to a CTD/IND document section, so a
 * value change never reached the dossier. Two entry points:
 *
 *   - bindSectionToFact   an operator/AI declares "this section cites this fact"
 *                         → a fact_binding with a section:/document: target.
 *   - scanArtifactCitations  auto-detect which governed facts a CTD artifact's
 *                         prose cites (label-matched, value-compared) and bind
 *                         them; already-divergent citations are flagged on the
 *                         spot (the inconsistency-intelligence moment).
 *
 * Once a section is bound, applyFactChange / the Drift Sentinel / the freshness
 * report all see it for free — the section is now part of the citation set the
 * change-propagation machinery enumerates.
 *
 * Pure matching is in document-citations.ts; persistence is in
 * canonical-fact-store.ts. This module composes them and audits.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.7.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { concept2cureArtifacts } from '../../../shared/schema';
import { postMarketDocuments } from '../../../shared/schema/gspr-postmarket';
import type { CanonicalFact, FactBinding } from '../../../shared/schema/living-record-spine';
import auditService from '../auditService';
import { extractNumericalFacts } from '../intelligence/cross-artifact-consistency';
import {
  bindToFact,
  factValueView,
  getFact,
  listProgramFacts,
  setBindingStatus,
  writeDrift,
} from './canonical-fact-store';
import {
  matchCitationsToFacts,
  summarizeCitationMatches,
  type ActiveFactView,
  type CitationMatch,
} from './document-citations';
import { factChangeFailure as fail, type FactChangeFailure } from './fact-change';
import { documentTarget, sectionTarget } from './object-model';
import { compareValues, toCanonicalValue } from './value-reconciliation';

type BindingKind = 'mirror' | 'derived' | 'manual_override';

// ─────────────────────────────────────────────────────────────────────────────
// Explicit bind
// ─────────────────────────────────────────────────────────────────────────────

export interface BindSectionParams {
  factId: string;
  organizationId: number;
  /** Document reference (e.g. a concept2cure artifact_id or c2c document id). */
  docRef: string;
  /** CTD/section key within the document; omit to bind the whole document. */
  sectionKey?: string;
  /** The value as it appears in the section (what drift compares against). */
  observedValue: string;
  observedUnit?: string;
  bindingKind?: BindingKind;
  overrideReason?: string;
  actor: number | null;
}

export interface BindSectionResult {
  ok: true;
  binding: FactBinding;
  consistency: 'consistent' | 'divergent';
  driftId: string | null;
}

/** Build the typed target and reject a docRef that is empty. */
function sectionTargetFor(docRef: string, sectionKey?: string): string | null {
  const ref = docRef.trim();
  if (!ref) return null;
  const key = sectionKey?.trim();
  return key ? sectionTarget(ref, key) : documentTarget(ref);
}

export async function bindSectionToFact(
  params: BindSectionParams
): Promise<BindSectionResult | FactChangeFailure> {
  const fact = await getFact(params.factId);
  if (!fact || fact.organizationId !== params.organizationId) {
    return fail('not_found', 'Fact not found');
  }
  if (fact.status !== 'active') {
    return fail('conflict', `Only an active fact can be cited; this fact is ${fact.status}`);
  }
  const target = sectionTargetFor(params.docRef, params.sectionKey);
  if (!target) return fail('invalid', 'docRef is required');
  const observed = (params.observedValue ?? '').trim();
  if (!observed) return fail('invalid', 'observedValue is required');

  const kind = params.bindingKind ?? 'mirror';
  const binding = await bindToFact({
    organizationId: fact.organizationId,
    programId: fact.programId,
    factId: fact.id,
    target,
    bindingKind: kind,
    observedValue: observed,
    overrideReason: params.overrideReason ?? null,
    createdBy: params.actor ?? null,
  });

  // A mirror citation that already disagrees is an existing inconsistency —
  // flag it immediately, exactly as the fact-change path does.
  let driftId: string | null = null;
  let consistency: 'consistent' | 'divergent' = 'consistent';
  if (kind === 'mirror') {
    const factView = factValueView(fact);
    const cmp = compareValues({
      fact: factView,
      observed,
      observedUnit: params.observedUnit ?? null,
    });
    if (!cmp.equal) {
      consistency = 'divergent';
      const drift = await writeDrift({
        organizationId: fact.organizationId,
        programId: fact.programId,
        factId: fact.id,
        bindingId: binding.id,
        expectedValue: toCanonicalValue(factView),
        observedValue: observed,
        driftType: (cmp.driftType ?? 'value_mismatch') as
          | 'value_mismatch'
          | 'unit_mismatch'
          | 'stale_source'
          | 'missing_target',
        severity: 'medium',
        detectedBy: 'citation_scan',
      });
      await setBindingStatus(binding.id, 'drifted');
      driftId = drift.id;
    }
  }

  await auditService.logAction({
    tenantId: fact.organizationId,
    userId: params.actor ?? 'system',
    action: 'canonical_fact.section_bound',
    resourceType: 'canonical_fact',
    resourceId: fact.id,
    details: {
      programId: fact.programId,
      entity: fact.entity,
      field: fact.field,
      target,
      bindingKind: kind,
      observedValue: observed,
      consistency,
    },
  });

  return { ok: true, binding, consistency, driftId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-scan an artifact's prose for citations
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanArtifactParams {
  programId: string;
  organizationId: number;
  /** External concept2cure artifact id (artifact_xxx). */
  artifactId: string;
  /** Persist the matched citations as bindings (default false = preview only). */
  persist?: boolean;
  tolerance?: number;
  actor: number | null;
}

export interface ScannedCitation extends CitationMatch {
  target: string;
  bound: boolean;
  driftId: string | null;
}

export interface ScanArtifactResult {
  ok: true;
  artifactId: string;
  target: string;
  persisted: boolean;
  summary: ReturnType<typeof summarizeCitationMatches>;
  citations: ScannedCitation[];
  unmatchedLabels: string[];
}

function activeFactViews(facts: CanonicalFact[]): ActiveFactView[] {
  return facts.map(f => ({
    id: f.id,
    entity: f.entity,
    field: f.field,
    ...factValueView(f),
  }));
}

/** Keep one citation per fact within a section; prefer a divergent one. */
function dedupeByFact(matches: CitationMatch[]): CitationMatch[] {
  const byFact = new Map<string, CitationMatch>();
  for (const m of matches) {
    const existing = byFact.get(m.factId);
    if (!existing || (existing.consistency === 'consistent' && m.consistency === 'divergent')) {
      byFact.set(m.factId, m);
    }
  }
  return [...byFact.values()];
}

/**
 * The shared scan core: extract the labelled numbers from a document's prose,
 * match them to the program's active facts, and (when persisting) bind each
 * match to `target` and flag any that already diverge. Domain-agnostic — the
 * pharma artifact scanner and the device post-market scanner both call it, so a
 * governed value is judged by one rule regardless of document family.
 */
async function scanProseForCitations(params: {
  programId: string;
  organizationId: number;
  target: string;
  prose: string;
  persist?: boolean;
  tolerance?: number;
  actor: number | null;
}): Promise<{ citations: ScannedCitation[]; summary: ReturnType<typeof summarizeCitationMatches>; unmatchedLabels: string[] }> {
  const facts = await listProgramFacts(params.programId);
  const factById = new Map(facts.map(f => [f.id, f]));
  const extracted = extractNumericalFacts(params.prose ?? '');
  const result = matchCitationsToFacts(extracted, activeFactViews(facts), {
    tolerance: params.tolerance,
  });
  const deduped = dedupeByFact(result.matches);

  const citations: ScannedCitation[] = [];
  for (const match of deduped) {
    let bound = false;
    let driftId: string | null = null;
    if (params.persist) {
      const binding = await bindToFact({
        organizationId: params.organizationId,
        programId: params.programId,
        factId: match.factId,
        target: params.target,
        bindingKind: 'mirror',
        observedValue: match.observedValue,
        createdBy: params.actor ?? null,
      });
      bound = true;
      if (match.consistency === 'divergent') {
        const citedFact = factById.get(match.factId);
        const drift = await writeDrift({
          organizationId: params.organizationId,
          programId: params.programId,
          factId: match.factId,
          bindingId: binding.id,
          expectedValue: citedFact ? toCanonicalValue(factValueView(citedFact)) : match.observedValue,
          observedValue: match.observedValue,
          driftType: (match.driftType ?? 'value_mismatch') as
            | 'value_mismatch'
            | 'unit_mismatch'
            | 'stale_source'
            | 'missing_target',
          severity: 'medium',
          detectedBy: 'citation_scan',
        });
        await setBindingStatus(binding.id, 'drifted');
        driftId = drift.id;
      }
    }
    citations.push({ ...match, target: params.target, bound, driftId });
  }

  return {
    citations,
    summary: summarizeCitationMatches({ matches: deduped, unmatchedLabels: result.unmatchedLabels }),
    unmatchedLabels: result.unmatchedLabels,
  };
}

async function auditCitationScan(params: {
  organizationId: number;
  actor: number | null;
  resourceType: string;
  resourceId: string;
  programId: string;
  target: string;
  citations: ScannedCitation[];
}): Promise<void> {
  await auditService.logAction({
    tenantId: params.organizationId,
    userId: params.actor ?? 'system',
    action: 'canonical_fact.citations_bound',
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: {
      programId: params.programId,
      target: params.target,
      boundCount: params.citations.length,
      divergentCount: params.citations.filter(c => c.consistency === 'divergent').length,
    },
  });
}

export async function scanArtifactCitations(
  params: ScanArtifactParams
): Promise<ScanArtifactResult | FactChangeFailure> {
  const [artifact] = await db
    .select({
      artifactId: concept2cureArtifacts.artifactId,
      content: concept2cureArtifacts.content,
      ctdSection: concept2cureArtifacts.ctdSection,
    })
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.artifactId, params.artifactId),
        eq(concept2cureArtifacts.organizationId, params.organizationId)
      )
    )
    .limit(1);
  if (!artifact) return fail('not_found', 'Artifact not found');

  const target = artifact.ctdSection
    ? sectionTarget(artifact.artifactId, artifact.ctdSection)
    : documentTarget(artifact.artifactId);

  const scan = await scanProseForCitations({
    programId: params.programId,
    organizationId: params.organizationId,
    target,
    prose: artifact.content ?? '',
    persist: params.persist,
    tolerance: params.tolerance,
    actor: params.actor,
  });

  if (params.persist) {
    await auditCitationScan({
      organizationId: params.organizationId,
      actor: params.actor,
      resourceType: 'concept2cure_artifact',
      resourceId: artifact.artifactId,
      programId: params.programId,
      target,
      citations: scan.citations,
    });
  }

  return {
    ok: true,
    artifactId: artifact.artifactId,
    target,
    persisted: Boolean(params.persist),
    summary: scan.summary,
    citations: scan.citations,
    unmatchedLabels: scan.unmatchedLabels,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Device / IVD post-market document scanner
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanPostMarketParams {
  /** UUID regulatory program — same namespace as canonical_facts (no legacy bridge). */
  programId: string;
  organizationId: number;
  /** UUID of the post_market_documents row. */
  documentId: string;
  persist?: boolean;
  tolerance?: number;
  actor: number | null;
}

export interface ScanPostMarketResult {
  ok: true;
  documentId: string;
  documentType: string;
  target: string;
  persisted: boolean;
  summary: ReturnType<typeof summarizeCitationMatches>;
  citations: ScannedCitation[];
  unmatchedLabels: string[];
}

/**
 * Scan a device/IVD post-market document (PMS/PSUR/PMCF/SSCP) for citations of
 * the program's governed values. Reads the indexed narrative columns
 * (summary / risks / benefit-risk conclusion). Because post_market_documents is
 * uuid-program-scoped like canonical_facts, this needs no legacy-id bridge — it
 * is the device analogue of scanArtifactCitations and feeds the same drift,
 * freshness (document_section bucket), and source-tracer machinery.
 */
export async function scanPostMarketCitations(
  params: ScanPostMarketParams
): Promise<ScanPostMarketResult | FactChangeFailure> {
  const [doc] = await db
    .select({
      id: postMarketDocuments.id,
      documentType: postMarketDocuments.documentType,
      summary: postMarketDocuments.summary,
      risksIdentified: postMarketDocuments.risksIdentified,
      benefitRiskConclusion: postMarketDocuments.benefitRiskConclusion,
    })
    .from(postMarketDocuments)
    .where(
      and(
        eq(postMarketDocuments.id, params.documentId),
        eq(postMarketDocuments.organizationId, params.organizationId),
        eq(postMarketDocuments.programId, params.programId)
      )
    )
    .limit(1);
  if (!doc) return fail('not_found', 'Post-market document not found');

  const prose = [doc.summary, doc.risksIdentified, doc.benefitRiskConclusion]
    .filter(Boolean)
    .join('\n\n');
  const target = documentTarget(doc.id);

  const scan = await scanProseForCitations({
    programId: params.programId,
    organizationId: params.organizationId,
    target,
    prose,
    persist: params.persist,
    tolerance: params.tolerance,
    actor: params.actor,
  });

  if (params.persist) {
    await auditCitationScan({
      organizationId: params.organizationId,
      actor: params.actor,
      resourceType: 'post_market_document',
      resourceId: doc.id,
      programId: params.programId,
      target,
      citations: scan.citations,
    });
  }

  return {
    ok: true,
    documentId: doc.id,
    documentType: doc.documentType,
    target,
    persisted: Boolean(params.persist),
    summary: scan.summary,
    citations: scan.citations,
    unmatchedLabels: scan.unmatchedLabels,
  };
}
