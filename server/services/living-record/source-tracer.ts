/**
 * Living Record Spine — Source Tracer.
 *
 * Walks the declared spine chain end-to-end and resolves every hop to its
 * actual row — the walk the object model promises but no traversal exposed:
 *
 *   cited location (fact_binding target)
 *     → canonical fact (the governed value)
 *       → establishing claim (canonical_facts.established_by_claim_id)
 *         → source artifact (evidence_sources: file, page count, hash)
 *
 * traceClaimEvidence (regulatory-graph.service) stops at the claim and returns
 * evidence_sources ids unresolved; this module resolves them, in both
 * directions: from a fact outward to every citation, and from a single
 * citation back to the source artifact.
 *
 * Read-only. See docs/architecture/LIVING_RECORD_SPINE.md §3.6.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { evidenceClaims, evidenceSources } from '../../../shared/schema';
import { factBindings, type CanonicalFact, type FactBinding } from '../../../shared/schema/living-record-spine';
import { getFact } from './canonical-fact-store';
import { claimIdFromTarget } from './object-model';

// ─────────────────────────────────────────────────────────────────────────────
// Safe projections (what the API returns for each hop)
// ─────────────────────────────────────────────────────────────────────────────

export interface TracedClaim {
  id: number;
  claimText: string;
  claimType: string;
  status: string;
  verification: string;
  entity: string | null;
  field: string | null;
  valueNum: string | null;
  valueText: string | null;
  unit: string | null;
  pageNumber: number | null;
  sectionReference: string | null;
  sourceId: number;
  sourceDocument: string | null;
  sourcePath: string | null;
  canonicalFactId: string | null;
}

export interface TracedSource {
  id: number;
  title: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  pageCount: number | null;
  contentHash: string;
  version: number;
  isCurrent: boolean;
}

const CLAIM_COLUMNS = {
  id: evidenceClaims.id,
  claimText: evidenceClaims.claimText,
  claimType: evidenceClaims.claimType,
  status: evidenceClaims.status,
  verification: evidenceClaims.verification,
  entity: evidenceClaims.entity,
  field: evidenceClaims.field,
  valueNum: evidenceClaims.valueNum,
  valueText: evidenceClaims.valueText,
  unit: evidenceClaims.unit,
  pageNumber: evidenceClaims.pageNumber,
  sectionReference: evidenceClaims.sectionReference,
  sourceId: evidenceClaims.sourceId,
  sourceDocument: evidenceClaims.sourceDocument,
  sourcePath: evidenceClaims.sourcePath,
  canonicalFactId: evidenceClaims.canonicalFactId,
} as const;

const SOURCE_COLUMNS = {
  id: evidenceSources.id,
  title: evidenceSources.title,
  sourceType: evidenceSources.sourceType,
  fileName: evidenceSources.fileName,
  fileUrl: evidenceSources.fileUrl,
  pageCount: evidenceSources.pageCount,
  contentHash: evidenceSources.contentHash,
  version: evidenceSources.version,
  isCurrent: evidenceSources.isCurrent,
} as const;

async function loadClaims(claimIds: number[], organizationId: number): Promise<Map<number, TracedClaim>> {
  if (claimIds.length === 0) return new Map();
  const rows = await db
    .select(CLAIM_COLUMNS)
    .from(evidenceClaims)
    .where(and(inArray(evidenceClaims.id, claimIds), eq(evidenceClaims.organizationId, organizationId)));
  return new Map(rows.map(r => [r.id, r as TracedClaim]));
}

async function loadSources(sourceIds: number[], organizationId: number): Promise<Map<number, TracedSource>> {
  if (sourceIds.length === 0) return new Map();
  const rows = await db
    .select(SOURCE_COLUMNS)
    .from(evidenceSources)
    .where(and(inArray(evidenceSources.id, sourceIds), eq(evidenceSources.organizationId, organizationId)));
  return new Map(rows.map(r => [r.id, r as TracedSource]));
}

/** The establishing hop: the claim that set the value and where it came from. */
function establishingFrom(
  fact: CanonicalFact | null,
  claims: Map<number, TracedClaim>
): { claim: TracedClaim | null; sourceId: number | null } {
  const claim = fact?.establishedByClaimId ? (claims.get(fact.establishedByClaimId) ?? null) : null;
  return { claim, sourceId: fact?.establishedBySourceId ?? claim?.sourceId ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fact → establishing claim → source artifact + every citation
// ─────────────────────────────────────────────────────────────────────────────

export interface TracedCitation {
  binding: FactBinding;
  /** Resolved when the target is a claim pointer. */
  claim: TracedClaim | null;
  /** The claim's own source artifact, resolved. */
  claimSource: TracedSource | null;
}

export interface FactSourceTrace {
  ok: true;
  fact: CanonicalFact;
  /** The claim that established the governed value, resolved. */
  establishingClaim: TracedClaim | null;
  /** The source artifact the value came from, resolved (file, pages, hash). */
  establishingSource: TracedSource | null;
  /** Every location that cites the value, each resolved back to its source. */
  citations: TracedCitation[];
  /**
   * Claim ids this fact referenced that the claim store did not return.
   *
   * A trace with nulls everywhere reads as "this value has no evidence". That
   * is only one of the reasons it can happen — the others are that the claim
   * was deleted, belongs to another tenant, or that the claim store holds
   * nothing at all, which is currently true of `evidence_claims`: it has no
   * writer anywhere in the repository (GA ledger L22). Those are different
   * answers and a reviewer is entitled to know which one they got.
   *
   * Empty means every referenced claim resolved. Non-empty means the trail is
   * broken, not absent.
   */
  unresolvedClaimIds: number[];
  /** True when the fact referenced claims and NONE of them resolved — the
   *  signature of an unpopulated claim store rather than an unsupported fact. */
  claimStoreUnavailable: boolean;
}

export interface TraceFailure {
  ok: false;
  code: 'not_found';
  message: string;
}

export async function traceFactToSource(
  factId: string,
  organizationId: number
): Promise<FactSourceTrace | TraceFailure> {
  const fact = await getFact(factId);
  if (!fact || fact.organizationId !== organizationId) {
    return { ok: false, code: 'not_found', message: 'Fact not found' };
  }

  const bindings = await db.select().from(factBindings).where(eq(factBindings.factId, fact.id));

  const citationClaimIds = bindings
    .map(b => claimIdFromTarget(b.target))
    .filter((id): id is number => id !== null);
  const claimIds = [...new Set([...citationClaimIds, ...(fact.establishedByClaimId ? [fact.establishedByClaimId] : [])])];
  const claims = await loadClaims(claimIds, organizationId);
  const establishing = establishingFrom(fact, claims);

  const citationSourceIds = citationClaimIds
    .map(cid => claims.get(cid)?.sourceId)
    .filter((id): id is number => typeof id === 'number');
  const sourceIds = [...new Set([establishing.sourceId, ...citationSourceIds])].filter(
    (id): id is number => typeof id === 'number'
  );
  const sources = await loadSources(sourceIds, organizationId);

  const citations: TracedCitation[] = bindings.map(binding => {
    const cid = claimIdFromTarget(binding.target);
    const claim = cid !== null ? (claims.get(cid) ?? null) : null;
    return {
      binding,
      claim,
      claimSource: claim ? (sources.get(claim.sourceId) ?? null) : null,
    };
  });

  /* Referenced-but-missing claims. Computed rather than inferred from the
     nulls above, because "no claims referenced" and "every referenced claim
     missing" produce identical nulls and mean opposite things. */
  const unresolvedClaimIds = claimIds.filter((id) => !claims.has(id));

  return {
    ok: true,
    fact,
    establishingClaim: establishing.claim,
    establishingSource:
      establishing.sourceId !== null ? (sources.get(establishing.sourceId) ?? null) : null,
    citations,
    unresolvedClaimIds,
    claimStoreUnavailable: claimIds.length > 0 && claims.size === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Citation → fact → establishing claim → source artifact (the reverse walk)
// ─────────────────────────────────────────────────────────────────────────────

export interface BindingSourceTrace {
  ok: true;
  binding: FactBinding;
  fact: CanonicalFact | null;
  /** The claim at the cited location, when the target is a claim pointer. */
  citingClaim: TracedClaim | null;
  /** The citing claim's own source artifact. */
  citingClaimSource: TracedSource | null;
  establishingClaim: TracedClaim | null;
  establishingSource: TracedSource | null;
}

export async function traceBindingToSource(
  bindingId: string,
  organizationId: number
): Promise<BindingSourceTrace | TraceFailure> {
  const [binding] = await db
    .select()
    .from(factBindings)
    .where(and(eq(factBindings.id, bindingId), eq(factBindings.organizationId, organizationId)))
    .limit(1);
  if (!binding) {
    return { ok: false, code: 'not_found', message: 'Binding not found' };
  }

  const fact = await getFact(binding.factId);
  const citingClaimId = claimIdFromTarget(binding.target);
  const claimIds = [
    ...new Set(
      [citingClaimId, fact?.establishedByClaimId ?? null].filter((id): id is number => id !== null)
    ),
  ];
  const claims = await loadClaims(claimIds, organizationId);
  const citingClaim = citingClaimId !== null ? (claims.get(citingClaimId) ?? null) : null;
  const establishing = establishingFrom(fact, claims);

  const sourceIds = [
    ...new Set(
      [citingClaim?.sourceId, establishing.sourceId].filter((id): id is number => typeof id === 'number')
    ),
  ];
  const sources = await loadSources(sourceIds, organizationId);

  return {
    ok: true,
    binding,
    fact,
    citingClaim,
    citingClaimSource: citingClaim ? (sources.get(citingClaim.sourceId) ?? null) : null,
    establishingClaim: establishing.claim,
    establishingSource:
      establishing.sourceId !== null ? (sources.get(establishing.sourceId) ?? null) : null,
  };
}
