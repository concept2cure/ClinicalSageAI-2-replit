/**
 * Submission Center — canonical constants (single source of truth)
 *
 * The UI renders every dropdown, badge, and status pill from these arrays/maps
 * so labels and ordering stay consistent and there is no string drift between
 * server enums and UI. Framework-agnostic — no React, no styling, just data.
 * `label` is sentence case per the design system; `tone` is a neutral hint the
 * UI maps to its own palette (never hard-codes a hex here).
 */

export type Tone = 'neutral' | 'progress' | 'positive' | 'warning' | 'critical' | 'focus';

export interface Choice<T extends string> {
  value: T;
  label: string;
  tone?: Tone;
  description?: string;
}

// ── Region ────────────────────────────────────────────────────────────────────
export type Region = 'fda' | 'eu' | 'jp';
export const REGIONS: Choice<Region>[] = [
  { value: 'fda', label: 'FDA (US)' },
  { value: 'eu', label: 'EU' },
  { value: 'jp', label: 'PMDA (Japan)' },
];

// ── Client type ───────────────────────────────────────────────────────────────
export type ClientType = 'pharma' | 'biotech' | 'mdx' | 'ivd';
export const CLIENT_TYPES: Choice<ClientType>[] = [
  { value: 'pharma', label: 'Pharma' },
  { value: 'biotech', label: 'Biotech' },
  { value: 'mdx', label: 'MedTech device' },
  { value: 'ivd', label: 'IVD / diagnostics' },
];

// ── Application type ──────────────────────────────────────────────────────────
export const APPLICATION_TYPES: Choice<string>[] = [
  { value: 'ind', label: 'IND' },
  { value: 'nda', label: 'NDA' },
  { value: 'bla', label: 'BLA' },
  { value: 'anda', label: 'ANDA' },
  { value: 'maa', label: 'MAA' },
  { value: '510k', label: '510(k)' },
  { value: 'de_novo', label: 'De Novo' },
  { value: 'pma', label: 'PMA' },
  { value: 'cta', label: 'CTA' },
];

// ── Pathway ───────────────────────────────────────────────────────────────────
export const PATHWAYS: Choice<string>[] = [
  { value: 'ectd_v322', label: 'eCTD v3.2.2' },
  { value: 'ectd_v40', label: 'eCTD v4.0 (RPS)' },
  { value: 'estar', label: 'eSTAR' },
  { value: 'mdr', label: 'EU MDR tech doc' },
  { value: 'ivdr', label: 'EU IVDR tech doc' },
  { value: 'ctis', label: 'CTIS' },
];

// ── Sequence type + status ────────────────────────────────────────────────────
export const SEQUENCE_TYPES: Choice<string>[] = [
  { value: 'original', label: 'Original' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'response', label: 'Response' },
  { value: 'variation', label: 'Variation' },
  { value: 'annual', label: 'Annual report' },
  { value: 'withdrawal', label: 'Withdrawal' },
];

export type SequenceStatus = 'draft' | 'assembling' | 'validated' | 'frozen' | 'dispatched';
export const SEQUENCE_STATUSES: Choice<SequenceStatus>[] = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'assembling', label: 'Assembling', tone: 'progress' },
  { value: 'validated', label: 'Validated', tone: 'positive' },
  { value: 'frozen', label: 'Frozen', tone: 'focus', description: 'Immutable — leaves cannot change.' },
  { value: 'dispatched', label: 'Dispatched', tone: 'positive' },
];

/** Forward transitions allowed from each status (mirrors the server lifecycle rules). */
export const SEQUENCE_TRANSITIONS: Record<SequenceStatus, SequenceStatus[]> = {
  draft: ['assembling'],
  assembling: ['validated', 'draft'],
  validated: ['frozen', 'assembling'],
  frozen: ['dispatched'],
  dispatched: [],
};

// ── Lifecycle operator (leaf) ─────────────────────────────────────────────────
export type LifecycleOp = 'new' | 'replace' | 'append' | 'delete';
export const LIFECYCLE_OPS: Choice<LifecycleOp>[] = [
  { value: 'new', label: 'New', tone: 'positive' },
  { value: 'replace', label: 'Replace', tone: 'progress' },
  { value: 'append', label: 'Append', tone: 'neutral' },
  { value: 'delete', label: 'Delete', tone: 'critical' },
];

// ── Validation + finding severity ─────────────────────────────────────────────
export const VALIDATION_SEVERITIES: Choice<string>[] = [
  { value: 'error', label: 'Error', tone: 'critical' },
  { value: 'warning', label: 'Warning', tone: 'warning' },
  { value: 'info', label: 'Info', tone: 'neutral' },
];

export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';
export const FINDING_SEVERITIES: Choice<FindingSeverity>[] = [
  { value: 'critical', label: 'Critical', tone: 'critical' },
  { value: 'major', label: 'Major', tone: 'warning' },
  { value: 'minor', label: 'Minor', tone: 'progress' },
  { value: 'info', label: 'Info', tone: 'neutral' },
];

export type FindingStatus = 'open' | 'accepted' | 'fixed' | 'waived';
export const FINDING_STATUSES: Choice<FindingStatus>[] = [
  { value: 'open', label: 'Open', tone: 'warning' },
  { value: 'accepted', label: 'Accepted', tone: 'neutral' },
  { value: 'fixed', label: 'Fixed', tone: 'positive' },
  { value: 'waived', label: 'Waived', tone: 'neutral' },
];

// ── Shadow Review lens ────────────────────────────────────────────────────────
export const SHADOW_LENSES: Choice<string>[] = [
  { value: 'fda_filing', label: 'FDA filing review' },
  { value: 'ema_d120', label: 'EMA Day-120 LoQ' },
  { value: 'pmda', label: 'PMDA review' },
  { value: 'nb_mdr', label: 'Notified Body (MDR)' },
  { value: 'nb_ivdr', label: 'Notified Body (IVDR)' },
];

// ── Provenance direction + consistency status ─────────────────────────────────
export const EVIDENCE_DIRECTIONS: Choice<string>[] = [
  { value: 'derives_from', label: 'Derives from' },
  { value: 'cited_by', label: 'Cited by' },
  { value: 'supports', label: 'Supports', tone: 'positive' },
  { value: 'contradicts', label: 'Contradicts', tone: 'critical' },
];

export const CONSISTENCY_STATUSES: Choice<string>[] = [
  { value: 'match', label: 'Match', tone: 'positive' },
  { value: 'conflict', label: 'Conflict', tone: 'critical' },
];

/** Lifecycle stage of a submission (the top-level lifecycle the object moves through). */
export const LIFECYCLE_STAGES: Choice<string>[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'original', label: 'Original' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'response', label: 'Response' },
  { value: 'variation', label: 'Variation' },
  { value: 'annual', label: 'Annual / periodic' },
  { value: 'withdrawal', label: 'Withdrawal' },
];
