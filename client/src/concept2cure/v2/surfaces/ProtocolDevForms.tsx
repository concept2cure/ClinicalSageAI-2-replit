/**
 * Protocol development — the governed drawers for the registers this surface
 * writes through `ProtocolDevWrites`.
 *
 * Same ceremony as `ProtocolRegisterForms`: one `C2CForm`, the domain fields
 * the route requires, and the mandatory reason for change. That module keeps
 * the CREATE forms for the four operational registers; this one covers the
 * writes it does not — visits, assessments, residual risk, budget, reviews and
 * the cover page. The two never post to the same route.
 *
 * Nothing here is optimistic: the caller re-reads GET /api/protocol-dev after
 * a confirmed write, so the screen shows the record and not the form.
 */
import React from 'react';
import { C2CForm, type C2CFormConfig, type C2CFormField } from '../C2CForm';
import {
  addBudgetItem, addScheduleVisit, addSoaAssessment, optionalNumber,
  removeScheduleVisit, removeSoaAssessment, renameScheduleVisit, requestProtocolReview,
  setBudgetParams, startProtocolDocument, updateProtocolHeader, updateProtocolRisk,
} from './ProtocolDevWrites';

export type PdevFormKind =
  | 'visit-add' | 'visit-rename' | 'visit-remove'
  | 'assessment-add' | 'assessment-remove'
  | 'risk-residual'
  | 'budget-item' | 'budget-params'
  | 'review-request' | 'review-disposition'
  | 'cover-page'
  | 'start-protocol';

/** What the drawer is acting on: the child row's id and how to name it. */
export interface PdevFormTarget {
  /** The visit / assessment / risk / assignment the write addresses. */
  id?: number;
  /** How the row reads on screen, so the drawer names what is being changed. */
  label?: string;
  /** Current values, so an edit form opens on the record rather than blank. */
  defaults?: Record<string, string>;
  /** A review's assigned user; null when it names a reviewer with no account. */
  reviewerUserId?: number | null;
}

const REASON: C2CFormField = {
  key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
  placeholder: 'Why this change is being made — at least 8 characters; written to the audit trail.',
};

const LIKELIHOOD = ['rare', 'unlikely', 'possible', 'likely', 'almost_certain'];
const IMPACT = ['negligible', 'minor', 'moderate', 'major', 'severe'];
const SOA_CATEGORY = ['lab', 'imaging', 'exam', 'vital_signs', 'pk', 'questionnaire', 'procedure', 'eligibility', 'other'];
const BUDGET_CATEGORY = ['personnel', 'procedure', 'lab', 'imaging', 'overhead', 'equipment', 'patient_stipend', 'other'];
const REVIEW_ROLE = ['scientific', 'statistical', 'ethics', 'safety', 'regulatory', 'general'];
const DISPOSITION = ['approve', 'approve_with_changes', 'reject', 'abstain'];
const PROTOCOL_KIND = ['clinical', 'irb', 'iacuc', 'ibc'];

/** Every drawer's static half. The dynamic half (defaults, the row's name) is
 *  applied by `configFor`, so a rename opens on the stored visit name. */
const FORMS: Record<PdevFormKind, C2CFormConfig> = {
  'visit-add': {
    eyebrow: 'Protocol · schedule of assessments', title: 'Add visit',
    sub: 'A study visit column on the schedule of assessments. Recorded as a governed action.',
    governed: true, submitLabel: 'Add visit',
    fields: [
      { key: 'visitName', label: 'Visit name', type: 'text', required: true, placeholder: 'e.g. Week 12' },
      { key: 'timepoint', label: 'Timepoint', type: 'text', half: true, placeholder: 'e.g. Day 84 ± 3' },
      REASON,
    ],
  },
  'visit-rename': {
    eyebrow: 'Protocol · schedule of assessments', title: 'Rename visit',
    sub: 'Changes the column on the schedule of assessments. Its assessment cells are unaffected.',
    governed: true, submitLabel: 'Save visit',
    fields: [
      { key: 'visitName', label: 'Visit name', type: 'text', required: true },
      { key: 'timepoint', label: 'Timepoint', type: 'text', half: true },
      REASON,
    ],
  },
  'visit-remove': {
    eyebrow: 'Protocol · schedule of assessments', title: 'Remove visit',
    sub: 'The visit leaves the schedule. Its cells stay on the record and are excluded from the matrix.',
    governed: true, submitLabel: 'Remove visit',
    fields: [REASON],
  },
  'assessment-add': {
    eyebrow: 'Protocol · schedule of assessments', title: 'Add assessment',
    sub: 'An assessment row on the schedule of assessments. Recorded as a governed action.',
    governed: true, submitLabel: 'Add assessment',
    fields: [
      { key: 'name', label: 'Assessment', type: 'text', required: true, placeholder: 'e.g. 12-lead ECG' },
      { key: 'category', label: 'Category', type: 'select', options: SOA_CATEGORY, default: 'procedure', half: true },
      REASON,
    ],
  },
  'assessment-remove': {
    eyebrow: 'Protocol · schedule of assessments', title: 'Remove assessment',
    sub: 'The row leaves the schedule. Its cells stay on the record and are excluded from the matrix.',
    governed: true, submitLabel: 'Remove assessment',
    fields: [REASON],
  },
  'risk-residual': {
    eyebrow: 'Protocol · risk register', title: 'Record residual risk',
    sub: 'ICH E6(R2) §5.0 — the rating that remains after the mitigation is in place.',
    governed: true, submitLabel: 'Save risk',
    fields: [
      { key: 'residualLikelihood', label: 'Residual likelihood', type: 'select', options: LIKELIHOOD, half: true },
      { key: 'residualImpact', label: 'Residual impact', type: 'select', options: IMPACT, half: true },
      { key: 'owner', label: 'Owner', type: 'text', half: true, placeholder: 'e.g. Clinical operations lead' },
      { key: 'status', label: 'Status', type: 'select', options: ['open', 'mitigating', 'accepted', 'closed'], half: true },
      { key: 'mitigation', label: 'Mitigation', type: 'textarea', placeholder: 'The control that lowers the rating' },
      REASON,
    ],
  },
  'budget-item': {
    eyebrow: 'Protocol · budget', title: 'Add budget line',
    sub: 'A per-subject cost line. The roll-up and the feasibility verdict are the budget engine’s, not this form’s.',
    governed: true, submitLabel: 'Add line',
    fields: [
      { key: 'description', label: 'Line item', type: 'text', required: true, placeholder: 'e.g. Screening ECG, central over-read' },
      { key: 'category', label: 'Category', type: 'select', options: BUDGET_CATEGORY, default: 'procedure', half: true },
      { key: 'unitCost', label: 'Unit cost (USD)', type: 'number', required: true, min: 0, half: true },
      { key: 'quantityPerSubject', label: 'Quantity per subject', type: 'number', min: 0, default: '1', half: true },
      { key: 'payer', label: 'Payer', type: 'select', options: ['sponsor', 'institution', 'other'], default: 'sponsor', half: true },
      REASON,
    ],
  },
  'budget-params': {
    eyebrow: 'Protocol · budget', title: 'Feasibility parameters',
    sub: 'Enrollment, sponsor payment and the indirect (F&A) rate. 2 CFR 200.414 — F&A applies on the direct cost base.',
    governed: true, submitLabel: 'Save parameters',
    fields: [
      { key: 'targetEnrollment', label: 'Target enrollment (subjects)', type: 'number', min: 0, half: true },
      { key: 'sponsorPaymentPerSubject', label: 'Sponsor payment per subject (USD)', type: 'number', min: 0, half: true },
      { key: 'indirectRatePct', label: 'Indirect (F&A) rate (%)', type: 'number', min: 0, max: 200, half: true },
      REASON,
    ],
  },
  'review-request': {
    eyebrow: 'Protocol · review', title: 'Request a review',
    sub: 'Assigns a reviewer to this protocol. Recorded as a governed action.',
    governed: true, submitLabel: 'Request review',
    fields: [
      { key: 'reviewerName', label: 'Reviewer', type: 'text', required: true, placeholder: 'The person who will review this protocol' },
      { key: 'role', label: 'Review role', type: 'select', options: REVIEW_ROLE, default: 'scientific', half: true },
      { key: 'dueDate', label: 'Due date', type: 'date', half: true },
      REASON,
    ],
  },
  'review-disposition': {
    eyebrow: 'Protocol · review', title: 'Record disposition',
    sub: 'The reviewer’s decision on this protocol. Next you sign it: the meaning, the reason and your password.',
    governed: 'This is an electronic signature (21 CFR 11.50, 11.200). Nothing is recorded until you sign in the next step.',
    submitLabel: 'Continue to signature',
    fields: [
      { key: 'disposition', label: 'Disposition', type: 'select', options: DISPOSITION, default: 'approve' },
    ],
  },
  'cover-page': {
    eyebrow: 'Protocol · cover page', title: 'Sponsor and principal investigator',
    sub: 'The cover-page record. An empty field clears the stored value; the roster is unchanged either way.',
    governed: true, submitLabel: 'Save cover page',
    fields: [
      { key: 'sponsor', label: 'Sponsor', type: 'text', placeholder: 'The organisation sponsoring the study' },
      { key: 'principalInvestigator', label: 'Principal investigator', type: 'text', placeholder: 'The investigator responsible for the study' },
      REASON,
    ],
  },
  'start-protocol': {
    eyebrow: 'Protocol · new document', title: 'Start a protocol',
    sub: 'Creates the governed protocol document and seeds its ICH M11 section outline.',
    governed: true, submitLabel: 'Start protocol',
    fields: [
      { key: 'title', label: 'Protocol title', type: 'text', required: true, placeholder: 'The full title as it will appear on the cover page' },
      { key: 'protocolKind', label: 'Kind', type: 'seg', options: PROTOCOL_KIND, default: 'clinical', half: true },
      { key: 'protocolNumber', label: 'Protocol number', type: 'text', half: true, placeholder: 'e.g. C2C-101-201' },
      { key: 'phase', label: 'Phase', type: 'text', half: true, placeholder: 'e.g. Phase 2' },
      { key: 'sponsor', label: 'Sponsor', type: 'text', half: true },
      REASON,
    ],
  },
};

/** The drawer for `kind`, opened on the row it acts on. */
export function configFor(kind: PdevFormKind, target?: PdevFormTarget): C2CFormConfig {
  const base = FORMS[kind];
  const defaults = target?.defaults;
  const fields = defaults
    ? base.fields.map((f) => (defaults[f.key] == null ? f : { ...f, default: defaults[f.key] }))
    : base.fields;
  const sub = target?.label ? `${target.label} — ${base.sub ?? ''}`.trim() : base.sub;
  return { ...base, sub, fields };
}

/** The schedule-of-assessments half of the dispatch, kept separate from the
 *  rest so neither switch carries more branches than the repo's lint budget. */
async function submitSchedule(
  kind: PdevFormKind, documentId: number, target: PdevFormTarget | undefined, v: Record<string, string>,
): Promise<boolean> {
  const rowId = Number(target?.id);
  switch (kind) {
    case 'visit-add':
      await addScheduleVisit(documentId, { visitName: v.visitName, timepoint: v.timepoint, reason: v.reason });
      return true;
    case 'visit-rename':
      await renameScheduleVisit(documentId, rowId, { visitName: v.visitName, timepoint: v.timepoint, reason: v.reason });
      return true;
    case 'visit-remove':
      await removeScheduleVisit(documentId, rowId, v.reason);
      return true;
    case 'assessment-add':
      await addSoaAssessment(documentId, { name: v.name, category: v.category, reason: v.reason });
      return true;
    case 'assessment-remove':
      await removeSoaAssessment(documentId, rowId, v.reason);
      return true;
    default:
      return false;
  }
}

/** Every register that is not the schedule of assessments. */
async function submitRegister(
  kind: PdevFormKind, documentId: number, target: PdevFormTarget | undefined, v: Record<string, string>,
): Promise<boolean> {
  const rowId = Number(target?.id);
  switch (kind) {
    case 'risk-residual':
      await updateProtocolRisk(rowId, {
        residualLikelihood: v.residualLikelihood, residualImpact: v.residualImpact,
        owner: v.owner, mitigation: v.mitigation, status: v.status, reason: v.reason,
      });
      return true;
    case 'budget-item':
      await addBudgetItem(documentId, {
        description: v.description, unitCost: optionalNumber(v.unitCost) ?? 0,
        quantityPerSubject: optionalNumber(v.quantityPerSubject),
        category: v.category, payer: v.payer, reason: v.reason,
      });
      return true;
    case 'budget-params':
      await setBudgetParams(documentId, {
        targetEnrollment: optionalNumber(v.targetEnrollment),
        sponsorPaymentPerSubject: optionalNumber(v.sponsorPaymentPerSubject),
        indirectRatePct: optionalNumber(v.indirectRatePct), reason: v.reason,
      });
      return true;
    case 'review-request':
      await requestProtocolReview(documentId, { reviewerName: v.reviewerName, role: v.role, dueDate: v.dueDate, reason: v.reason });
      return true;
    case 'cover-page':
      await updateProtocolHeader(documentId, { sponsor: v.sponsor, principalInvestigator: v.principalInvestigator, reason: v.reason });
      return true;
    case 'start-protocol':
      await startProtocolDocument({
        title: v.title, protocolKind: v.protocolKind || 'clinical', protocolNumber: v.protocolNumber,
        phase: v.phase, sponsor: v.sponsor, reason: v.reason,
      });
      return true;
    default:
      return false;
  }
}

/** Run the write behind `kind`. Throws with the route's own refusal. */
export async function submitPdevForm(
  kind: PdevFormKind, documentId: number, target: PdevFormTarget | undefined, v: Record<string, string>,
): Promise<void> {
  if (await submitSchedule(kind, documentId, target, v)) return;
  if (await submitRegister(kind, documentId, target, v)) return;
  throw new Error(`No write is registered for "${kind}". Nothing was written.`);
}

export interface ProtocolDevFormProps {
  kind: PdevFormKind;
  /** The governed protocol document these writes attach to. */
  documentId: number;
  target?: PdevFormTarget;
  onCancel: () => void;
  /** Fires only once the server has confirmed the write. */
  onDone: (kind: PdevFormKind) => void;
  onError: (message: string) => void;
  /**
   * A disposition is signed, not submitted: the drawer collects the decision
   * and hands it here, and the caller opens the e-signature step.
   */
  onSignRequest?: (kind: 'review-disposition', target: PdevFormTarget | undefined, values: Record<string, string>) => void;
}

export function ProtocolDevForm({ kind, documentId, target, onCancel, onDone, onError, onSignRequest }: ProtocolDevFormProps) {
  const submit = async (v: Record<string, string>) => {
    if (kind === 'review-disposition') {
      if (onSignRequest) onSignRequest(kind, target, v);
      else onError('A disposition is an electronic signature and cannot be recorded from here. Nothing was recorded.');
      return;
    }
    try {
      await submitPdevForm(kind, documentId, target, v);
      onDone(kind);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return <C2CForm config={configFor(kind, target)} onCancel={onCancel} onSubmit={submit} />;
}
