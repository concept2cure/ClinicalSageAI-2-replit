/**
 * Knowledge Card — the structured, dated, provenance-bearing unit of learning.
 *
 * Raw regulatory documents do not make AnA smarter; *distilled, diffed, dated
 * facts* do. A KnowledgeCard is what the distiller produces from one harvested
 * item: a single normalised statement of "what changed", tagged with the
 * standard it touches, the jurisdictions it governs, its effective date, and a
 * link to the source it was grounded in.
 *
 * Cards are versioned by a content hash (FNV-1a, mirroring the deterministic
 * corpus-version hashing already used across the citable corpora) so the same
 * underlying change ingested twice de-duplicates instead of piling up.
 */

import type { ClientSegment } from '../ana-ri/industry-wisdom-pack.js';
import type { Jurisdiction, StandardBody } from './regulatory-horizon-sources.js';

/** Lifecycle of a card within the learning loop. */
export type CardStatus = 'pending' | 'promoted' | 'quarantined' | 'superseded';

/** What kind of change the source reported. Drives the promotion policy. */
export type CardChangeKind =
  | 'new_guideline' // a standard/guidance that did not exist before — always human review
  | 'revision' // a new revision/step of an existing standard
  | 'draft_for_consultation' // draft / step 2 open for comment
  | 'effective_date' // an in-force / applicability date announced
  | 'withdrawal' // a standard withdrawn/superseded — always human review
  | 'press' // press release / general news, no rule change
  | 'other';

export interface KnowledgeCard {
  /** Stable id derived from source + standard + publishedAt (dedupe key). */
  id: string;
  /** Source registry id this card was harvested from. */
  sourceId: string;
  body: StandardBody;
  /** Region(s) this change governs. 'global' when harmonised. */
  jurisdictions: Jurisdiction[];
  /** Canonical standard code where resolvable (e.g. 'E6(R3)', 'ISO 14155'). */
  standardCode?: string;
  title: string;
  changeKind: CardChangeKind;
  /** Distilled, plain-language "what changed and why it matters". */
  summary: string;
  /** ISO date the change takes/took effect, if stated. */
  effectiveDate?: string;
  /** ISO date the source published it, if known. */
  publishedAt?: string;
  /** Standard code this change supersedes, if any. */
  supersedes?: string;
  segments: ClientSegment[];
  topics: string[];
  /** Provenance URL — every card must be traceable to its source. */
  url: string;
  /** Distiller's self-assessed confidence (0..1). */
  confidence: number;
  /** Whether the summary's claims were judged grounded in the source text. */
  grounded: boolean;
  status: CardStatus;
  /** ISO timestamp the card entered the pipeline. */
  ingestedAt: string;
  /** Content hash for dedupe/versioning. */
  hash: string;
}

/** Fields a distiller fills; id/hash/ingestedAt/status are assigned by `makeCard`. */
export type CardDraft = Omit<KnowledgeCard, 'id' | 'hash' | 'ingestedAt' | 'status'>;

/** FNV-1a 32-bit, rendered hex — same family as the corpus version hash. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 to keep it unsigned before hex.
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable identity: same body+standard+date+source collapses to one card. */
export function cardId(draft: Pick<CardDraft, 'sourceId' | 'body' | 'standardCode' | 'publishedAt' | 'title'>): string {
  const key = [
    draft.sourceId,
    draft.body,
    draft.standardCode ?? '',
    draft.publishedAt ?? '',
    draft.title,
  ]
    .join('|')
    .toLowerCase();
  return `kc_${fnv1a(key)}`;
}

/** Content hash — changes when the substance of the card changes (re-review trigger). */
export function cardHash(draft: CardDraft): string {
  const key = [
    draft.standardCode ?? '',
    draft.changeKind,
    draft.summary,
    draft.effectiveDate ?? '',
    draft.supersedes ?? '',
  ]
    .join('|')
    .toLowerCase();
  return fnv1a(key);
}

/** Assemble a full card from a distilled draft, assigning identity/hash/status. */
export function makeCard(draft: CardDraft, now: Date = new Date()): KnowledgeCard {
  return {
    ...draft,
    id: cardId(draft),
    hash: cardHash(draft),
    ingestedAt: now.toISOString(),
    status: 'pending',
  };
}
