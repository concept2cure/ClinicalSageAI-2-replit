/**
 * The shape of a platform-library skill, as its author writes it and as the
 * registry serves it.
 *
 * A library skill is code: it ships with a release, is reviewed in the change
 * that adds it, and is identified at run time by its key, its version and the
 * hash of its content. That hash is what each turn records, so "which method
 * did AnA follow for this draft" has one answer even after the text changes.
 *
 * @module server/services/ana/skills/types
 */

import type {
  ClientSegmentId,
  CanonicalRegion,
  SkillDiscipline,
  SkillFacets,
  SkillReviewState,
  SkillUseCase,
  TherapeuticArea,
} from '../../../../shared/ana/skills.js';
import type { StandardId } from '../../../../shared/regulatory/standards-registry.js';

/**
 * What a skill cites. Every kind is checked against the record it names
 * (library.test.ts): a standard against the standards registry, an ICH code
 * against the ICH guideline corpus AnA's lookup reads, a currency fact against
 * the regulatory-currency registry (the reviewed source of what is in force,
 * decision P-9), a profile against the therapeutic-area registry and a record
 * against the repository. An FDA guidance is never a reference: no reviewed
 * index of them exists, so a skill tells AnA to look one up instead.
 */
export type LibrarySkillReference =
  | { kind: 'standard'; id: StandardId }
  | { kind: 'ich'; id: string }
  | { kind: 'currency-fact'; id: string }
  | { kind: 'ta-profile'; id: TherapeuticArea }
  | { kind: 'record'; id: string; label: string };

export interface LibrarySkillReview {
  state: SkillReviewState;
  /** What was and was not checked, in plain words. */
  note: string;
  /** Named reviewer and date, only when `state` is `reviewed`. */
  reviewedBy?: string;
  reviewedOn?: string;
}

/** A skill as its author writes it in a library module. */
export interface LibrarySkillSource extends SkillFacets {
  key: string;
  name: string;
  /** When to use it, in one or two sentences. Shown in Settings. */
  description: string;
  /** Lowercase phrases whose presence in a question signals the need. */
  triggers: string[];
  /** AnA tools the method routes to, by registry name. */
  tools: string[];
  references: LibrarySkillReference[];
  /** The method, in Markdown. */
  instructions: string;
  /** Raised whenever the instructions change in substance. */
  version: number;
  review: LibrarySkillReview;
}

/** A library skill as the registry serves it. */
export interface LibrarySkill extends LibrarySkillSource {
  parent: string | null;
  /** sha256 of the content, canonical JSON; recorded with every turn. */
  contentHash: string;
}

/** The review note every first-wave skill carries until a reviewer reads it. */
export const UNREVIEWED_FIRST_WAVE: LibrarySkillReview = {
  state: 'unreviewed',
  note:
    'Written for the platform on 2026-10-22 from working knowledge of the cited guidance. ' +
    'Not yet read against the source documents by a named regulatory reviewer.',
};

/** Author input: facets default to "any", review to the first-wave note. */
export type LibrarySkillInput = Omit<
  LibrarySkillSource,
  'segments' | 'therapeuticAreas' | 'regions' | 'submissionTypes' | 'surfaces' | 'documentTypes' | 'review' | 'version' | 'references' | 'tools'
> & {
  disciplines: SkillDiscipline[];
  useCases: SkillUseCase[];
  segments?: ClientSegmentId[];
  therapeuticAreas?: TherapeuticArea[];
  regions?: CanonicalRegion[];
  submissionTypes?: string[];
  surfaces?: string[];
  documentTypes?: string[];
  tools?: string[];
  references?: LibrarySkillReference[];
  version?: number;
  review?: LibrarySkillReview;
};

/** Fill the defaults an author may leave out. */
export function skill(input: LibrarySkillInput): LibrarySkillSource {
  return {
    ...input,
    segments: input.segments ?? [],
    therapeuticAreas: input.therapeuticAreas ?? [],
    regions: input.regions ?? [],
    submissionTypes: input.submissionTypes ?? [],
    surfaces: input.surfaces ?? [],
    documentTypes: input.documentTypes ?? [],
    tools: input.tools ?? [],
    references: input.references ?? [],
    version: input.version ?? 1,
    review: input.review ?? UNREVIEWED_FIRST_WAVE,
    instructions: input.instructions.trim(),
  };
}
