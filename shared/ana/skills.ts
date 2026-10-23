/**
 * AnA skills — the vocabulary a skill is filed under, one definition for the
 * server (library, selector, admin API) and the Skills section of Settings.
 *
 * A skill is a method AnA follows for a kind of work: what to establish first,
 * which engine or record answers each part, what to check before answering, and
 * what she does not do. It is never a source of figures or verdicts — those
 * come from the deterministic engines a skill routes to (CLAUDE.md Rule 2).
 *
 * Skills come from two places:
 *   - the platform library, shipped in code and versioned with releases
 *     (server/services/ana/skills/library/);
 *   - an organization's own skills, written by its administrators. Those are
 *     account skill bundles (account_skill_bundles), the store that already
 *     held "how this account does X"; this vocabulary completes it.
 *
 * Nothing here defines a second taxonomy. The four client segments are
 * shared/regulatory/client-segments.ts, therapeutic areas are
 * shared/constants/domain/therapeutic-areas.ts, regions are
 * shared/regulatory/region-identity.ts and submission types resolve through
 * shared/regulatory/submission-type-bridge.ts. What is new is the two axes no
 * existing record had: the discipline a method belongs to and the kind of work
 * it serves. They are stored in the bundle columns that already meant those
 * things (`module_types`, `work_types`).
 *
 * Pure data and pure functions; importable from client and server.
 *
 * @module shared/ana/skills
 */

import type { ClientSegmentId } from '../regulatory/client-segments.js';
import type { CanonicalRegion } from '../regulatory/region-identity.js';
import type { TherapeuticArea } from '../constants/domain/therapeutic-areas.js';

export type { ClientSegmentId, CanonicalRegion, TherapeuticArea };

// ─── Discipline (stored in account_skill_bundles.module_types) ─────────────

export const SKILL_DISCIPLINES = [
  'regulatory-strategy',
  'regulatory-operations',
  'cmc',
  'nonclinical',
  'clinical',
  'biostatistics',
  'clinical-pharmacology',
  'safety',
  'labeling',
  'medical-writing',
  'quality-systems',
  'device-engineering',
  'diagnostics',
] as const;
export type SkillDiscipline = (typeof SKILL_DISCIPLINES)[number];

export const SKILL_DISCIPLINE_LABELS: Readonly<Record<SkillDiscipline, string>> = {
  'regulatory-strategy': 'Regulatory strategy',
  'regulatory-operations': 'Submissions and regulatory operations',
  cmc: 'CMC and quality',
  nonclinical: 'Nonclinical',
  clinical: 'Clinical development',
  biostatistics: 'Biostatistics',
  'clinical-pharmacology': 'Clinical pharmacology',
  safety: 'Safety and pharmacovigilance',
  labeling: 'Labeling',
  'medical-writing': 'Medical writing',
  'quality-systems': 'Quality systems',
  'device-engineering': 'Device design and engineering',
  diagnostics: 'Diagnostics performance',
};

// ─── Use case: the kind of work (stored in account_skill_bundles.work_types) ─

export const SKILL_USE_CASES = [
  'strategy',
  'drafting',
  'review',
  'gap-analysis',
  'study-design',
  'analysis',
  'agency-interaction',
  'submission-assembly',
  'lifecycle-change',
] as const;
export type SkillUseCase = (typeof SKILL_USE_CASES)[number];

export const SKILL_USE_CASE_LABELS: Readonly<Record<SkillUseCase, string>> = {
  strategy: 'Plan a strategy',
  drafting: 'Draft a document or section',
  review: 'Review or quality-check',
  'gap-analysis': 'Find gaps against requirements',
  'study-design': 'Design a study or analysis',
  analysis: 'Interpret data or results',
  'agency-interaction': 'Prepare for or answer an agency',
  'submission-assembly': 'Assemble and validate a submission',
  'lifecycle-change': 'Assess a change after filing',
};

// ─── Client segment labels (the segments themselves are client-segments.ts) ─

export const SKILL_SEGMENT_IDS: readonly ClientSegmentId[] = ['device', 'ivd', 'biotech', 'pharma'];

/** Sentence-case labels for the Skills section; CLIENT_SEGMENTS keeps its own. */
export const SKILL_SEGMENT_LABELS: Readonly<Record<ClientSegmentId, string>> = {
  device: 'Medical device',
  ivd: 'IVD and diagnostics',
  biotech: 'Biotechnology',
  pharma: 'Pharmaceutical',
};

// ─── Limits, one definition for the server's refusal and the form's hint ────

export const SKILL_LIMITS = {
  nameMax: 120,
  descriptionMin: 20,
  descriptionMax: 600,
  instructionsMin: 40,
  /** About 2,000 tokens: a skill shares the prompt with everything else. */
  instructionsMax: 8000,
  triggersMax: 40,
  triggerMin: 3,
  triggerMax: 60,
  facetMax: 40,
  toolsMax: 24,
} as const;

/**
 * Most skills AnA loads into one turn, and their combined size.
 *
 * Skills a person chose (picked in the conversation, or deployed to the
 * project) have their own allowance, `maxChosen`, so a choice never crowds out
 * what the question calls for and the question never crowds out a choice.
 * `maxSkills` is for the skills AnA selects herself; `maxChars` holds both.
 */
export const SKILL_TURN_BUDGET = {
  maxSkills: 3,
  maxContextOnly: 1,
  maxChosen: 3,
  maxChars: 32000,
} as const;

/** How a person can put a skill into AnA's turns without a trigger phrase. */
export const SKILL_CHOICES = ['picked', 'deployed'] as const;
export type SkillChoice = (typeof SKILL_CHOICES)[number];

/** Skills a project can have always loaded; more would leave no room for the question. */
export const PROJECT_ALWAYS_MAX = 3;

/** A project's setting for one skill: always loaded there, or never loaded there. */
export const PROJECT_SKILL_STATES = ['always', 'off'] as const;
export type ProjectSkillState = (typeof PROJECT_SKILL_STATES)[number];

// ─── Keys ───────────────────────────────────────────────────────────────────

/**
 * A library skill key: dot-separated path, lowercase, e.g. `cmc.stability`.
 * The parent of `cmc.stability` is `cmc`. A key is never reused for a
 * different method; a retired method keeps its key and is withdrawn.
 */
const LIBRARY_KEY = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){0,3}$/;

export function isLibrarySkillKey(key: string): boolean {
  return LIBRARY_KEY.test(key);
}

/** The parent key of a library key, or null for a root. */
export function parentSkillKey(key: string): string | null {
  const i = key.lastIndexOf('.');
  return i > 0 ? key.slice(0, i) : null;
}

/** An organization skill is addressed by its bundle id under this prefix. */
export const ORG_SKILL_PREFIX = 'org:';

export function orgSkillKey(bundleId: string): string {
  return `${ORG_SKILL_PREFIX}${bundleId}`;
}

export function isOrgSkillKey(key: string): boolean {
  return key.startsWith(ORG_SKILL_PREFIX) && key.length > ORG_SKILL_PREFIX.length;
}

// ─── What an organization skill does to a library skill ─────────────────────

/**
 * `addendum` — the organization's instructions are loaded after the library
 * method whenever the library skill is loaded (house style, internal SOP
 * references, preferred templates).
 * `replace` — the organization's instructions are loaded instead of the
 * library method.
 * An organization skill that names no library skill stands alone and is
 * selected on its own facets and triggers.
 */
export const SKILL_EXTENSION_MODES = ['addendum', 'replace'] as const;
export type SkillExtensionMode = (typeof SKILL_EXTENSION_MODES)[number];

// ─── Status of an organization skill (account_skill_bundles.status) ─────────

/** `draft` is never loaded; `active` and `locked` are; `archived` is history. */
export const ORG_SKILL_STATUSES = ['draft', 'active', 'locked', 'archived'] as const;
export type OrgSkillStatus = (typeof ORG_SKILL_STATUSES)[number];

// ─── Review state of library content ────────────────────────────────────────

/**
 * `unreviewed` content was written for the platform and has not yet been read
 * against its sources by a named regulatory reviewer. The Skills section and
 * AnA's prompt both say so; it is never presented as reviewed.
 */
export const SKILL_REVIEW_STATES = ['unreviewed', 'reviewed'] as const;
export type SkillReviewState = (typeof SKILL_REVIEW_STATES)[number];

// ─── Facets ─────────────────────────────────────────────────────────────────

/**
 * Where a skill applies. An empty list means "any": a skill with no segments
 * applies to every client segment. Submission types are registry ids
 * (`US_IND`, `US_510K`, …) as submission-type-bridge resolves them.
 */
export interface SkillFacets {
  disciplines: SkillDiscipline[];
  useCases: SkillUseCase[];
  segments: ClientSegmentId[];
  therapeuticAreas: TherapeuticArea[];
  regions: CanonicalRegion[];
  submissionTypes: string[];
  /** Surface ids (SURFACE_VIEWS keys) on which the work is in front of the person. */
  surfaces: string[];
  /** Document-type registry ids the method authors or reviews (ICH_PROTOCOL, …). */
  documentTypes: string[];
}

// ─── API shapes (server → Skills section) ───────────────────────────────────

export interface SkillReferenceDto {
  kind: 'standard' | 'ich' | 'currency-fact' | 'ta-profile' | 'record';
  /** Registry id, ICH code, currency-fact id, profile id, or record path. */
  id: string;
  label: string;
}

export interface LibrarySkillSummaryDto extends SkillFacets {
  key: string;
  name: string;
  description: string;
  parent: string | null;
  version: number;
  /** First 12 hex characters of the content hash recorded with each turn. */
  contentHash: string;
  review: { state: SkillReviewState; note: string };
  /** The organization's setting: false when an administrator turned it off. */
  enabled: boolean;
  /** Organization skills that extend this one. */
  extendedBy: Array<{ bundleId: string; name: string; mode: SkillExtensionMode; status: OrgSkillStatus }>;
}

export interface LibrarySkillDetailDto extends LibrarySkillSummaryDto {
  instructions: string;
  triggers: string[];
  tools: string[];
  references: SkillReferenceDto[];
  disabledReason: string | null;
}

export interface OrgSkillDto extends SkillFacets {
  id: number;
  bundleId: string;
  key: string;
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  tools: string[];
  extendsSkillKey: string | null;
  extensionMode: SkillExtensionMode | null;
  status: OrgSkillStatus;
  version: number;
  updatedAt: string | null;
  /** The project it was written for; null when it is the whole organization's. */
  projectId: number | null;
}

/**
 * One skill a person can choose for a conversation, or deploy to a project:
 * what is on for the organization (and, in a project, not turned off there).
 */
export interface AvailableSkillDto {
  key: string;
  name: string;
  description: string;
  source: 'library' | 'organization';
  disciplines: SkillDiscipline[];
  useCases: SkillUseCase[];
  segments: ClientSegmentId[];
  /** The markets it is written for; empty for every market. */
  regions: CanonicalRegion[];
  /** Written for the project being asked about. */
  projectOnly: boolean;
  /** The project's setting for it; null outside a project or when the project has none. */
  projectState: ProjectSkillState | null;
}

export interface ProjectSkillSettingDto {
  key: string;
  /** The skill's name; null when the key names no skill the organization still has. */
  name: string | null;
  state: ProjectSkillState;
  reason: string;
  updatedAt: string | null;
}

export interface ProjectSkillsDto {
  projectId: number;
  settings: ProjectSkillSettingDto[];
  /** Skills written for this project. */
  skills: OrgSkillDto[];
  alwaysMax: number;
  /** Whether the person asking may change the project's skills. */
  canChange: boolean;
}

export interface SkillHistoryEntryDto {
  occurredAt: string;
  action: string;
  actorName: string | null;
  reason: string | null;
  version: number | null;
  instructions: string | null;
  status: string | null;
}

/** How often AnA used each skill over a window, from the turn records (GET /api/ana-skills/usage). */
export interface SkillUsageDto {
  days: number;
  turnsRead: number;
  turnsWithSkills: number;
  /** True when the window held more turn records than one read counts. */
  capped: boolean;
  skills: Array<{ key: string; turns: number; picked: number; deployed: number; lastUsedAt: string | null }>;
}

export interface SkillSelectionEntryDto {
  key: string;
  name: string;
  source: 'library' | 'organization';
  version: number;
  contentHash: string;
  score: number;
  reasons: string[];
  /** Picked in the conversation or deployed to the project; null when AnA selected it. */
  chosen: SkillChoice | null;
  /** Organization skills loaded with this one (addenda) or in its place. */
  attached: Array<{ key: string; name: string; mode: SkillExtensionMode; version: number }>;
}

export interface SkillSelectionDto {
  selected: SkillSelectionEntryDto[];
  /** Eligible but not loaded, with why (the turn's budget, a closer match). */
  passedOver: Array<{ key: string; name: string; score: number; why: string }>;
  considered: number;
}
