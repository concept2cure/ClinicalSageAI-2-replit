/**
 * MDX regulatory lifecycle phases and task-link vocabulary — MDX-TASK-01.
 *
 * The phase a task sits in, and the shape of the relationship between a task and
 * the study, deliverable, filing, requirement or commitment it advances.
 *
 * Kept here, pure, so the board, the project cockpit and any writer agree on the
 * same values. A phase that means one thing on a card and another in a filter is
 * worse than no phase at all.
 *
 * @module shared/regulatory/mdx-lifecycle
 */

/**
 * Where a piece of work sits in the regulatory lifecycle.
 *
 * Ordered, because the board groups by it and "Postmarket" before "Design" reads
 * as noise. The order is the normal progression, not a workflow the platform
 * enforces — real programmes run phases concurrently, and nothing here prevents
 * that.
 */
export const LIFECYCLE_PHASES = [
  'strategy',
  'design',
  'verification',
  'clinical_performance_evidence',
  'submission_preparation',
  'authority_review',
  'market_authorization',
  'postmarket',
] as const;
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export const LIFECYCLE_PHASE_LABEL: Record<LifecyclePhase, string> = {
  strategy: 'Strategy',
  design: 'Design',
  verification: 'Verification',
  clinical_performance_evidence: 'Clinical / Performance Evidence',
  submission_preparation: 'Submission Preparation',
  authority_review: 'Authority Review',
  market_authorization: 'Market Authorization',
  postmarket: 'Postmarket',
};

/** Sort key for a phase; unclassified sorts last rather than first. */
export function lifecyclePhaseRank(phase: string | null | undefined): number {
  if (!phase) return LIFECYCLE_PHASES.length;
  const i = (LIFECYCLE_PHASES as readonly string[]).indexOf(phase);
  return i === -1 ? LIFECYCLE_PHASES.length : i;
}

export function isLifecyclePhase(v: unknown): v is LifecyclePhase {
  return typeof v === 'string' && (LIFECYCLE_PHASES as readonly string[]).includes(v);
}

/** What kind of thing a task is linked to. */
export const LINK_ENTITY_TYPES = [
  'study', 'deliverable', 'filing', 'requirement', 'commitment', 'work_package', 'decision',
] as const;
export type LinkEntityType = (typeof LINK_ENTITY_TYPES)[number];

/**
 * How the task relates to that thing.
 *
 * `blocks` is the one that earns its place: it is what lets a card say "Blocks FDA
 * Analytical Performance and IVDR PER" instead of showing a due date and leaving
 * the reader to work out why it matters.
 */
export const LINK_RELATIONSHIPS = [
  'supports', 'blocks', 'evidence_for', 'satisfies', 'derived_from',
] as const;
export type LinkRelationship = (typeof LINK_RELATIONSHIPS)[number];

/**
 * Whether a task may be shown to a client user.
 *
 * `internal` is the default everywhere. Releasing work to a client is an act, and
 * a default of visible would publish internal regulatory strategy by omission —
 * the failure mode being guarded against is a staffing note or a privileged
 * analysis appearing in a client review room because nobody set a flag.
 */
export const CLIENT_VISIBILITY = [
  'internal', 'client_visible', 'client_action_required', 'authority_ready',
] as const;
export type ClientVisibility = (typeof CLIENT_VISIBILITY)[number];

export function isClientVisible(v: string | null | undefined): boolean {
  return v === 'client_visible' || v === 'client_action_required' || v === 'authority_ready';
}

export interface TaskRegulatoryLinkView {
  entityType: LinkEntityType;
  entityId: string;
  entityLabel: string | null;
  relationship: LinkRelationship;
  market: string | null;
  pathway: string | null;
  filingType: string | null;
  filingSection: string | null;
}

/**
 * One line describing what a task blocks, for a card.
 *
 * Returns null when nothing is blocked — an empty string would render as a blank
 * row that looks like missing data rather than an absent relationship.
 */
export function describeBlocking(links: TaskRegulatoryLinkView[]): string | null {
  const blocking = links.filter(l => l.relationship === 'blocks');
  if (blocking.length === 0) return null;
  const names = blocking.map(l => {
    const base = l.entityLabel ?? l.entityId;
    return l.filingSection ? `${base} ${l.filingSection}` : base;
  });
  if (names.length === 1) return `Blocks ${names[0]}`;
  return `Blocks ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default {
  LIFECYCLE_PHASES, LIFECYCLE_PHASE_LABEL, lifecyclePhaseRank, isLifecyclePhase,
  LINK_ENTITY_TYPES, LINK_RELATIONSHIPS, CLIENT_VISIBILITY, isClientVisible,
  describeBlocking,
};
