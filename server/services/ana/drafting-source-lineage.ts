/**
 * Source lineage for AnA-drafted section text (ledger L154).
 *
 * The human authoring path parks the chunks that grounded a draft and, on
 * accept, records a verified quote span for every clause the text took from a
 * source (`enforceSourceAndAuthorLineage`). The executor's drafting tools used
 * to carry only `content`, so an AnA-written body could record who was
 * responsible for it but never what it was taken from.
 *
 * This module is the executor's half of the same gate. A drafting tool call may
 * carry `sources: [{ evidence_source_id | artifact_id, excerpt, title? }]` —
 * the passages the model grounded the text in, as `project_knowledge_search`
 * returned them. They are resolved to canonical `cre_evidence_sources` rows
 * through the ONE resolver the human route uses, and only sources that exist
 * and belong to the tenant survive; everything else is dropped and NAMED in
 * the tool result, never mapped to a guessed id. The resolved list is then
 * handed to the same lineage gate the human accept route calls, inside the
 * same transaction as the content write.
 *
 * Honesty rule: a source the model cites that cannot be resolved is not a
 * reason to fail the write (the text is still attributed to its author), but
 * it is never silently accepted either — the caller reports it as dropped so
 * the model and the reader both know the text is author-attributed there.
 */
import { resolveEvidenceSourceIdsByArtifact } from '../clinical-regulatory-evidence/retrieval-source-link';
import type { Queryable } from '../clinical-regulatory-evidence/span-lineage.service';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';

export interface DroppedDraftSource {
  /** Position in the tool call's `sources` array. */
  index: number;
  reason: string;
}

export interface ResolvedDraftSources {
  /** Sources that exist, belong to the tenant, and carry an excerpt to quote against. */
  sources: RetrievedSource[];
  /** Entries that were not usable, each with the reason — reported, never hidden. */
  dropped: DroppedDraftSource[];
}

/** What a drafting tool accepts per source. Both id forms are what retrieval returns. */
interface RawDraftSource {
  evidence_source_id?: unknown;
  artifact_id?: unknown;
  excerpt?: unknown;
  title?: unknown;
}

const CRE_SOURCE_PREFIX = 'cre_source:';

/**
 * Resolve a drafting tool's `sources` input to the lineage gate's shape.
 *
 * @param orgId The tenant whose sources may be cited (numeric org id).
 * @param raw   The tool call's `sources` value, unvalidated.
 * @param exec  The transaction client of the content write, so the visibility
 *              check and the write see the same snapshot.
 */
export async function resolveDraftSources(
  orgId: number,
  raw: unknown,
  exec: Queryable,
): Promise<ResolvedDraftSources> {
  const dropped: DroppedDraftSource[] = [];
  if (raw == null) return { sources: [], dropped };
  if (!Array.isArray(raw)) {
    return { sources: [], dropped: [{ index: -1, reason: 'sources must be an array' }] };
  }
  // Every id goes through the resolver in the form it verifies: a numeric
  // evidence-source id as `cre_source:<id>` (existence + tenant ownership are
  // checked, the number is never trusted blind), an artifact id as itself.
  const keyed: Array<{ index: number; key: string; excerpt: string; title: string | null }> = [];
  raw.forEach((entry, index) => {
    const e = (entry ?? {}) as RawDraftSource;
    const excerpt = typeof e.excerpt === 'string' ? e.excerpt.trim() : '';
    if (!excerpt) {
      dropped.push({ index, reason: 'no excerpt — a source is cited by the text it contributed, and none was given' });
      return;
    }
    let key: string | null = null;
    if (Number.isInteger(e.evidence_source_id) && (e.evidence_source_id as number) > 0) {
      key = `${CRE_SOURCE_PREFIX}${e.evidence_source_id}`;
    } else if (typeof e.artifact_id === 'string' && e.artifact_id.trim().length > 0) {
      key = e.artifact_id.trim();
    }
    if (!key) {
      dropped.push({ index, reason: 'no evidence_source_id or artifact_id' });
      return;
    }
    keyed.push({ index, key, excerpt, title: typeof e.title === 'string' ? e.title : null });
  });
  if (keyed.length === 0) return { sources: [], dropped };

  const resolved = await resolveEvidenceSourceIdsByArtifact(orgId, keyed.map((k) => k.key), exec);
  const sources: RetrievedSource[] = [];
  for (const k of keyed) {
    const id = resolved.get(k.key);
    if (id === undefined) {
      dropped.push({ index: k.index, reason: 'not a Data Room source visible to this organization' });
      continue;
    }
    sources.push({ sourceId: id, content: k.excerpt, title: k.title });
  }
  return { sources, dropped };
}

/**
 * Resolve retrieval hits to evidence-source ids for the model to cite back.
 * Returns a map keyed by the raw retrieval id; ids with no canonical source are
 * absent (the passage is still returned to the model, just not citable).
 */
export async function evidenceSourceIdsForRetrieval(
  orgId: number,
  rawIds: readonly (string | null | undefined)[],
  exec?: Queryable,
): Promise<Map<string, number>> {
  const ids = rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (ids.length === 0) return new Map();
  return exec
    ? resolveEvidenceSourceIdsByArtifact(orgId, ids, exec)
    : resolveEvidenceSourceIdsByArtifact(orgId, ids);
}

/** What a drafting tool reports about the lineage it recorded — never more than it did. */
export interface DraftLineageReport {
  citedSources: number;
  quotedSpans: number;
  authorSpans: number;
  /** Share of the text's clauses recorded as verbatim quotes of a cited source (0–1). */
  quotedCoverage: number;
  sourcesDropped: DroppedDraftSource[];
  note: string;
}

export function describeDraftLineage(
  gate: { sourceSpans: number; authorSpans: number; distinctSources: number; coverage: number } | null,
  sources: RetrievedSource[],
  dropped: DroppedDraftSource[],
): DraftLineageReport {
  const citedSources = gate?.distinctSources ?? 0;
  const quotedSpans = gate?.sourceSpans ?? 0;
  const quotedCoverage = gate?.coverage ?? 0;
  let note: string;
  if (sources.length === 0 && dropped.length === 0) {
    note = 'No sources were cited: every clause is recorded as the author\'s own assertion.';
  } else if (sources.length === 0) {
    note = 'None of the cited sources could be used, so every clause is recorded as the author\'s own assertion.';
  } else if (quotedSpans === 0) {
    note =
      'Sources were cited but no clause of the text quotes any of them verbatim, so every clause is recorded as the author\'s own assertion; only checkable quotes earn a source citation.';
  } else {
    note = `${quotedSpans} clause(s) recorded as verbatim quotes of ${citedSources} source(s); the rest as the author's own assertions.`;
  }
  if (dropped.length > 0) note += ` ${dropped.length} cited source(s) were dropped — see sourcesDropped.`;
  return {
    citedSources,
    quotedSpans,
    authorSpans: gate?.authorSpans ?? 0,
    quotedCoverage,
    sourcesDropped: dropped,
    note,
  };
}
