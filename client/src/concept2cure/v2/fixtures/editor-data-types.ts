/* ------------------------------------------------------------------ *
 *  editor-data-types.ts
 *  TypeScript interfaces, type definitions, and small lookup maps
 *  for the document editor data model. All types and display-metadata
 *  constants are consumed by the companion data files.
 * ------------------------------------------------------------------ */

// -- String union types ---------------------------------------------

export type PathwayId =
  | 'ctd'
  | 'estar'
  | 'pma'
  | 'cer'
  | 'csr'
  | 'ivdr'
  | 'protocol';

export type SectionStatus = 'draft' | 'review' | 'complete';

export type ArtifactStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'locked'
  | 'archived';

export type ReadinessLevel =
  | 'draft'
  | 'evidence_gap'
  | 'review_ready'
  | 'approval_ready'
  | 'export_ready'
  | 'publish_ready'
  | 'blocked'
  | 'degraded';

export type SignatureMeaning =
  | 'authorship'
  | 'review'
  | 'approval'
  | 'rejection'
  | 'verification'
  | 'authorization'
  | 'acknowledgment'
  | 'witnessing'
  | 'responsibility'
  | 'custom';

export type ApprovalPath =
  | 'single_reviewer'
  | 'regulated_dual_review'
  | 'qa_lock'
  | 'signoff_required';

export type PreflightVerdict =
  | 'ready'
  | 'provisional'
  | 'needs-review'
  | 'needs-reapproval'
  | 'blocked';

export type AuditKind = 'edit' | 'ai' | 'comment' | 'sign' | 'lock';

export type ReadinessTone = 'idle' | 'err' | 'warn' | 'acc' | 'ok';

export type StatusDot = 'draft' | 'review' | 'complete';

export type TherapeuticAreaId =
  | 'onc'
  | 'cv'
  | 'cns'
  | 'imm'
  | 'id'
  | 'rare'
  | 'met'
  | 'vacc'
  | 'dx'
  | 'resp';

export type LangCode = 'en' | 'ja' | 'zh' | 'de' | 'fr';

export type SurfaceId =
  | 'document-authoring'
  | 'protocol-dev'
  | 'device-submission'
  | 'device-workstream'
  | 'device-510k'
  | 'device-cer'
  | 'device-diagnostics'
  | 'ectd-coauthor'
  | 'csr-workflow';

// -- Data interfaces ------------------------------------------------

export interface SectionItem {
  readonly id: string;
  readonly num: string;
  readonly label: string;
  readonly status: SectionStatus;
  readonly conf: number;
  readonly words: number;
  readonly blocker?: boolean;
}

export interface Volume {
  readonly vol: string;
  readonly items: readonly SectionItem[];
}

export interface Pathway {
  readonly id: PathwayId;
  readonly kind: string;
  readonly program: string;
  readonly code: string;
  readonly ta: TherapeuticAreaId;
  readonly owner: string;
  readonly dueline: string;
  readonly readiness: number;
  readonly active: string;
  readonly tree: readonly Volume[];
  readonly content?: Readonly<Record<string, string>>;
}

export interface CommentReply {
  readonly author: string;
  readonly role: string;
  readonly when: string;
  readonly ai: boolean;
  readonly body: string;
}

export interface Comment {
  readonly id: string;
  readonly anchor: string;
  readonly author: string;
  readonly role: string;
  readonly when: string;
  readonly resolved: boolean;
  readonly ai: boolean;
  readonly body: string;
  readonly replies: readonly CommentReply[];
}

export interface VersionEntry {
  readonly v: string;
  readonly when: string;
  readonly author: string;
  readonly sig: string | null;
  readonly note: string;
  readonly diff: string;
  readonly current?: boolean;
}

export interface AuditEntry {
  readonly kind: AuditKind;
  readonly actor: string;
  readonly when: string;
  readonly target: string;
  readonly detail: string;
  readonly ip: string;
}

export interface Language {
  readonly label: string;
  readonly short: string;
  readonly dir: string;
}

export interface Market {
  readonly id: string;
  readonly agency: string;
  readonly region: string;
  readonly lang: LangCode;
}

export interface TemplateItem {
  readonly id: string;
  readonly num: string;
  readonly label: string;
}

export interface TemplateGroup {
  readonly group: string;
  readonly items: readonly TemplateItem[];
}

export interface ReadinessMeta {
  readonly label: string;
  readonly tone: ReadinessTone;
}

export interface StatusMeta {
  readonly label: string;
  readonly dot: StatusDot;
}

export interface SlashCommand {
  readonly cmd: string;
  readonly hint: string;
}

export interface TherapeuticArea {
  readonly id: TherapeuticAreaId;
  readonly label: string;
}

export interface RegEnums {
  readonly artifactStatus: readonly ArtifactStatus[];
  readonly readiness: readonly ReadinessLevel[];
  readonly signatureMeaning: readonly SignatureMeaning[];
  readonly approvalPath: readonly ApprovalPath[];
  readonly preflightVerdict: readonly PreflightVerdict[];
}

// -- Small lookup maps & enum constants -----------------------------

/** Platform enums from the inventory (Domain 3 -- authoring engine). */
export const REG_ENUMS: RegEnums = {
  artifactStatus: ['draft', 'review', 'approved', 'locked', 'archived'],
  readiness: [
    'draft', 'evidence_gap', 'review_ready', 'approval_ready',
    'export_ready', 'publish_ready', 'blocked', 'degraded',
  ],
  signatureMeaning: [
    'authorship', 'review', 'approval', 'rejection', 'verification',
    'authorization', 'acknowledgment', 'witnessing', 'responsibility', 'custom',
  ],
  approvalPath: ['single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required'],
  preflightVerdict: ['ready', 'provisional', 'needs-review', 'needs-reapproval', 'blocked'],
};

/** Lifecycle readiness display metadata (label + tone). */
export const REG_READINESS_META: Record<ReadinessLevel, ReadinessMeta> = {
  draft:          { label: 'Draft',          tone: 'idle' },
  evidence_gap:   { label: 'Evidence gap',   tone: 'err'  },
  review_ready:   { label: 'Review-ready',   tone: 'warn' },
  approval_ready: { label: 'Approval-ready', tone: 'acc'  },
  export_ready:   { label: 'Export-ready',   tone: 'ok'   },
  publish_ready:  { label: 'Publish-ready',  tone: 'ok'   },
  blocked:        { label: 'Blocked',        tone: 'err'  },
  degraded:       { label: 'Degraded',       tone: 'warn' },
};

/** ArtifactStatus display metadata. */
export const REG_STATUS_META: Record<ArtifactStatus, StatusMeta> = {
  draft:    { label: 'Draft',     dot: 'draft'    },
  review:   { label: 'In review', dot: 'review'   },
  approved: { label: 'Approved',  dot: 'complete' },
  locked:   { label: 'Locked',    dot: 'review'   },
  archived: { label: 'Archived',  dot: 'draft'    },
};

/** SignatureMeaning display labels. */
export const REG_MEANING_LABEL: Record<SignatureMeaning, string> = {
  authorship:      'Authorship',
  review:          'Review',
  approval:        'Approval',
  rejection:       'Rejection',
  verification:    'Verification',
  authorization:   'Authorization',
  acknowledgment:  'Acknowledgment',
  witnessing:      'Witnessing',
  responsibility:  'Responsibility',
  custom:          'Custom…',
};

// -- Internationalization -------------------------------------------

/** Language descriptors for regulatory document authoring. */
export const REG_LANGS: Record<LangCode, Language> = {
  en: { label: 'English',     short: 'EN', dir: 'ltr' },
  ja: { label: '日本語',       short: 'JA', dir: 'ltr' },
  zh: { label: '中文',         short: 'ZH', dir: 'ltr' },
  de: { label: 'Deutsch',     short: 'DE', dir: 'ltr' },
  fr: { label: 'Français',  short: 'FR', dir: 'ltr' },
};

// -- Therapeutic areas ----------------------------------------------

/** Therapeutic areas -- set per document; contextualizes AnA + templates. */
export const REG_TA: readonly TherapeuticArea[] = [
  { id: 'onc',  label: 'Oncology' },
  { id: 'cv',   label: 'Cardiovascular' },
  { id: 'cns',  label: 'Neuroscience / CNS' },
  { id: 'imm',  label: 'Immunology & inflammation' },
  { id: 'id',   label: 'Infectious disease' },
  { id: 'rare', label: 'Rare / orphan disease' },
  { id: 'met',  label: 'Metabolic & endocrine' },
  { id: 'vacc', label: 'Vaccines' },
  { id: 'dx',   label: 'Diagnostics / IVD' },
  { id: 'resp', label: 'Respiratory' },
];

// -- Slash commands -------------------------------------------------

/** Slash commands (subset of ~58, surfaced in the AnA composer). */
export const REG_SLASH: readonly SlashCommand[] = [
  { cmd: '/fullbuild',      hint: 'Full build — draft, check & deliver DOCX + PDF' },
  { cmd: '/draft',          hint: 'Draft this section from linked evidence' },
  { cmd: '/export',         hint: 'Export current section as DOCX + PDF' },
  { cmd: '/refine',         hint: 'Refine the selection as tracked changes' },
  { cmd: '/preflight',      hint: 'Run the 5-point section preflight (Pass 5)' },
  { cmd: '/readiness',      hint: 'Explain the readiness level & blockers' },
  { cmd: '/contradictions', hint: 'Scan for cross-section contradictions' },
  { cmd: '/compare',        hint: 'Compare against the approved baseline' },
  { cmd: '/promote',        hint: 'Promote this section to review' },
  { cmd: '/precedent',      hint: 'Find regulatory precedent for this claim' },
  { cmd: '/cite',           hint: 'Insert a citation at the cursor' },
  { cmd: '/harmonize',      hint: 'Harmonize terminology across sections' },
  { cmd: '/risk',           hint: 'Surface open blockers & deficiency risks' },
  { cmd: '/strategy',       hint: 'Regulatory strategy for this pathway' },
];
