/**
 * IVD knowledge base — shared types.
 *
 * A curated, citable, in-code intelligence corpus for in-vitro diagnostics,
 * mirroring the named/sourced pattern of server/services/ectd/validation-rule-
 * corpus.ts. Each entry is a self-contained, defensible knowledge unit carrying
 * its regulatory/scientific/legal citations so the platform (and AnA) can quote
 * a source rather than improvise.
 *
 * The corpus is intentionally static TypeScript (not a DB seed): it is
 * version-controlled, unit-tested for structural invariants, and consumed
 * directly by the knowledge service, the /api/ivd-knowledge routes, and an AnA
 * citation tool.
 */

export type KnowledgeDomain = 'regulatory' | 'scientific' | 'legal' | 'standard';

export type Jurisdiction =
  | 'US'
  | 'EU'
  | 'UK'
  | 'JP'
  | 'CN'
  | 'BR'
  | 'CA'
  | 'AU'
  | 'global';

/** A product family an entry applies to. */
export type AppliesTo = 'ivd' | 'cdx' | 'samd' | 'ldt' | 'ruo' | 'device';

export interface Citation {
  /** Human-readable pin-cite, e.g. "21 CFR 809.10(b)" or "IVDR Annex VIII, Rule 3". */
  label: string;
  /** Issuing authority / body, e.g. "FDA", "EU", "ISO", "CLSI", "US Supreme Court". */
  source: string;
  /** Stable canonical URL when one is known. Optional by design. */
  url?: string;
}

/** A quantitative or design expectation (used mostly by scientific entries). */
export interface AcceptanceCriterion {
  metric: string;
  typical: string;
  note?: string;
}

export interface KnowledgeEntry {
  /** Stable dotted slug, e.g. "fda.ivd.510k-pathway". */
  id: string;
  domain: KnowledgeDomain;
  /** Grouping within a domain, e.g. "premarket-pathway", "analytical-performance". */
  topic: string;
  title: string;
  jurisdictions: Jurisdiction[];
  appliesTo: AppliesTo[];
  /** 1–3 sentence executive summary. */
  summary: string;
  /** Deep, multi-paragraph explanation — the substance of the entry. */
  detail: string;
  /** Crisp, scannable takeaways. */
  keyPoints: string[];
  /** Quantitative/design acceptance expectations (scientific entries). */
  criteria?: AcceptanceCriterion[];
  /** Common failure modes / reviewer objections. */
  pitfalls?: string[];
  citations: Citation[];
  /** ids of related entries for graph traversal. */
  related?: string[];
  tags: string[];
  /** ISO date this entry's content was last reviewed for accuracy. */
  lastReviewed: string;
}

/** Narrow a loose string to a KnowledgeDomain. */
export function isKnowledgeDomain(v: string): v is KnowledgeDomain {
  return v === 'regulatory' || v === 'scientific' || v === 'legal' || v === 'standard';
}
