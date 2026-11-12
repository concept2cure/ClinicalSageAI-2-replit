/**
 * Change control — typed model, controlled-lifecycle definition, the change
 * document/form family, and fixtures.
 *
 * The surface renders `live ?? fixture` (see changeHooks.ts): live data comes
 * from /api/mdx/qms/changes/*; these fixtures keep the register + flowchart
 * populated during load and on error. Aligned to ICH Q10 §3.2.3 (change
 * management) and EU GMP Annex 15 (change control), with the QMS document family
 * used for the change-control procedure and change-request form.
 *
 * @module client/src/concept2cure/quality/changeData
 */

import type { DeviceChangeMarket, EuDeviceChangeOutcome, FdaDeviceChangeOutcome } from '@shared/regulatory/change-control-taxonomy';
import { formatDate } from './data';
import type { LearningReviewView } from './qmsApproval';

export type ChangeState =
  | 'proposed'
  | 'under_assessment'
  | 'approved'
  | 'rejected'
  | 'in_implementation'
  | 'verification'
  | 'closed'
  | 'cancelled';

export type ChangeType =
  | 'document' | 'process' | 'equipment' | 'material' | 'supplier'
  | 'method' | 'facility' | 'computer_system' | 'specification' | 'other';

export type Classification = 'minor' | 'major' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type LinkType =
  | 'deviation' | 'capa' | 'validation' | 'document' | 'sop' | 'supplier' | 'risk' | 'other';
export type Relationship = 'triggered_by' | 'addresses' | 'requires' | 'impacts' | 'references';

export interface ChangeLink {
  id: number;
  changeId: number;
  linkType: LinkType;
  linkedRef: string;
  linkedLabel: string | null;
  relationship: Relationship;
  note: string | null;
}

export interface ChangeControl {
  id: number;
  changeNumber: string;
  title: string;
  description: string | null;
  changeType: ChangeType;
  classification: Classification;
  riskLevel: RiskLevel | null;
  status: ChangeState;
  reason: string | null;
  /** Who raised it (`proposed_by`); null when the row carries none. The server refuses their approval. */
  proposedBy?: number | null;
  /** The impact assessment and implementation plan (`impact_assessment`, `implementation_plan`). With the title,
   *  description, type, classification, risk, reason and target date they are what the approval signs. */
  impactAssessment?: string | null;
  implementationPlan?: string | null;
  /** The digest of the content as read (`content_digest`). The approval sends it, and the server signs only that
   *  content: a change edited since it was read is refused. Null when the row carries none; then it is not signed. */
  contentDigest?: string | null;
  targetImplementationDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  links?: ChangeLink[];
  /** The server's verdict (GET /api/mdx/qms/changes `implementation_overdue`):
   *  past its target implementation date with implementation unfinished,
   *  judged against the database's date. Absent when the row carries none. */
  implementationOverdue?: boolean;
  /** The lifecycle moves the server allows from this change's state
   *  (GET /api/mdx/qms/changes `next_states`, changeControl.service
   *  CHANGE_TRANSITIONS). 'approved' among them is reached only through the
   *  signed approve route. Absent when the row carries none, and then no move
   *  is offered: the browser does not keep its own copy of the state machine. */
  nextStates?: ChangeState[];
  learningReview?: LearningReviewView | { unavailable: true } | null;
  /** Whether the device change determination applies to this change, and what is recorded on it (GET
   *  /api/mdx/qms/changes `regulatory_impact`). The server decides which project is a device's. Absent or null when
   *  the row carries none: the determination is then neither offered nor described. */
  regulatoryImpact?: RegulatoryImpact | null;
}

/* ─── The device change determination, kept on the change (P-122) ─────────
   Two rule engines decide it (server/services/regulatory/change-assessment.ts): in the United States, whether a
   device change needs a new 510(k) or is documented in a letter to file; in the European Union, whether it is a
   significant change. The server runs them and keeps the outcome on the change
   (server/services/qms/change-regulatory-impact.ts). Nothing here computes or defaults a verdict. */

/** What an engine can decide: the three FDA outcomes, and the EU's two. */
export type ImpactDecision = FdaDeviceChangeOutcome | EuDeviceChangeOutcome;

/** One market's determination as the change keeps it. */
export interface ImpactDetermination {
  decision: ImpactDecision;
  /** The engine's own rationale, and the triggers it found. */
  rationale: string;
  triggers: string[];
  /** The version of the engine's rules it was reached under. */
  ruleVersion: string;
  /** The answers given, under the engine's own input names. */
  inputs: Record<string, boolean>;
  byName: string;
  at: string;
}

/** `unreadable`: something is kept for the market and it is not a determination. It is said, and is never shown as
 *  a verdict or as "not assessed". */
export type KeptDetermination = ImpactDetermination | 'unreadable' | null;

export interface RegulatoryImpact {
  /** `device`: the change is filed under a device project. Otherwise why the determination does not apply. */
  applies: 'device' | 'not_device' | 'no_project';
  productType: string | null;
  /** Only an organisation with a device project is told why a change that is not a device's does not offer it. */
  organisationHasDevices: boolean;
  /** A determination may be recorded now: a device project's change, still proposed or under assessment. */
  assessable: boolean;
  us: KeptDetermination;
  eu: KeptDetermination;
}

export const IMPACT_MARKET_LABEL: Record<DeviceChangeMarket, string> = { us: 'United States', eu: 'European Union' };
/** What each market's engine decides, in a sentence. */
export const IMPACT_MARKET_ASKS: Record<DeviceChangeMarket, string> = {
  us: 'FDA: whether the change needs a new 510(k), or is documented in a letter to file.',
  eu: 'MDR and IVDR: whether the change is a significant change (MDCG 2020-3).',
};
/** Each outcome in plain words. A value outside this map is not an outcome and is read as unreadable. */
export const IMPACT_DECISION_LABEL: Record<ImpactDecision, string> = {
  new_510k: 'New 510(k)',
  letter_to_file: 'Letter to file',
  pma_supplement_or_de_novo: 'Beyond a 510(k): PMA supplement or De Novo',
  significant: 'Significant change',
  non_significant: 'Not a significant change',
};
const FDA_OUTCOMES: readonly string[] = ['new_510k', 'letter_to_file', 'pma_supplement_or_de_novo'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The engine's decision from its result, or null when the result holds none. The EU's is a yes or a no: anything
 *  else is no decision, never "not significant". */
function decisionOf(market: DeviceChangeMarket, result: Record<string, unknown>): ImpactDecision | null {
  if (market === 'us') return FDA_OUTCOMES.includes(String(result.decision)) ? (result.decision as ImpactDecision) : null;
  if (typeof result.significant !== 'boolean') return null;
  return result.significant ? 'significant' : 'non_significant';
}

/** One market's kept determination from the server's row. */
function keptDeterminationOf(market: DeviceChangeMarket, raw: unknown): KeptDetermination {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw) || !isObject(raw.result) || !isObject(raw.by) || !isObject(raw.inputs)) return 'unreadable';
  const { result, by, inputs, ruleVersion, at } = raw;
  const decision = decisionOf(market, result);
  const triggers = Array.isArray(result.triggers) && result.triggers.every((t) => typeof t === 'string') ? (result.triggers as string[]) : null;
  const answered = Object.values(inputs).every((v) => typeof v === 'boolean');
  const texts = [result.rationale, ruleVersion, by.name, at].every((t) => typeof t === 'string' && t.trim().length > 0);
  if (!decision || !triggers || !answered || !texts) return 'unreadable';
  return {
    decision, triggers, rationale: String(result.rationale), ruleVersion: String(ruleVersion),
    inputs: inputs as Record<string, boolean>, byName: String(by.name), at: String(at),
  };
}

/** The server's `regulatory_impact` on a register row, or null when the row carries none this code can read. */
export function regulatoryImpactOf(raw: unknown): RegulatoryImpact | null {
  if (!isObject(raw)) return null;
  const { applies } = raw;
  if (applies !== 'device' && applies !== 'not_device' && applies !== 'no_project') return null;
  return {
    applies,
    productType: typeof raw.productType === 'string' ? raw.productType : null,
    organisationHasDevices: raw.organisationHasDevices === true,
    assessable: raw.assessable === true,
    us: keptDeterminationOf('us', raw.us),
    eu: keptDeterminationOf('eu', raw.eu),
  };
}

export interface ChangeSummary {
  total: number;
  open: number;
  awaitingApproval: number;
  inImplementation: number;
  awaitingVerification: number;
  closed: number;
  overdueImplementation: number;
  byStatus: Record<string, number>;
}

/**
 * The change log's figures from its rows, by the server's definitions (changeControl.service.ts changeControlSummary):
 * open is every state but closed, rejected and cancelled. The summary route reads the whole organisation and takes no
 * project, so a log scoped to a project counts its own rows (C14).
 */
export function summaryOfChanges(changes: ChangeControl[]): ChangeSummary {
  const byStatus: Record<string, number> = {};
  for (const c of changes) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const terminal = (byStatus.closed ?? 0) + (byStatus.rejected ?? 0) + (byStatus.cancelled ?? 0);
  return {
    total: changes.length,
    open: changes.length - terminal,
    awaitingApproval: byStatus.under_assessment ?? 0,
    inImplementation: byStatus.in_implementation ?? 0,
    awaitingVerification: byStatus.verification ?? 0,
    closed: byStatus.closed ?? 0,
    overdueImplementation: changes.filter((c) => c.implementationOverdue === true).length,
    byStatus,
  };
}

/* ─── Labels + tone maps ───────────────────────────────────────── */

export const STATE_LABEL: Record<ChangeState, string> = {
  proposed: 'Proposed',
  under_assessment: 'Under assessment',
  approved: 'Approved',
  rejected: 'Rejected',
  in_implementation: 'In implementation',
  verification: 'Verification',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** D0's chip tone for a change's state (.rd-chip, C8): closed is ok, rejected err, cancelled dim, the rest neutral,
    as the SOP register's effective, retired and in-flight states are. */
export type StateTone = 'ok' | 'err' | 'dim' | null;
export const STATE_TONE: Record<ChangeState, StateTone> = {
  proposed: null,
  under_assessment: null,
  approved: null,
  in_implementation: null,
  verification: null,
  closed: 'ok',
  rejected: 'err',
  cancelled: 'dim',
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  document: 'Document',
  process: 'Process',
  equipment: 'Equipment',
  material: 'Material',
  supplier: 'Supplier',
  method: 'Analytical method',
  facility: 'Facility',
  computer_system: 'Computer system',
  specification: 'Specification',
  other: 'Other',
};

/** A change's risk level, in words (C9). */
export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The states in which a change's assessment can be edited: the server's CHANGE_EDITABLE_STATES
 *  (changeControl.service.ts). From approval on, it is what the approval signed. */
export const ASSESSABLE_STATES: readonly ChangeState[] = ['proposed', 'under_assessment'];

/** Whether a link can still be added to or removed from a change: the server's rule (changeControl.service.ts addLink,
 *  removeLink), every state but closed, cancelled and rejected. */
export const takesLinks = (c: { status: ChangeState }): boolean => !['closed', 'cancelled', 'rejected'].includes(c.status);

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};
/** D0's chip tone for a classification (C8): critical err, major warn. Minor is neutral: green would read as "fine". */
export const CLASSIFICATION_TONE: Record<Classification, 'warn' | 'err' | null> = {
  minor: null,
  major: 'warn',
  critical: 'err',
};

export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  deviation: 'Deviation',
  capa: 'CAPA',
  validation: 'Validation',
  document: 'Document',
  sop: 'SOP',
  supplier: 'Supplier',
  risk: 'Risk',
  other: 'Other',
};

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  triggered_by: 'Triggered by',
  addresses: 'Addresses',
  requires: 'Requires',
  impacts: 'Impacts',
  references: 'References',
};

/* ─── The controlled change-control lifecycle (flowchart backbone) ─────
   The main path an approved change follows, ICH Q10 / Annex 15. `rejected`
   and `cancelled` are off-ramps rendered separately. Each step carries the
   short "what happens here" the flowchart labels under the node. */

export interface FlowStep {
  key: ChangeState;
  label: string;
  blurb: string;
}

export const FLOW_STEPS: FlowStep[] = [
  { key: 'proposed',          label: 'Proposed',          blurb: 'Change request raised' },
  { key: 'under_assessment',  label: 'Under assessment',  blurb: 'Impact & risk assessed' },
  { key: 'approved',          label: 'Approved',          blurb: 'Independent approval' },
  { key: 'in_implementation', label: 'In implementation', blurb: 'Actions executed' },
  { key: 'verification',      label: 'Verification',      blurb: 'Effectiveness checked' },
  { key: 'closed',            label: 'Closed',            blurb: 'Change record closed' },
];

/* REMOVED 2026-10-17: CHANGE_FORMS, a client copy of three change-control
   entries "mirroring" server/services/qms/sopTemplates.ts. One of the three,
   the impact-assessment form, had no server template at all, and every card
   only handed AnA a create prompt. The change-control gallery now renders the
   server's own library entries (GET /api/mdx/qms/templates, keys in
   CHANGE_FORM_TEMPLATE_KEYS) and creates through POST /api/mdx/qms/documents.
   The impact assessment itself is a field of the change record
   (PATCH /api/mdx/qms/changes/:id `impactAssessment`), not a separate form. */
export const CHANGE_FORM_TEMPLATE_KEYS: readonly string[] = ['change_request_form', 'change_control_sop'];

/* REMOVED 2026-10-14: FIXTURE_CHANGES and FIXTURE_SUMMARY, an example change
   log (CC-2026-014 "Sterile filter supplier change", a 5,000 L scale-up, a LIMS
   migration …) shown under sample mode. The tests that drive the log with rows
   carry their own, in __tests__/changeRows.ts. */

/** Count how many changes sit at each lifecycle step — the flowchart's live
 *  load, derived from the register's own rows. */
export function deriveStageCounts(changes: ChangeControl[]): Record<ChangeState, number> {
  const counts = {
    proposed: 0, under_assessment: 0, approved: 0, rejected: 0,
    in_implementation: 0, verification: 0, closed: 0, cancelled: 0,
  } as Record<ChangeState, number>;
  for (const c of changes) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return counts;
}

/**
 * True when the server says the change is past its target implementation date
 * with implementation unfinished. The browser does not judge it: until
 * 2026-10-08 this compared against a hard-coded '2026-07-24' and only for
 * approved or in-implementation rows, so on the day of the QA walk a proposed
 * change and an approved one, both past target, carried no flag (J8). The
 * server's predicate is the one the Overdue tile counts with
 * (server/services/qms/changeControl.service.ts IMPLEMENTATION_OVERDUE_SQL).
 */
export function isImplementationOverdue(c: ChangeControl): boolean {
  return c.implementationOverdue === true;
}

export { formatDate };
