/**
 * The nonconformance, supplier, internal audit and management review registers'
 * configurations (QmsRecords.tsx; server/routes/mdx-qms.ts; decision P-48).
 *
 * @module client/src/concept2cure/quality/qmsRecordRegisters
 */
import * as React from 'react';
import { I } from '../v2/icons';
import { formatDate } from './data';
import { ReviewActions } from './ReviewActions';
import { CAPA_SOURCE_KIND } from './capaSources';
import {
  AUDIT_STATUS_LABEL, CRITICALITY_LABEL, DISPOSITION_LABEL, NC_SOURCE_LABEL, SUPPLIER_STATUS_LABEL, createInternalAudit, createManagementReview, createNonconformance, createSupplier, isPast, isUndispositioned, reviewText, updateInternalAudit, updateSupplier, addReviewAction, reviewActions, type InternalAuditRow, type ManagementReviewRow, type NonconformanceRow, type SupplierRow,
} from './qmsRecordData';
import { type PillTone, type RegisterConfig, optionsOf, pill, num, Refused } from './qmsRegisterKit';
import { raiseCapaFrom } from './qmsCapaRegister';
import { signNcDisposition, signSupplierApproval } from './qmsApproval';
import { documentLabel, type RegisterContext } from './registerContext';
import type { C2CFormField } from '../v2/C2CForm';

const DISPOSITION_TONE: Record<string, PillTone> = {
  use_as_is: 'effective', rework: 'review', regrade: 'review', scrap: 'muted', return_to_supplier: 'muted',
};
const SUPPLIER_TONE: Record<string, PillTone> = { approved: 'effective', conditional: 'review', pending: 'draft', revoked: 'err' };
const AUDIT_TONE: Record<string, PillTone> = { planned: 'draft', in_progress: 'review', closed: 'effective', cancelled: 'muted' };

export const NONCONFORMANCES: RegisterConfig<NonconformanceRow> = {
  title: 'Nonconformances',
  sub:
    'Nonconforming product and material, from detection to disposition. Each record names the product or ' +
    'material, the lot, where it was found and what was found; the disposition and its rationale are recorded ' +
    'against it under your name. Link a nonconformance to the change or CAPA it raises from change control.',
  noun: ['nonconformance', 'nonconformances'],
  listPath: '/api/mdx/qms/nonconforming',
  grid: '120px minmax(0, 1fr) 160px 120px 140px 104px 120px',
  columns: [
    { label: 'Number', cell: (r) => <span className="mono">{r.nc_number}</span> },
    { label: 'What was found', cell: (r) => <span title={r.description}>{r.description}</span> },
    { label: 'Product · lot', cell: (r) => [r.device_name, r.lot_or_serial].filter(Boolean).join(' · ') || '—' },
    { label: 'Source', cell: (r) => (r.source ? <span className="qms-tag">{NC_SOURCE_LABEL[r.source] ?? r.source}</span> : '—') },
    {
      label: 'Disposition',
      cell: (r) => (isUndispositioned(r)
        ? pill('draft', 'Awaiting disposition')
        : pill(DISPOSITION_TONE[r.disposition!] ?? 'muted', DISPOSITION_LABEL[r.disposition!] ?? r.disposition!)),
    },
    { label: 'Detected', cell: (r) => formatDate(r.detected_at) },
  ],
  kpis: (rows) => {
    const open = rows.filter(isUndispositioned).length;
    return [
      { label: 'Recorded', val: String(rows.length), sub: 'In the register' },
      { label: 'Awaiting disposition', val: String(open), sub: open ? 'No decision recorded' : 'Every one decided', tone: open ? 'warn' : 'ok' },
      { label: 'Dispositioned', val: String(rows.length - open), sub: 'Decision and rationale on record' },
    ];
  },
  createLabel: 'Record nonconformance',
  createForm: {
    eyebrow: 'Quality',
    title: 'Record a nonconformance',
    sub: 'Recorded as awaiting disposition. The disposition and its rationale are a separate entry.',
    governed: 'Recording a nonconformance writes an audit entry under your name.',
    submitLabel: 'Record',
    fields: [
      { key: 'ncNumber', label: 'Number', type: 'text', required: true, half: true, placeholder: 'NC-2026-001', desc: 'As it appears in your quality records.' },
      { key: 'source', label: 'Where it was found', type: 'select', half: true, options: optionsOf(NC_SOURCE_LABEL) },
      { key: 'deviceName', label: 'Product or material', type: 'text', half: true },
      { key: 'lotOrSerial', label: 'Lot or batch', type: 'text', half: true },
      { key: 'description', label: 'What was found', type: 'textarea', rows: 4, required: true },
    ],
  },
  create: async (v) => {
    const row = await createNonconformance({
      ncNumber: v.ncNumber.trim(), description: v.description.trim(), source: v.source,
      deviceName: v.deviceName.trim(), lotOrSerial: v.lotOrSerial.trim(),
    });
    return `${row.nc_number} was recorded as awaiting disposition.`;
  },
  rowActions: [{
    label: 'Disposition',
    title: 'Decide the disposition, then sign it',
    show: isUndispositioned,
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Disposition ${r.nc_number}`,
      sub: r.description,
      governed: 'You sign the disposition in the next step. Your reason is recorded as its rationale, and a signed disposition is not changed.',
      submitLabel: 'Continue to sign',
      fields: [
        {
          key: 'disposition', label: 'Disposition', type: 'select', required: true,
          options: optionsOf(DISPOSITION_LABEL).filter((o) => o.value !== 'pending'),
        },
      ],
    }),
    sign: (r, v) => {
      const label = v.disposition === 'pending' ? undefined : DISPOSITION_LABEL[v.disposition];
      if (!label) throw new Refused('choose a disposition.');
      return {
        action: 'Sign disposition',
        target: `${r.nc_number} ${r.description}`.slice(0, 160),
        meta: `You sign the disposition of ${r.nc_number} as ${label}. Your reason is recorded as its rationale. A signed disposition is not changed.`,
        rows: [{ label: 'Disposition', value: label }, ...(r.lot_or_serial ? [{ label: 'Lot or serial', value: r.lot_or_serial }] : [])],
        meanings: ['approval', 'responsibility'],
        post: (input) => signNcDisposition(r.id, v.disposition, input),
        done: `${r.nc_number}: ${label} was signed.`,
      };
    },
  }, raiseCapaFrom<NonconformanceRow>({
    source: 'nonconformance',
    ref: (r) => ({ kind: CAPA_SOURCE_KIND.nonconforming, id: String(r.id), label: r.nc_number }),
    title: (r) => `${r.nc_number}: ${r.description}`.slice(0, 200),
    problem: (r) => [r.description, [r.device_name, r.lot_or_serial].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
  })],
  capaSourceKind: CAPA_SOURCE_KIND.nonconforming,
  ask: 'Give me a read-out on nonconformances: which are awaiting disposition, how long each has been open, and which recur by product, lot or source.',
  askRow: (r) => `Summarise nonconformance ${r.nc_number}: what was found, its disposition, and whether it needs a CAPA or a change.`,
  facts: (r) => ({
    nonconformance: r.nc_number, found: r.description, product: r.device_name, lot: r.lot_or_serial, source: r.source,
    disposition: isUndispositioned(r) ? 'awaiting disposition' : r.disposition, detected: r.detected_at?.slice(0, 10) ?? null,
  }),
};

/* A supplier's quality agreement is one of this organisation's controlled
   documents (the server refuses any other: mdx-qms.ts qualityAgreementRefusal).
   Effective documents are listed first; an unread or failed read says so. */
export function qualityAgreementField(ctx: RegisterContext, current: number | null): C2CFormField {
  const docs = [...(ctx.documents ?? [])].sort((a, b) => Number(b.status === 'effective') - Number(a.status === 'effective'));
  const options = docs.map((d) => ({ value: String(d.id), label: `${d.docNumber} · ${d.title}${d.status === 'effective' ? '' : ` (${d.status.replace('_', ' ')})`}` }));
  if (current != null && !docs.some((d) => d.id === current)) options.unshift({ value: String(current), label: documentLabel(ctx, current) });
  let descStatus = '';
  if (ctx.documentsFailed) descStatus = 'The controlled documents could not be read, so none can be chosen now.';
  else if (!ctx.documents) descStatus = 'Reading the controlled documents…';
  else if (docs.length === 0) descStatus = 'No controlled document is recorded yet.';
  return {
    key: 'qualityAgreementId', label: 'Quality agreement', type: 'select',
    options,
    default: current == null ? '' : String(current),
    desc: 'The controlled document that is this supplier\'s quality agreement.',
    descStatus,
  };
}
const agreementId = (v: string | undefined) => (v ? Number(v) : undefined);

export const SUPPLIERS: RegisterConfig<SupplierRow> = {
  title: 'Suppliers',
  sub:
    'Your approved supplier list: what each supplier provides, how critical it is, its approval standing, and ' +
    'when it is next due for audit and re-approval. A supplier is approved, conditionally approved or revoked by your signature.',
  noun: ['supplier', 'suppliers'],
  listPath: '/api/mdx/qms/suppliers',
  grid: 'minmax(0, 1fr) minmax(0, 1fr) 96px 120px 110px 110px 130px',
  needs: { documents: true },
  columns: [
    {
      label: 'Supplier',
      cell: (r) => <span title={r.supplier_name}>{r.supplier_name}{r.supplier_code ? <span className="mono"> · {r.supplier_code}</span> : null}</span>,
    },
    { label: 'Supplies', cell: (r) => <span title={r.scope ?? ''}>{r.scope || '—'}</span> },
    { label: 'Criticality', cell: (r) => <span className="qms-tag">{CRITICALITY_LABEL[r.criticality] ?? r.criticality}</span> },
    { label: 'Approval', cell: (r) => pill(SUPPLIER_TONE[r.approval_status] ?? 'muted', SUPPLIER_STATUS_LABEL[r.approval_status] ?? r.approval_status) },
    { label: 'Next audit', cell: (r) => formatDate(r.next_audit_date) },
    { label: 'Re-approval', cell: (r) => formatDate(r.reapproval_date) },
    { label: 'Quality agreement', cell: (r, ctx) => <span className="mono">{documentLabel(ctx, r.quality_agreement_id)}</span> },
  ],
  kpis: (rows, today) => {
    const unapprovedCritical = rows.filter((r) => r.criticality === 'critical' && r.approval_status !== 'approved').length;
    const auditDue = rows.filter((r) => isPast(r.next_audit_date, today)).length;
    return [
      { label: 'Suppliers', val: String(rows.length), sub: `${rows.filter((r) => r.approval_status === 'approved').length} approved` },
      { label: 'Critical, not approved', val: String(unapprovedCritical), sub: unapprovedCritical ? 'Pending, conditional or revoked' : 'None', tone: unapprovedCritical ? 'err' : 'ok' },
      { label: 'Audit past due', val: String(auditDue), sub: auditDue ? 'Next audit date has passed' : 'None past due', tone: auditDue ? 'warn' : 'ok' },
    ];
  },
  createLabel: 'Add supplier',
  createForm: (ctx) => ({
    eyebrow: 'Quality',
    title: 'Add a supplier',
    sub: 'Recorded as pending. Approve it with your signature from the register (Approval).',
    governed: 'Adding a supplier writes an audit entry under your name.',
    submitLabel: 'Add supplier',
    fields: [
      { key: 'supplierName', label: 'Supplier', type: 'text', required: true, half: true },
      { key: 'supplierCode', label: 'Supplier code', type: 'text', half: true },
      { key: 'scope', label: 'What it supplies', type: 'textarea', rows: 2, placeholder: 'Drug substance, GMP manufacture; release testing' },
      { key: 'criticality', label: 'Criticality', type: 'seg', required: true, options: optionsOf(CRITICALITY_LABEL) },
      { key: 'nextAuditDate', label: 'Next audit', type: 'date', half: true },
      { key: 'reapprovalDate', label: 'Re-approval due', type: 'date', half: true },
      qualityAgreementField(ctx, null),
    ],
  }),
  create: async (v) => {
    const row = await createSupplier({
      supplierName: v.supplierName.trim(), supplierCode: v.supplierCode.trim(), scope: v.scope.trim(),
      criticality: v.criticality, nextAuditDate: v.nextAuditDate, reapprovalDate: v.reapprovalDate, qualityAgreementId: agreementId(v.qualityAgreementId),
    });
    return `${row.supplier_name} was added as ${(SUPPLIER_STATUS_LABEL[row.approval_status] ?? row.approval_status).toLowerCase()}.`;
  },
  rowActions: [{
    label: 'Update',
    title: 'Record audit dates, the re-approval date or the quality agreement',
    form: (r, ctx) => ({
      eyebrow: 'Quality',
      title: `Update ${r.supplier_name}`,
      sub: `Currently ${(SUPPLIER_STATUS_LABEL[r.approval_status] ?? r.approval_status).toLowerCase()}. Only the fields you change are recorded. Approval standing is signed (Approval).`,
      governed: 'The update is written to the audit trail under your name.',
      submitLabel: 'Record update',
      fields: [
        { key: 'lastAuditDate', label: 'Last audit', type: 'date', half: true, default: r.last_audit_date?.slice(0, 10) ?? '' },
        { key: 'nextAuditDate', label: 'Next audit', type: 'date', half: true, default: r.next_audit_date?.slice(0, 10) ?? '' },
        { key: 'reapprovalDate', label: 'Re-approval due', type: 'date', half: true, default: r.reapproval_date?.slice(0, 10) ?? '' },
        qualityAgreementField(ctx, r.quality_agreement_id),
      ],
    }),
    submit: async (r, v) => {
      const before: Record<string, string> = {
        lastAuditDate: r.last_audit_date?.slice(0, 10) ?? '', nextAuditDate: r.next_audit_date?.slice(0, 10) ?? '',
        reapprovalDate: r.reapproval_date?.slice(0, 10) ?? '',
        qualityAgreementId: r.quality_agreement_id == null ? '' : String(r.quality_agreement_id),
      };
      /* What the person changed, with the value they chose (never the value it had). */
      const changed: Record<string, string | number> = Object.fromEntries(
        Object.entries(before).filter(([k, was]) => (v[k] ?? '') !== was && v[k] !== '').map(([k]) => [k, v[k]]));
      if (Object.keys(changed).length === 0) throw new Refused('nothing was changed.');
      if (typeof changed.qualityAgreementId === 'string') changed.qualityAgreementId = Number(changed.qualityAgreementId);
      await updateSupplier(r.id, changed);
      return `${r.supplier_name} was updated.`;
    },
  }, {
    label: 'Approval',
    title: 'Approve, conditionally approve or revoke this supplier with your signature',
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Approval of ${r.supplier_name}`,
      sub: `Currently ${(SUPPLIER_STATUS_LABEL[r.approval_status] ?? r.approval_status).toLowerCase()}.`,
      governed: 'You sign the decision in the next step, with your reason. Approving dates the approval today.',
      submitLabel: 'Continue to sign',
      fields: [{
        key: 'approvalStatus', label: 'Standing', type: 'select', required: true,
        options: optionsOf(SUPPLIER_STATUS_LABEL).filter((o) => o.value !== 'pending' && o.value !== r.approval_status),
      }],
    }),
    sign: (r, v) => {
      const label = v.approvalStatus === 'pending' || v.approvalStatus === r.approval_status ? undefined : SUPPLIER_STATUS_LABEL[v.approvalStatus];
      if (!label) throw new Refused('choose a standing other than the current one.');
      return {
        action: 'Sign supplier standing',
        target: r.supplier_code ? `${r.supplier_name} (${r.supplier_code})` : r.supplier_name,
        meta: `You sign ${r.supplier_name} as ${label.toLowerCase()}. Your reason is recorded with the signature.`,
        rows: [{ label: 'Standing', value: label }, { label: 'Criticality', value: CRITICALITY_LABEL[r.criticality] ?? r.criticality }],
        meanings: ['approval', 'responsibility'],
        post: (input) => signSupplierApproval(r.id, v.approvalStatus, input),
        done: `${r.supplier_name} is now ${label.toLowerCase()}.`,
      };
    },
  }, raiseCapaFrom<SupplierRow>({
    source: 'supplier',
    ref: (r) => ({ kind: CAPA_SOURCE_KIND.supplier, id: String(r.id), label: r.supplier_code || r.supplier_name }),
    title: (r) => `Supplier issue: ${r.supplier_name}`,
    problem: (r) => [r.supplier_name, r.scope].filter(Boolean).join(': '),
  })],
  capaSourceKind: CAPA_SOURCE_KIND.supplier,
  ask: 'Give me a read-out on suppliers: which critical suppliers are not approved, whose audits or re-approvals are past due, and what falls due next quarter.',
  askRow: (r) => `Summarise supplier ${r.supplier_name}: what it supplies, its approval standing, and what its qualification needs next.`,
  facts: (r, ctx) => ({
    supplier: r.supplier_name, code: r.supplier_code, supplies: r.scope, criticality: r.criticality, approval: r.approval_status,
    nextAudit: r.next_audit_date?.slice(0, 10) ?? null, reapprovalDue: r.reapproval_date?.slice(0, 10) ?? null,
    qualityAgreement: documentLabel(ctx, r.quality_agreement_id),
  }),
};

export const AUDITS: RegisterConfig<InternalAuditRow> = {
  title: 'Internal audits',
  sub:
    'Your internal audit programme: what each audit covers, against which standard, when it is planned, and ' +
    'what it found. Progress and findings are recorded against the audit under your name.',
  noun: ['audit', 'audits'],
  listPath: '/api/mdx/qms/internal-audits',
  grid: '120px minmax(0, 1fr) 140px 104px 110px 160px',
  columns: [
    { label: 'Number', cell: (r) => <span className="mono">{r.audit_number}</span> },
    { label: 'Scope', cell: (r) => <span title={r.scope}>{r.scope}</span> },
    { label: 'Standard', cell: (r) => r.audit_standard || '—' },
    { label: 'Planned', cell: (r) => formatDate(r.planned_date) },
    { label: 'Status', cell: (r) => pill(AUDIT_TONE[r.status] ?? 'muted', AUDIT_STATUS_LABEL[r.status] ?? r.status) },
    {
      label: 'Findings',
      cell: (r) => (r.status === 'planned' ? '—' : `${r.major_findings ?? 0} major · ${r.minor_findings ?? 0} minor · ${r.observations ?? 0} obs.`),
    },
  ],
  kpis: (rows, today) => {
    const overdue = rows.filter((r) => r.status === 'planned' && isPast(r.planned_date, today)).length;
    const major = rows.reduce((n, r) => n + (r.major_findings ?? 0), 0);
    return [
      { label: 'Audits', val: String(rows.length), sub: `${rows.filter((r) => r.status === 'closed').length} closed` },
      { label: 'Planned, date passed', val: String(overdue), sub: overdue ? 'Not started by the planned date' : 'None', tone: overdue ? 'warn' : 'ok' },
      { label: 'Major findings', val: String(major), sub: 'Across every audit', tone: major ? 'err' : 'ok' },
    ];
  },
  createLabel: 'Plan audit',
  createForm: {
    eyebrow: 'Quality',
    title: 'Plan an internal audit',
    sub: 'Recorded as planned. Start, completion and findings are recorded as the audit runs.',
    governed: 'Planning an audit writes an audit entry under your name.',
    submitLabel: 'Plan audit',
    fields: [
      { key: 'auditNumber', label: 'Number', type: 'text', required: true, half: true, placeholder: 'IA-2026-01' },
      { key: 'plannedDate', label: 'Planned for', type: 'date', half: true },
      { key: 'auditStandard', label: 'Standard', type: 'text', placeholder: '21 CFR 211, EU GMP Part I, ICH Q10' },
      { key: 'scope', label: 'Scope', type: 'textarea', rows: 3, required: true, desc: 'The processes, areas or regulations the audit covers.' },
    ],
  },
  create: async (v) => {
    const row = await createInternalAudit({
      auditNumber: v.auditNumber.trim(), scope: v.scope.trim(), auditStandard: v.auditStandard.trim(), plannedDate: v.plannedDate,
    });
    return `${row.audit_number} was planned.`;
  },
  rowActions: [{
    label: 'Update',
    title: 'Record the audit’s progress and findings',
    show: (r) => r.status !== 'closed' && r.status !== 'cancelled',
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Update ${r.audit_number}`,
      sub: r.scope,
      governed: 'The update is written to the audit trail under your name.',
      submitLabel: 'Record update',
      fields: [
        { key: 'status', label: 'Status', type: 'select', required: true, options: optionsOf(AUDIT_STATUS_LABEL), default: r.status },
        { key: 'startedAt', label: 'Started', type: 'date', half: true, default: r.started_at?.slice(0, 10) ?? '' },
        { key: 'completedAt', label: 'Completed', type: 'date', half: true, default: r.completed_at?.slice(0, 10) ?? '' },
        { key: 'majorFindings', label: 'Major findings', type: 'number', min: 0, half: true, default: String(r.major_findings ?? 0) },
        { key: 'minorFindings', label: 'Minor findings', type: 'number', min: 0, half: true, default: String(r.minor_findings ?? 0) },
        { key: 'observations', label: 'Observations', type: 'number', min: 0, half: true, default: String(r.observations ?? 0) },
      ],
    }),
    submit: async (r, v) => {
      if (v.status === 'closed' && !v.completedAt) throw new Refused('a closed audit needs its completion date.');
      await updateInternalAudit(r.id, {
        status: v.status, startedAt: v.startedAt, completedAt: v.completedAt,
        majorFindings: num(v.majorFindings), minorFindings: num(v.minorFindings), observations: num(v.observations),
      });
      return `${r.audit_number} was updated (${(AUDIT_STATUS_LABEL[v.status] ?? v.status).toLowerCase()}).`;
    },
  }, raiseCapaFrom<InternalAuditRow>({
    source: 'internal_audit',
    ref: (r) => ({ kind: CAPA_SOURCE_KIND.audit, id: String(r.id), label: r.audit_number }),
    title: (r) => `Findings of ${r.audit_number}`,
    problem: (r) => `${r.scope}\n${r.major_findings ?? 0} major and ${r.minor_findings ?? 0} minor findings.`,
    show: (r) => r.status !== 'planned' && r.status !== 'cancelled',
  })],
  capaSourceKind: CAPA_SOURCE_KIND.audit,
  ask: 'Give me a read-out on the internal audit programme: what is planned and overdue, which audits found major findings, and which areas have not been audited this year.',
  askRow: (r) => `Summarise internal audit ${r.audit_number}: its scope, status and findings, and what follow-up it needs.`,
  facts: (r) => ({
    audit: r.audit_number, scope: r.scope, standard: r.audit_standard, planned: r.planned_date?.slice(0, 10) ?? null, status: r.status,
    majorFindings: r.major_findings, minorFindings: r.minor_findings, observations: r.observations,
  }),
};

export const REVIEWS: RegisterConfig<ManagementReviewRow> = {
  title: 'Management reviews',
  sub:
    'The record of each management review of the quality system (ICH Q10 §2.6): the period it covered, what ' +
    'was reviewed, and the decisions and actions that came out of it. Each review is recorded under your name.',
  noun: ['review', 'reviews'],
  listPath: '/api/mdx/qms/management-reviews',
  grid: '120px 104px minmax(0, 1fr) minmax(0, 1fr) 110px',
  columns: [
    { label: 'Period', cell: (r) => <span className="mono">{r.period}</span> },
    { label: 'Held', cell: (r) => formatDate(r.review_date) },
    { label: 'Reviewed', cell: (r) => <span title={reviewText(r.inputs, 'summary')}>{reviewText(r.inputs, 'summary') || '—'}</span> },
    { label: 'Decisions', cell: (r) => <span title={reviewText(r.outputs, 'decisions')}>{reviewText(r.outputs, 'decisions') || '—'}</span> },
    {
      label: 'Actions',
      cell: (r) => {
        const a = reviewActions(r);
        const open = a.filter((x) => x.state === 'open').length;
        return a.length ? `${open} open · ${a.length - open} closed` : 'None';
      },
    },
  ],
  kpis: (rows) => [
    { label: 'Reviews', val: String(rows.length), sub: 'On record' },
    (() => {
      const open = rows.flatMap(reviewActions).filter((a) => a.state === 'open').length;
      return { label: 'Open actions', val: String(open), sub: open ? 'Decided, not yet closed' : 'None open', tone: open ? 'warn' as const : 'ok' as const };
    })(),
    { label: 'Most recent', val: rows[0] ? formatDate(rows[0].review_date) : '—', sub: rows[0] ? rows[0].period : 'No review recorded', tone: rows[0] ? undefined : 'warn' },
  ],
  createLabel: 'Record review',
  createForm: {
    eyebrow: 'Quality',
    title: 'Record a management review',
    sub: 'Recorded with you as chair.',
    governed: 'Recording a management review writes an audit entry under your name.',
    submitLabel: 'Record review',
    fields: [
      { key: 'period', label: 'Period covered', type: 'text', required: true, half: true, placeholder: 'H2-2026' },
      { key: 'reviewDate', label: 'Held on', type: 'date', required: true, half: true },
      { key: 'inputs', label: 'What was reviewed', type: 'textarea', rows: 4, placeholder: 'Deviations and CAPAs, audit results, supplier performance, complaints, change control, training' },
      { key: 'outputs', label: 'Decisions and actions', type: 'textarea', rows: 4 },
    ],
  },
  create: async (v) => {
    const row = await createManagementReview({
      period: v.period.trim(), reviewDate: v.reviewDate, inputs: v.inputs.trim(), outputs: v.outputs.trim(),
    });
    return `The ${row.period} management review was recorded.`;
  },
  rowActions: [{
    label: 'Add action',
    title: 'Record an action this review decided, with its owner and due date',
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Add an action to the ${r.period} management review`,
      governed: 'The action is written to the audit trail under your name.',
      submitLabel: 'Add action',
      fields: [
        { key: 'description', label: 'Action', type: 'textarea', rows: 3, required: true },
        { key: 'owner', label: 'Owner', type: 'text', half: true },
        { key: 'dueDate', label: 'Due', type: 'date', half: true },
      ],
    }),
    submit: async (r, v) => {
      const row = await addReviewAction(r.id, { description: v.description.trim(), owner: v.owner.trim(), dueDate: v.dueDate });
      return `Action ${reviewActions(row).at(-1)?.n ?? ''} was added to the ${r.period} review.`;
    },
  }, raiseCapaFrom<ManagementReviewRow>({
    source: 'management_review',
    ref: (r) => ({ kind: CAPA_SOURCE_KIND.review, id: String(r.id), label: `Management review ${r.period}` }),
    title: (r) => `Action from the ${r.period} management review`,
    problem: (r) => reviewText(r.outputs, 'decisions'),
  })],
  detail: { label: 'Show actions', render: (r, onChanged) => <ReviewActions review={r} onChanged={onChanged} /> },
  capaSourceKind: CAPA_SOURCE_KIND.review,
  ask: 'Prepare the inputs for our next management review from the quality records: nonconformances and their dispositions, internal audit findings, supplier standing, and change control.',
  askRow: (r) => `Summarise the ${r.period} management review: what it reviewed, what it decided, and which actions are still open.`,
  facts: (r) => {
    const actions = reviewActions(r);
    return {
      period: r.period, held: r.review_date?.slice(0, 10) ?? null, reviewed: reviewText(r.inputs, 'summary') || null,
      decisions: reviewText(r.outputs, 'decisions') || null,
      openActions: actions.filter((a) => a.state === 'open').length, closedActions: actions.filter((a) => a.state === 'closed').length,
    };
  },
};

