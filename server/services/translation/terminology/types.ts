/**
 * Bilingual terminology corpus — entry contract for domain modules.
 *
 * This module pins the EXACT data shape every domain corpus module must produce
 * so authors across domains stay mutually consistent and the corpus maps cleanly
 * onto the persisted glossary contract later.
 *
 * Relationship to the glossary contract (the source of truth this defers to):
 *  - `category` reuses the real GlossaryCategory union from the shared contract
 *    (shared/types/translation.ts, re-exported by the translation service's
 *    types.ts). We DO NOT redefine it here — a corpus entry's category must be a
 *    valid GlossaryCategory so it can become a GlossaryTerm / glossary_terms row.
 *  - `source` ⇒ GlossaryTerm.sourceTerm / glossary_terms.source_term.
 *  - `target` ⇒ GlossaryTerm.targetTerm / glossary_terms.target_term (null for
 *    pure DNT identifiers, mirroring `doNotTranslate`).
 *  - `doNotTranslate` ⇒ GlossaryTerm.doNotTranslate / glossary_terms.do_not_translate.
 *
 * The corpus adds authoring/provenance metadata the persisted row does not carry
 * (`domain`, `sourceRef`, `verificationStatus`, `notes`) so domain authors can be
 * held to a review gate before an entry is promoted into a tenant glossary.
 *
 * Pure data contract: this module declares types only — no runtime side effects.
 *
 * @module server/services/translation/terminology/types
 */

import type { GlossaryCategory } from '../types';

// Re-export so domain modules have a single import surface for both the entry
// shape AND the category union, without reaching across into the shared contract.
export type { GlossaryCategory };

/**
 * Review state of a corpus entry. An entry is `'unverified'` when first authored,
 * `'needs_review'` once flagged for a domain reviewer, and `'verified'` only after
 * a reviewer has signed off. Promotion of an entry into a tenant glossary should
 * gate on `'verified'`.
 */
export type TerminologyVerificationStatus = 'unverified' | 'needs_review' | 'verified';

/**
 * A single bilingual terminology entry authored in a domain corpus module.
 *
 * Field order and names are FIXED so every domain module produces mutually
 * consistent entries that map cleanly onto GlossaryTerm / glossary_terms.
 */
export interface TerminologyEntry {
  /** Canonical English source term. Maps to GlossaryTerm.sourceTerm. */
  source: string;
  /**
   * Mandated target rendering, or `null` for a pure do-not-translate identifier
   * (where the target is irrelevant). Maps to GlossaryTerm.targetTerm.
   */
  target: string | null;
  /** Authoring domain this entry belongs to (e.g. the domain module's key). */
  domain: string;
  /**
   * DNT / glossary category — the REAL GlossaryCategory union from the shared
   * contract. Constrains the entry to a category the glossary engine understands.
   */
  category: GlossaryCategory;
  /**
   * True for do-not-translate identifiers (citations, agency names, codes, INN /
   * drug names, MedDRA terms, …) that must be masked before MT and restored
   * verbatim. When true, `target` is conventionally `null`.
   */
  doNotTranslate: boolean;
  /**
   * Provenance pointer for the term — the authority/source the term was drawn
   * from (e.g. an ICH guideline id, a MedDRA version, a style-guide reference).
   */
  sourceRef: string;
  /** Review state; gates promotion into a tenant glossary. */
  verificationStatus: TerminologyVerificationStatus;
  /** Optional free-text authoring note (rationale, caveats, usage). */
  notes?: string;
}

/**
 * A domain corpus module's public shape: a domain key plus its typed, read-only
 * array of entries. Each file under `terminology/domains/<domain>.ts` exports a
 * `DomainTerminologyModule` (or at minimum the `entries` array) so a registry can
 * aggregate domains without knowing each file individually.
 */
export interface DomainTerminologyModule {
  /** Stable domain key; should match the entries' `domain` field and filename. */
  domain: string;
  /** The domain's terminology entries. */
  entries: readonly TerminologyEntry[];
}
