/**
 * Protocol register create-forms — the REAL write path for the protocol
 * operational registers, replacing the reason-only governed dialog whose
 * onConfirm was a no-op (nothing was ever persisted).
 *
 * Each form collects the domain fields its endpoint requires plus the mandatory
 * governed reason-for-change (≥ 8 chars — the server rejects less), and POSTs to
 * the real org-scoped router (mounted in register-inline-routes.ts):
 *   • risk        → POST /api/protocol-risks/documents/:id/risks
 *   • milestone   → POST /api/protocol-milestones/documents/:id/milestones
 *   • amendment   → POST /api/protocol-amendments/amendments   {protocolDocumentId,…}
 *   • deviation   → POST /api/protocol-deviations/deviations   {protocolDocumentId,…}
 *   • objective   → POST /api/protocol-development/documents/:id/objectives
 *   • eligibility → POST /api/protocol-development/documents/:id/eligibility
 *   • finalize    → POST /api/protocol-development/documents/:id/finalize
 *
 * The last three were reached through a governed dialog whose `onConfirm` was
 * `() => {}` — a user completed the reason-for-change ceremony, the dialog
 * closed, and nothing was written. Every endpoint they needed already existed
 * and had no caller. They are the same shape as the four registers (governed
 * form → POST → 201 with the hash-chained governance fields), so they belong to
 * the same module rather than to a fifth spelling of it.
 *
 * Every route records a hash-chained governed action server-side and returns
 * 201 with the created ids + governance fields. On success the caller refetches
 * GET /api/protocol-dev so the register renders the server's row — nothing is
 * appended locally; on failure nothing is persisted and the error is surfaced.
 */
import React from 'react';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';

export type RegisterKind =
  | 'risk' | 'milestone' | 'amendment' | 'deviation'
  | 'objective' | 'eligibility' | 'finalize';

const REASON_FIELD = {
  key: 'reason', label: 'Reason for change (governed)', type: 'textarea' as const, required: true,
  placeholder: 'Why this entry is being recorded — at least 8 characters; written to the audit trail.',
};

const FORMS: Record<RegisterKind, C2CFormConfig> = {
  risk: {
    eyebrow: 'Protocol · risk register', title: 'Add protocol risk',
    sub: 'ICH E6(R2) §5.0 — risk-based quality management. Recorded as a governed action.',
    governed: true, submitLabel: 'Record risk',
    fields: [
      { key: 'description', label: 'Risk description', type: 'textarea', required: true, placeholder: 'e.g. Site staff turnover threatens visit-window compliance' },
      { key: 'category', label: 'Category', type: 'select', options: ['participant_safety', 'data_integrity', 'regulatory', 'operational', 'privacy', 'other'], default: 'operational', half: true },
      { key: 'likelihood', label: 'Likelihood', type: 'select', options: ['rare', 'unlikely', 'possible', 'likely', 'almost_certain'], default: 'possible', half: true },
      { key: 'impact', label: 'Impact', type: 'select', options: ['negligible', 'minor', 'moderate', 'major', 'severe'], default: 'moderate', half: true },
      { key: 'owner', label: 'Owner', type: 'text', half: true, placeholder: 'e.g. Clinical operations lead' },
      { key: 'mitigation', label: 'Mitigation', type: 'textarea', placeholder: 'Planned mitigation / monitoring' },
      REASON_FIELD,
    ],
  },
  milestone: {
    eyebrow: 'Protocol · timeline', title: 'Add milestone',
    sub: 'A governed timeline milestone with a target date.',
    governed: true, submitLabel: 'Record milestone',
    fields: [
      { key: 'name', label: 'Milestone name', type: 'text', required: true, placeholder: 'e.g. First subject first visit' },
      { key: 'milestoneType', label: 'Type', type: 'select', options: ['protocol_approval', 'irb_submission', 'site_activation', 'first_subject', 'last_subject', 'enrollment_complete', 'database_lock', 'csr', 'closeout', 'other'], default: 'other', half: true },
      { key: 'targetDate', label: 'Target date', type: 'date', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      REASON_FIELD,
    ],
  },
  amendment: {
    eyebrow: 'Protocol · amendments', title: 'Create amendment',
    sub: '45 CFR 46.116 / ICH E6(R2) — substantive change review. Recorded as a governed action.',
    governed: true, submitLabel: 'Open amendment',
    fields: [
      { key: 'title', label: 'Amendment title', type: 'text', required: true, placeholder: 'e.g. Amendment 2 — revised eligibility criteria' },
      { key: 'amendmentType', label: 'Type', type: 'seg', options: ['major', 'minor', 'administrative'], default: 'minor', half: true },
      { key: 'rationale', label: 'Rationale', type: 'textarea', placeholder: 'Why the protocol is being amended' },
      REASON_FIELD,
    ],
  },
  deviation: {
    eyebrow: 'Protocol · deviations', title: 'Report deviation',
    sub: 'ICH E6(R2) §4.5 — protocol compliance. Recorded as a governed action.',
    governed: true, submitLabel: 'Report deviation',
    fields: [
      { key: 'description', label: 'What happened', type: 'textarea', required: true, placeholder: 'Describe the deviation from the protocol' },
      { key: 'category', label: 'Category', type: 'select', options: ['enrollment', 'consent', 'procedure', 'safety', 'data', 'other'], default: 'procedure', half: true },
      { key: 'severity', label: 'Severity', type: 'seg', options: ['minor', 'major', 'critical'], default: 'minor', half: true },
      { key: 'rootCause', label: 'Root cause (if known)', type: 'textarea' },
      REASON_FIELD,
    ],
  },
  objective: {
    eyebrow: 'Protocol · objectives & endpoints', title: 'Add objective',
    sub: 'ICH M11 — Objectives & Endpoints. Recorded as a governed action.',
    governed: true, submitLabel: 'Add objective',
    fields: [
      { key: 'objective', label: 'Objective', type: 'textarea', required: true, placeholder: 'e.g. To evaluate the efficacy of X versus placebo' },
      { key: 'objectiveType', label: 'Type', type: 'seg', options: ['primary', 'secondary', 'exploratory'], default: 'primary', half: true },
      { key: 'timepoint', label: 'Timepoint', type: 'text', half: true, placeholder: 'e.g. Week 24' },
      { key: 'endpoint', label: 'Endpoint', type: 'textarea', placeholder: 'The endpoint that measures this objective' },
      REASON_FIELD,
    ],
  },
  eligibility: {
    eyebrow: 'Protocol · study population', title: 'Add eligibility criterion',
    sub: 'ICH M11 — Study Population. Recorded as a governed action.',
    governed: true, submitLabel: 'Add criterion',
    fields: [
      { key: 'criterion', label: 'Criterion', type: 'textarea', required: true, placeholder: 'e.g. Age ≥ 18 years at the time of consent' },
      { key: 'kind', label: 'Arm', type: 'seg', options: ['inclusion', 'exclusion'], default: 'inclusion' },
      REASON_FIELD,
    ],
  },
  finalize: {
    eyebrow: 'Protocol · finalization', title: 'Finalize protocol',
    sub: 'The server re-runs the deterministic completeness gate and refuses if a required section is incomplete. Bumps the version and is recorded as a governed action.',
    governed: true, submitLabel: 'Finalize protocol',
    fields: [REASON_FIELD],
  },
};

/** Strips empty-string optionals so the Zod schemas see absent, not ''. */
function compact(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}

/**
 * POST the create for `kind` against the real register endpoint. Returns the
 * parsed body on success (201) or throws with an honest message.
 */
export async function submitProtocolRegister(
  kind: RegisterKind,
  protocolDocumentId: number,
  v: Record<string, string>,
): Promise<Record<string, unknown>> {
  const reason = (v.reason ?? '').trim();
  if (reason.length < 8) throw new Error('The governed reason must be at least 8 characters.');
  let path: string;
  let body: Record<string, unknown>;
  switch (kind) {
    case 'risk':
      path = `/api/protocol-risks/documents/${protocolDocumentId}/risks`;
      body = compact({ description: v.description, category: v.category, likelihood: v.likelihood, impact: v.impact, mitigation: v.mitigation, owner: v.owner, reason });
      break;
    case 'milestone':
      path = `/api/protocol-milestones/documents/${protocolDocumentId}/milestones`;
      body = compact({ name: v.name, milestoneType: v.milestoneType, targetDate: v.targetDate, notes: v.notes, reason });
      break;
    case 'amendment':
      path = '/api/protocol-amendments/amendments';
      body = { ...compact({ title: v.title, amendmentType: v.amendmentType, rationale: v.rationale, reason }), protocolDocumentId };
      break;
    case 'deviation':
      path = '/api/protocol-deviations/deviations';
      body = { ...compact({ description: v.description, category: v.category, severity: v.severity, rootCause: v.rootCause, reason }), protocolDocumentId };
      break;
    case 'objective':
      path = `/api/protocol-development/documents/${protocolDocumentId}/objectives`;
      body = compact({ objective: v.objective, objectiveType: v.objectiveType, endpoint: v.endpoint, timepoint: v.timepoint, reason });
      break;
    case 'eligibility':
      path = `/api/protocol-development/documents/${protocolDocumentId}/eligibility`;
      body = compact({ criterion: v.criterion, kind: v.kind, reason });
      break;
    case 'finalize':
      path = `/api/protocol-development/documents/${protocolDocumentId}/finalize`;
      body = { reason };
      break;
  }
  const res = await apiRequest('POST', path, body);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401) throw new Error('Not recorded — your session isn’t authenticated.');
  if (!res.ok) {
    const detail =
      (json as any)?.error?.message ?? (json as any)?.error?.code ?? (json as any)?.error ?? `HTTP ${res.status}`;
    const what = kind === 'finalize' ? 'finalize the protocol' : `record the ${kind}`;
    throw new Error(`Couldn’t ${what} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}. Nothing was persisted.`);
  }
  return json ?? {};
}

export interface ProtocolRegisterFormProps {
  kind: RegisterKind;
  /** Numeric c2c_protocol_dev document id the register rows attach to. */
  protocolDocumentId: number;
  onCancel: () => void;
  /** Fires only after the server confirms the 201 write. */
  onDone: (kind: RegisterKind, result: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

export function ProtocolRegisterForm({ kind, protocolDocumentId, onCancel, onDone, onError }: ProtocolRegisterFormProps) {
  const submit = async (v: Record<string, string>) => {
    try {
      const result = await submitProtocolRegister(kind, protocolDocumentId, v);
      onDone(kind, result);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return <C2CForm config={FORMS[kind]} onCancel={onCancel} onSubmit={submit} />;
}
