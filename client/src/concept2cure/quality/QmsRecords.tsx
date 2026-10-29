/**
 * QmsRecords — the Quality registers beside controlled documents and change
 * control: CAPA, nonconformances, suppliers, internal audits and management
 * reviews.
 *
 * One register component, five configurations. Each reads its tenant-scoped
 * list route, raises a record through a drawer, and (where the server has an
 * update route) records the next fact about a row: a nonconformance's
 * disposition, a supplier's approval and audit dates, an audit's progress and
 * findings, a CAPA's next lifecycle move and its action items. Every write is the server's, and each records its audit row under
 * the signed-in person (server/routes/mdx-qms.ts, server/routes/capa-mdr.ts). A failed read is shown as a
 * failure, never as an empty register. Counts are taken from the rows shown.
 *
 * @module client/src/concept2cure/quality/QmsRecords
 */

import * as React from 'react';
import { I } from '../v2/icons';
import { C2CForm, type C2CFormConfig } from '../v2/C2CForm';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { registerRowMinWidth } from './registerGrid';
import { listOf } from './changeHooks';
import { formatDate } from './data';
import { Kpi } from './Kpi';
import { CapaActions } from './CapaActions';
import { shellProgramId } from '../v2/shellProject';
import {
  CAPA_ACTION_TYPE_LABEL, CAPA_SOURCE_LABEL, CAPA_STATE_LABEL, CAPA_TYPE_LABEL, RISK_LABEL,
  addCapaAction, capaMoves, createCapa, isCapaClosed, transitionCapa, type CapaRow, type CapaSourceRef,
  AUDIT_STATUS_LABEL, CRITICALITY_LABEL, DISPOSITION_LABEL, NC_SOURCE_LABEL, SUPPLIER_STATUS_LABEL,
  createInternalAudit, createManagementReview, createNonconformance, createSupplier,
  dispositionNonconformance, isPast, isUndispositioned, reviewText, updateInternalAudit, updateSupplier,
  type InternalAuditRow, type ManagementReviewRow, type NonconformanceRow, type QmsRecordTab, type SupplierRow,
} from './qmsRecordData';

type Tone = 'ok' | 'warn' | 'err';
type PillTone = 'draft' | 'review' | 'effective' | 'muted' | 'err';

interface Column<R> { label: string; cell: (r: R) => React.ReactNode }
interface KpiSpec { label: string; val: string; sub: string; tone?: Tone }

type RowAction<R> = {
  label: string;
  title: string;
  show?: (r: R) => boolean;
  form: (r: R) => Omit<C2CFormConfig, 'notice'>;
  /** Returns the confirmation, or throws a refusal the drawer shows. */
  submit: (r: R, v: Record<string, string>) => Promise<string>;
};

interface RegisterConfig<R extends { id: number | string }> {
  title: string;
  sub: string;
  /** Singular and plural, lower case. */
  noun: [string, string];
  listPath: string;
  grid: string;
  columns: Column<R>[];
  kpis: (rows: R[], today: string) => KpiSpec[];
  createLabel: string;
  createForm: Omit<C2CFormConfig, 'notice'>;
  create: (v: Record<string, string>) => Promise<string>;
  /** The updates a row takes, where the server has them. */
  rowActions?: RowAction<R>[];
  ask: string;
  askRow: (r: R) => string;
  /** What a row opens to, under it; its first cell becomes the toggle. */
  detail?: { label: string; render: (r: R, onChanged: () => void) => React.ReactNode };
}

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const pill = (tone: PillTone, text: string) => <span className="qms-pill" data-tone={tone}>{text}</span>;
const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;
const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.trunc(Number(s))));

/** A refusal the drawer shows; the write was not attempted. */
class Refused extends Error {}

const DISPOSITION_TONE: Record<string, PillTone> = {
  use_as_is: 'effective', rework: 'review', regrade: 'review', scrap: 'muted', return_to_supplier: 'muted',
};
const SUPPLIER_TONE: Record<string, PillTone> = { approved: 'effective', conditional: 'review', pending: 'draft', revoked: 'err' };
const AUDIT_TONE: Record<string, PillTone> = { planned: 'draft', in_progress: 'review', closed: 'effective', cancelled: 'muted' };

const CAPA_TONE: Partial<Record<CapaRow['state'], PillTone>> = {
  open: 'draft', closed_effective: 'effective', closed_not_effective: 'err', escalated: 'err',
};

const CAPA_FIELDS: C2CFormConfig['fields'] = [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'seg', required: true, options: optionsOf(CAPA_TYPE_LABEL) },
  { key: 'source', label: 'Raised from', type: 'select', required: true, half: true, options: optionsOf(CAPA_SOURCE_LABEL) },
  { key: 'riskLevel', label: 'Risk', type: 'select', half: true, options: optionsOf(RISK_LABEL), default: 'medium' },
  { key: 'targetCloseDate', label: 'Target close', type: 'date', half: true },
  { key: 'problemStatement', label: 'Problem statement', type: 'textarea', rows: 4, desc: 'What happened, where, and the evidence for it.' },
];

/** Raise a CAPA in the open project; with `from`, the record it was raised from. */
async function raiseCapa(v: Record<string, string>, from?: CapaSourceRef): Promise<string> {
  const programId = shellProgramId();
  if (!programId) throw new Refused('open a project first. A CAPA belongs to a project.');
  const row = await createCapa({
    programId, title: v.title.trim(), type: v.type, source: v.source, riskLevel: v.riskLevel,
    targetCloseDate: v.targetCloseDate, problemStatement: v.problemStatement.trim(),
    ...(from ? { sourceRefs: [from] } : {}),
  });
  return from ? `${row.capaCode} was raised from ${from.label}.` : `${row.capaCode} was raised.`;
}

/** The "Raise CAPA" a quality record takes: the CAPA form, started from the record. */
function raiseCapaFrom<R>(o: {
  source: string; ref: (r: R) => CapaSourceRef; title: (r: R) => string; problem: (r: R) => string; show?: (r: R) => boolean;
}): RowAction<R> {
  return {
    label: 'Raise CAPA',
    title: 'Raise a CAPA from this record, in the open project',
    show: o.show,
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Raise a CAPA from ${o.ref(r).label}`,
      sub: 'Raised in the project you have open, as open, with this record as its source.',
      governed: 'Raising a CAPA writes an audit entry under your name.',
      submitLabel: 'Raise CAPA',
      fields: CAPA_FIELDS.map((f) =>
        f.key === 'title' ? { ...f, default: o.title(r) }
          : f.key === 'source' ? { ...f, default: o.source }
            : f.key === 'problemStatement' ? { ...f, default: o.problem(r) }
              : f),
    }),
    submit: (r, v) => raiseCapa(v, o.ref(r)),
  };
}

const CAPAS: RegisterConfig<CapaRow> = {
  title: 'CAPA',
  sub:
    'Corrective and preventive actions, from the problem to the check that the fix worked: investigation, ' +
    'the action plan and its actions, implementation and the effectiveness check. Each move is the lifecycle ' +
    'the server enforces, recorded with its reason under your name. A CAPA belongs to a project.',
  noun: ['CAPA', 'CAPAs'],
  listPath: '/api/capa-mdr/capa',
  grid: '120px minmax(0, 1fr) 150px 130px 84px 150px 104px',
  columns: [
    { label: 'Number', cell: (r) => <span className="mono">{r.capaCode}</span> },
    { label: 'Title', cell: (r) => <span title={r.problemStatement ?? r.title}>{r.title}</span> },
    { label: 'Type', cell: (r) => CAPA_TYPE_LABEL[r.type] ?? r.type },
    {
      label: 'Source',
      cell: (r) => (
        <span title={r.sourceRefs?.map((s) => s.label).join(', ') || undefined}>
          <span className="qms-tag">{CAPA_SOURCE_LABEL[r.source] ?? r.source}</span>
          {r.sourceRefs?.[0] ? <span className="mono"> {r.sourceRefs[0].label}</span> : null}
        </span>
      ),
    },
    { label: 'Risk', cell: (r) => RISK_LABEL[r.riskLevel] ?? r.riskLevel },
    { label: 'State', cell: (r) => pill(CAPA_TONE[r.state] ?? 'review', CAPA_STATE_LABEL[r.state] ?? r.state) },
    { label: 'Target close', cell: (r) => formatDate(r.targetCloseDate) },
  ],
  kpis: (rows, today) => {
    const open = rows.filter((r) => !isCapaClosed(r));
    const late = open.filter((r) => isPast(r.targetCloseDate, today)).length;
    const highRisk = open.filter((r) => r.riskLevel === 'high' || r.riskLevel === 'critical').length;
    return [
      { label: 'Open CAPAs', val: String(open.length), sub: `${rows.length} in the register` },
      { label: 'Past target close', val: String(late), sub: late ? 'Open after the target date' : 'None late', tone: late ? 'err' : 'ok' },
      { label: 'High or critical risk', val: String(highRisk), sub: 'Open', tone: highRisk ? 'warn' : 'ok' },
      {
        label: 'Closed, not effective', val: String(rows.filter((r) => r.state === 'closed_not_effective').length),
        sub: 'The effectiveness check failed',
      },
    ];
  },
  createLabel: 'Raise CAPA',
  createForm: {
    eyebrow: 'Quality',
    title: 'Raise a CAPA',
    sub: 'Raised in the project you have open, as open. Its number is assigned by the server.',
    governed: 'Raising a CAPA writes an audit entry under your name.',
    submitLabel: 'Raise CAPA',
    fields: CAPA_FIELDS,
  },
  create: (v) => raiseCapa(v),
  rowActions: [
    {
      label: 'Advance',
      title: 'Move this CAPA to its next lifecycle state, with a reason',
      show: (r) => capaMoves(r).length > 0,
      form: (r) => {
        const moves = capaMoves(r);
        return {
          eyebrow: 'Quality',
          title: `Advance ${r.capaCode}`,
          sub: `Currently ${CAPA_STATE_LABEL[r.state] ?? r.state}.`,
          governed: 'The move and its reason are written to the audit trail under your name.',
          submitLabel: 'Record the move',
          fields: [
            { key: 'to', label: 'Move to', type: 'select', required: true, options: moves.map((m) => ({ value: m, label: CAPA_STATE_LABEL[m] })) },
            { key: 'reason', label: 'Reason for this move', type: 'textarea', rows: 3, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` },
            ...(r.state === 'effectiveness_check'
              ? [{ key: 'effectiveness', label: 'Effectiveness check result (needed to close)', type: 'textarea' as const, rows: 3 }]
              : []),
          ],
        };
      },
      submit: async (r, v) => {
        const reason = v.reason.trim();
        if (reason.length < GOVERNED_REASON_MIN) throw new Refused(`a reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
        const to = v.to as CapaRow['state'];
        const effectiveness = v.effectiveness?.trim() ?? '';
        if ((to === 'closed_effective' || to === 'closed_not_effective') && !effectiveness) {
          throw new Refused('closing a CAPA needs the effectiveness check result.');
        }
        await transitionCapa(r.id, { to, reason, effectiveness });
        return `${r.capaCode} moved to ${CAPA_STATE_LABEL[to] ?? to}.`;
      },
    },
    {
      label: 'Add action',
      title: 'Add an action item to this CAPA’s plan',
      show: (r) => !isCapaClosed(r),
      form: (r) => ({
        eyebrow: 'Quality',
        title: `Add an action to ${r.capaCode}`,
        sub: r.title,
        governed: 'The action is written to the audit trail under your name.',
        submitLabel: 'Add action',
        fields: [
          { key: 'type', label: 'Action type', type: 'select', required: true, half: true, options: optionsOf(CAPA_ACTION_TYPE_LABEL) },
          { key: 'dueDate', label: 'Due', type: 'date', half: true },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'description', label: 'What will be done', type: 'textarea', rows: 3, required: true },
        ],
      }),
      submit: async (r, v) => {
        const action = await addCapaAction(r.id, {
          type: v.type, description: v.description.trim(), owner: v.owner.trim(), dueDate: v.dueDate,
        });
        return `Action ${action.n} was added to ${r.capaCode}.`;
      },
    },
  ],
  detail: { label: 'Show action items', render: (r, onChanged) => <CapaActions capa={r} onChanged={onChanged} /> },
  ask: 'Give me a read-out on CAPA: which are open past their target close, which are high risk, which effectiveness checks failed, and what each needs next.',
  askRow: (r) => `Summarise CAPA ${r.capaCode} ${r.title}: the problem, its root cause, the action plan, and what it needs next.`,
};

const NONCONFORMANCES: RegisterConfig<NonconformanceRow> = {
  title: 'Nonconformances',
  sub:
    'Deviations and nonconforming material, from detection to disposition. Each record names the product or ' +
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
    title: 'Record the disposition and its rationale',
    show: isUndispositioned,
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Disposition ${r.nc_number}`,
      sub: r.description,
      governed: 'The disposition and its rationale are written to the audit trail under your name.',
      submitLabel: 'Record disposition',
      fields: [
        {
          key: 'disposition', label: 'Disposition', type: 'select', required: true,
          options: optionsOf(DISPOSITION_LABEL).filter((o) => o.value !== 'pending'),
        },
        { key: 'dispositionRationale', label: 'Rationale', type: 'textarea', rows: 4, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` },
      ],
    }),
    submit: async (r, v) => {
      const rationale = v.dispositionRationale.trim();
      if (rationale.length < GOVERNED_REASON_MIN) {
        throw new Refused(`a rationale of at least ${GOVERNED_REASON_MIN} characters is required.`);
      }
      await dispositionNonconformance(r.id, { disposition: v.disposition, dispositionRationale: rationale });
      return `${r.nc_number}: ${DISPOSITION_LABEL[v.disposition] ?? v.disposition} was recorded.`;
    },
  }, raiseCapaFrom<NonconformanceRow>({
    source: 'nonconformance',
    ref: (r) => ({ kind: 'qms_nonconforming_product', id: String(r.id), label: r.nc_number }),
    title: (r) => `${r.nc_number}: ${r.description}`.slice(0, 200),
    problem: (r) => [r.description, [r.device_name, r.lot_or_serial].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
  })],
  ask: 'Give me a read-out on nonconformances: which are awaiting disposition, how long each has been open, and which recur by product, lot or source.',
  askRow: (r) => `Summarise nonconformance ${r.nc_number}: what was found, its disposition, and whether it needs a CAPA or a change.`,
};

const SUPPLIERS: RegisterConfig<SupplierRow> = {
  title: 'Suppliers',
  sub:
    'Your approved supplier list: what each supplier provides, how critical it is, its approval standing, and ' +
    'when it is next due for audit and re-approval. Changes to approval standing are recorded under your name.',
  noun: ['supplier', 'suppliers'],
  listPath: '/api/mdx/qms/suppliers',
  grid: 'minmax(0, 1fr) minmax(0, 1fr) 96px 120px 110px 110px 120px',
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
  createForm: {
    eyebrow: 'Quality',
    title: 'Add a supplier',
    sub: 'Recorded as pending unless you record its approval here.',
    governed: 'Adding a supplier writes an audit entry under your name.',
    submitLabel: 'Add supplier',
    fields: [
      { key: 'supplierName', label: 'Supplier', type: 'text', required: true, half: true },
      { key: 'supplierCode', label: 'Supplier code', type: 'text', half: true },
      { key: 'scope', label: 'What it supplies', type: 'textarea', rows: 2, placeholder: 'Drug substance, GMP manufacture; release testing' },
      { key: 'criticality', label: 'Criticality', type: 'seg', required: true, options: optionsOf(CRITICALITY_LABEL) },
      { key: 'approvalStatus', label: 'Approval', type: 'select', half: true, options: optionsOf(SUPPLIER_STATUS_LABEL), default: 'pending' },
      { key: 'approvalDate', label: 'Approved on', type: 'date', half: true },
      { key: 'nextAuditDate', label: 'Next audit', type: 'date', half: true },
      { key: 'reapprovalDate', label: 'Re-approval due', type: 'date', half: true },
    ],
  },
  create: async (v) => {
    const row = await createSupplier({
      supplierName: v.supplierName.trim(), supplierCode: v.supplierCode.trim(), scope: v.scope.trim(),
      criticality: v.criticality, approvalStatus: v.approvalStatus, approvalDate: v.approvalDate,
      nextAuditDate: v.nextAuditDate, reapprovalDate: v.reapprovalDate,
    });
    return `${row.supplier_name} was added as ${(SUPPLIER_STATUS_LABEL[row.approval_status] ?? row.approval_status).toLowerCase()}.`;
  },
  rowActions: [{
    label: 'Update',
    title: 'Record a change to approval standing or audit dates',
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Update ${r.supplier_name}`,
      sub: `Currently ${(SUPPLIER_STATUS_LABEL[r.approval_status] ?? r.approval_status).toLowerCase()}. Only the fields you change are recorded.`,
      governed: 'The update is written to the audit trail under your name.',
      submitLabel: 'Record update',
      fields: [
        { key: 'approvalStatus', label: 'Approval', type: 'select', half: true, options: optionsOf(SUPPLIER_STATUS_LABEL), default: r.approval_status },
        { key: 'approvalDate', label: 'Approved on', type: 'date', half: true, default: r.approval_date?.slice(0, 10) ?? '' },
        { key: 'lastAuditDate', label: 'Last audit', type: 'date', half: true, default: r.last_audit_date?.slice(0, 10) ?? '' },
        { key: 'nextAuditDate', label: 'Next audit', type: 'date', half: true, default: r.next_audit_date?.slice(0, 10) ?? '' },
        { key: 'reapprovalDate', label: 'Re-approval due', type: 'date', half: true, default: r.reapproval_date?.slice(0, 10) ?? '' },
      ],
    }),
    submit: async (r, v) => {
      const before: Record<string, string> = {
        approvalStatus: r.approval_status, approvalDate: r.approval_date?.slice(0, 10) ?? '',
        lastAuditDate: r.last_audit_date?.slice(0, 10) ?? '', nextAuditDate: r.next_audit_date?.slice(0, 10) ?? '',
        reapprovalDate: r.reapproval_date?.slice(0, 10) ?? '',
      };
      const changed = Object.fromEntries(Object.entries(before).filter(([k, was]) => (v[k] ?? '') !== was && v[k] !== ''));
      if (Object.keys(changed).length === 0) throw new Refused('nothing was changed.');
      await updateSupplier(r.id, changed);
      return `${r.supplier_name} was updated.`;
    },
  }],
  ask: 'Give me a read-out on suppliers: which critical suppliers are not approved, whose audits or re-approvals are past due, and what falls due next quarter.',
  askRow: (r) => `Summarise supplier ${r.supplier_name}: what it supplies, its approval standing, and what its qualification needs next.`,
};

const AUDITS: RegisterConfig<InternalAuditRow> = {
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
    ref: (r) => ({ kind: 'qms_internal_audit', id: String(r.id), label: r.audit_number }),
    title: (r) => `Findings of ${r.audit_number}`,
    problem: (r) => `${r.scope}\n${r.major_findings ?? 0} major and ${r.minor_findings ?? 0} minor findings.`,
    show: (r) => r.status !== 'planned' && r.status !== 'cancelled',
  })],
  ask: 'Give me a read-out on the internal audit programme: what is planned and overdue, which audits found major findings, and which areas have not been audited this year.',
  askRow: (r) => `Summarise internal audit ${r.audit_number}: its scope, status and findings, and what follow-up it needs.`,
};

const REVIEWS: RegisterConfig<ManagementReviewRow> = {
  title: 'Management reviews',
  sub:
    'The record of each management review of the quality system (ICH Q10 §2.6): the period it covered, what ' +
    'was reviewed, and the decisions and actions that came out of it. Each review is recorded under your name.',
  noun: ['review', 'reviews'],
  listPath: '/api/mdx/qms/management-reviews',
  grid: '120px 104px minmax(0, 1fr) minmax(0, 1fr)',
  columns: [
    { label: 'Period', cell: (r) => <span className="mono">{r.period}</span> },
    { label: 'Held', cell: (r) => formatDate(r.review_date) },
    { label: 'Reviewed', cell: (r) => <span title={reviewText(r.inputs, 'summary')}>{reviewText(r.inputs, 'summary') || '—'}</span> },
    { label: 'Decisions and actions', cell: (r) => <span title={reviewText(r.outputs, 'decisions')}>{reviewText(r.outputs, 'decisions') || '—'}</span> },
  ],
  kpis: (rows) => [
    { label: 'Reviews', val: String(rows.length), sub: 'On record' },
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
  ask: 'Prepare the inputs for our next management review from the quality records: nonconformances and their dispositions, internal audit findings, supplier standing, and change control.',
  askRow: (r) => `Summarise the ${r.period} management review: what it reviewed, what it decided, and which actions are still open.`,
};

function RecordRegister<R extends { id: number | string }>({ config, onAsk }: { config: RegisterConfig<R>; onAsk: (q: string) => void }) {
  const read = useFetchJson<unknown>(config.listPath);
  const rows = React.useMemo(() => listOf<R>(read.data), [read.data]);
  const [drawer, setDrawer] = React.useState<{ kind: 'create' } | { kind: 'row'; row: R; action: RowAction<R> } | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const writing = React.useRef(false);
  const [openId, setOpenId] = React.useState<R['id'] | null>(null);
  /* Bumped by every write, so an open detail re-reads what the write changed. */
  const [version, setVersion] = React.useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const grid = config.grid + ' 230px';
  const rowMin = registerRowMinWidth(grid);

  const open = (d: NonNullable<typeof drawer>) => { setRefusal(null); setDrawer(d); };
  const run = async (write: () => Promise<string>) => {
    if (writing.current) return;
    writing.current = true;
    setRefusal(null);
    try {
      const text = await write();
      setDrawer(null);
      setNotice(text);
      setVersion((n) => n + 1);
      read.refresh();
    } catch (err) {
      setRefusal(`Not recorded — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writing.current = false;
    }
  };

  /* No list in the body is a failed read, not an empty register. */
  const failed = !read.loading && (read.error != null || (read.data != null && rows === null));
  const loaded = rows !== null && !read.loading;

  return (
    <>
      <div className="qms-head">
        <div>
          <div className="qms-eyebrow">Quality records</div>
          <h1 className="qms-h1">{config.title}</h1>
          <div className="qms-sub">{config.sub}</div>
        </div>
        <div className="qms-actions">
          <button className="qms-btn ghost" title="Sends this request to AnA; nothing in the register changes" onClick={() => onAsk(config.ask)}>
            {I.sparkles} Ask AnA
          </button>
          <button className="qms-btn primary" onClick={() => open({ kind: 'create' })}>
            {I.plus} {config.createLabel}
          </button>
        </div>
      </div>

      <div className="qms-kpis">
        {loaded ? (
          config.kpis(rows, today).map((k) => <Kpi key={k.label} {...k} />)
        ) : (
          <EmptyState
            title={`${config.title} totals are unavailable`}
            hint="The counts appear once the register loads."
            testId="qms-record-kpis-absent"
          />
        )}
      </div>

      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Register</h2>
          {loaded && <span className="meta">{plural(rows.length, config.noun)}</span>}
        </div>
        <div className="qms-table">
          <div className="qms-thead" style={{ gridTemplateColumns: grid, minWidth: rowMin }}>
            {config.columns.map((c) => <div key={c.label}>{c.label}</div>)}
            <div />
          </div>
          {notice && <div className="qms-empty" role="status" data-tone="ok">{notice}</div>}
          {failed && (
            <ErrorState
              title={`The ${config.title.toLowerCase()} register could not be read`}
              message={read.error ?? 'The server did not return a list.'}
              retry={read.refresh}
              testId="qms-record-failed"
            />
          )}
          {!failed && !loaded && <div className="qms-empty" role="status">Loading the register…</div>}
          {loaded && rows.length === 0 && (
            <div className="qms-empty">No {config.noun[1]} recorded yet.</div>
          )}
          {loaded && rows.map((r) => (
            <React.Fragment key={r.id}>
            <div className="qms-row" style={{ gridTemplateColumns: grid, minWidth: rowMin }}>
              {config.columns.map((c, i) => (i === 0 && config.detail ? (
                <button key={c.label} className="qms-cell qms-num" aria-expanded={openId === r.id} title={config.detail.label}
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {c.cell(r)}
                </button>
              ) : <div key={c.label} className="qms-cell">{c.cell(r)}</div>))}
              <div className="qms-cell qms-rowacts">
                {config.rowActions?.filter((a) => a.show?.(r) ?? true).map((a) => (
                  <button key={a.label} className="qms-chip" title={a.title} onClick={() => open({ kind: 'row', row: r, action: a })}>
                    {I.arrowRight} {a.label}
                  </button>
                ))}
                <button className="qms-chip ghost" title="Ask AnA about this record" aria-label="Ask AnA about this record" onClick={() => onAsk(config.askRow(r))}>
                  {I.sparkles}
                </button>
              </div>
            </div>
            {config.detail && openId === r.id && (
              <div className="qcc-detail" key={`${r.id}:${version}`}>{config.detail.render(r, read.refresh)}</div>
            )}
            </React.Fragment>
          ))}
        </div>
      </section>

      {drawer?.kind === 'create' && (
        <C2CForm
          config={{ ...config.createForm, ...(refusal ? { notice: refusal } : {}) }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => void run(() => config.create(v))}
        />
      )}
      {drawer?.kind === 'row' && (
        <C2CForm
          config={{ ...drawer.action.form(drawer.row), ...(refusal ? { notice: refusal } : {}) }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => void run(() => drawer.action.submit(drawer.row, v))}
        />
      )}
    </>
  );
}

export const QMS_RECORD_TABS: { id: QmsRecordTab; label: string }[] = [
  { id: 'capa', label: 'CAPA' },
  { id: 'nonconforming', label: 'Nonconformances' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'audits', label: 'Internal audits' },
  { id: 'reviews', label: 'Management reviews' },
];

export const QMS_RECORD_ASK: Record<QmsRecordTab, string> = {
  capa: CAPAS.ask,
  nonconforming: NONCONFORMANCES.ask,
  suppliers: SUPPLIERS.ask,
  audits: AUDITS.ask,
  reviews: REVIEWS.ask,
};

export function QmsRecords({ tab, onAsk }: { tab: QmsRecordTab; onAsk: (q: string) => void }) {
  switch (tab) {
    case 'capa': return <RecordRegister key={tab} config={CAPAS} onAsk={onAsk} />;
    case 'nonconforming': return <RecordRegister key={tab} config={NONCONFORMANCES} onAsk={onAsk} />;
    case 'suppliers': return <RecordRegister key={tab} config={SUPPLIERS} onAsk={onAsk} />;
    case 'audits': return <RecordRegister key={tab} config={AUDITS} onAsk={onAsk} />;
    case 'reviews': return <RecordRegister key={tab} config={REVIEWS} onAsk={onAsk} />;
  }
}
