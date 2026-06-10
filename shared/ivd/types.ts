/**
 * IVD knowledge base — shared types (single source of truth).
 *
 * Canonical, client-importable type contract for the IVD knowledge corpus.
 * The server consumes these via server/services/ivd-knowledge/types.ts (which
 * re-exports this module), and the frontend imports them directly from
 * '@shared/ivd/types' — so server and UI never drift.
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
