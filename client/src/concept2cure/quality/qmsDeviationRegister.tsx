/**
 * The deviation register's configuration (QmsRecords.tsx; decision P-57).
 *
 * A deviation is a departure from an approved procedure or instruction. It is
 * recorded open, investigated (immediate action, root cause, resolution),
 * sent for approval and closed by a signature. One recorded in error is
 * cancelled by a signature and stays listed with its reason. The moves offered are the
 * server's (shared/constants/deviation-lifecycle.ts); a nonconforming product
 * itself is recorded in Nonconformances.
 *
 * @module client/src/concept2cure/quality/qmsDeviationRegister
 */
import * as React from 'react';
import { DEVIATION_ENDED, DEVIATION_TRANSITIONS, type DeviationStatus } from '@shared/constants/deviation-lifecycle';
import { formatDate } from './data';
import { CAPA_SOURCE_KIND } from './capaSources';
import {
  DEVIATION_CATEGORY_LABEL, DEVIATION_CLASS_LABEL, DEVIATION_STATUS_LABEL, DEVIATION_TYPE_LABEL, IMPACT_LABEL,
  createDeviation, isPast, updateDeviation, type DeviationRow,
} from './qmsRecordData';
import { type PillTone, type RegisterConfig, type RowAction, optionsOf, pill, Refused } from './qmsRegisterKit';
import { raiseCapaFrom } from './qmsCapaRegister';
import { signDeviationCancel, signDeviationClose } from './qmsApproval';

const STATUS_TONE: Record<string, PillTone> = {
  open: 'draft', under_investigation: 'review', pending_approval: 'review', closed: 'effective', cancelled: 'muted',
};
const CLASS_TONE: Record<string, PillTone> = { minor: 'muted', major: 'review', critical: 'err' };
const isOpen = (r: DeviationRow) => !DEVIATION_ENDED.includes(r.status as DeviationStatus);
const clip = (s: string | null, n: number) => (!s ? '—' : s.length > n ? `${s.slice(0, n - 1)}…` : s);

const INVESTIGATE: RowAction<DeviationRow> = {
  label: 'Investigate',
  title: 'Record the immediate action, investigation, root cause and resolution, and move the deviation on',
  show: isOpen,
  form: (r) => {
    const moves = DEVIATION_TRANSITIONS[r.status as DeviationStatus] ?? [];
    return {
      eyebrow: 'Quality',
      title: `Investigate ${r.deviation_number}`,
      sub: `Currently ${(DEVIATION_STATUS_LABEL[r.status] ?? r.status).toLowerCase()}. It goes for approval with its root cause and resolution recorded.`,
      governed: 'What you record is written to the audit trail under your name.',
      submitLabel: 'Record',
      fields: [
        ...(moves.length ? [{ key: 'status', label: 'Move to', type: 'select' as const, half: true,
          options: moves.map((m) => ({ value: m, label: DEVIATION_STATUS_LABEL[m] ?? m })) }] : []),
        { key: 'impactLevel', label: 'Impact', type: 'select', half: true, options: optionsOf(IMPACT_LABEL), default: r.impact_level ?? '' },
        { key: 'immediateActions', label: 'Immediate action', type: 'textarea', rows: 2, default: r.immediate_actions?.[0] ?? '' },
        { key: 'rootCause', label: 'Root cause', type: 'textarea', rows: 3, default: r.root_cause ?? '' },
        { key: 'resolutionDescription', label: 'Resolution', type: 'textarea', rows: 3, default: r.resolution_description ?? '' },
        { key: 'targetClosureDate', label: 'Target close', type: 'date', half: true, default: r.target_closure_date?.slice(0, 10) ?? '' },
      ],
    };
  },
  submit: async (r, v) => {
    const before: Record<string, string> = {
      impactLevel: r.impact_level ?? '', immediateActions: r.immediate_actions?.[0] ?? '', rootCause: r.root_cause ?? '',
      resolutionDescription: r.resolution_description ?? '', targetClosureDate: r.target_closure_date?.slice(0, 10) ?? '',
    };
    const changed: Record<string, string> = Object.fromEntries(
      Object.entries(before).filter(([k, was]) => (v[k] ?? '').trim() !== was && (v[k] ?? '').trim() !== '').map(([k]) => [k, v[k].trim()]));
    if (v.status) changed.status = v.status;
    if (Object.keys(changed).length === 0) throw new Refused('nothing was changed.');
    const row = await updateDeviation(r.id, changed);
    return `${r.deviation_number} is ${(DEVIATION_STATUS_LABEL[row.status] ?? row.status).toLowerCase()}.`;
  },
};

const CLOSE: RowAction<DeviationRow> = {
  label: 'Close',
  title: 'Close this deviation with your signature',
  show: (r) => r.status === 'pending_approval',
  form: (r) => ({
    eyebrow: 'Quality',
    title: `Close ${r.deviation_number}`,
    sub: `Root cause: ${clip(r.root_cause, 160)} Resolution: ${clip(r.resolution_description, 160)}`,
    governed: 'You sign the close in the next step, with your reason. You answer for the investigation, and a closed deviation is not changed. The person who sent it for approval does not sign its close.',
    submitLabel: 'Continue to sign',
    fields: [],
  }),
  sign: (r) => ({
    action: 'Close deviation',
    target: `${r.deviation_number} ${r.title}`.slice(0, 160),
    meta: `You close ${r.deviation_number} with your signature. You answer for its investigation, root cause and resolution. A closed deviation is not changed.`,
    rows: [
      { label: 'Class', value: DEVIATION_CLASS_LABEL[r.classification] ?? r.classification },
      { label: 'Root cause', value: clip(r.root_cause, 120) },
      { label: 'Resolution', value: clip(r.resolution_description, 120) },
    ],
    meanings: ['approval', 'responsibility'],
    post: (input) => signDeviationClose(r.id, input),
    done: `${r.deviation_number} was closed.`,
  }),
};

const CANCEL: RowAction<DeviationRow> = {
  label: 'Cancel deviation',
  title: 'Cancel this deviation, recorded in error, with your signature',
  show: isOpen,
  form: (r) => ({
    eyebrow: 'Quality',
    title: `Cancel ${r.deviation_number}`,
    sub: 'For a deviation recorded in error, such as a duplicate or an event that was not a departure. It stays on the register, marked cancelled, with your reason.',
    governed: 'You sign the cancellation in the next step, and your reason is kept with it. The person who recorded the deviation does not sign its cancellation.',
    submitLabel: 'Continue to sign',
    fields: [],
  }),
  sign: (r) => ({
    action: 'Cancel deviation',
    target: `${r.deviation_number} ${r.title}`.slice(0, 160),
    meta: `You cancel ${r.deviation_number} as recorded in error. It stays on the register, marked cancelled, with your reason, and is not changed again.`,
    rows: [
      { label: 'Class', value: DEVIATION_CLASS_LABEL[r.classification] ?? r.classification },
      { label: 'Status', value: DEVIATION_STATUS_LABEL[r.status] ?? r.status },
    ],
    meanings: ['approval', 'responsibility'],
    post: (input) => signDeviationCancel(r.id, input),
    done: `${r.deviation_number} was cancelled.`,
  }),
};

const cancelReason = (r: DeviationRow) => r.metadata?.cancelled?.reason ?? null;

export const DEVIATIONS: RegisterConfig<DeviationRow> = {
  title: 'Deviations',
  sub:
    'Departures from an approved procedure or instruction, from detection to a signed close: what happened, where, ' +
    'how serious, the investigation and its root cause, and the resolution. Record the product or lot when one is ' +
    'affected; a nonconforming product itself goes in Nonconformances.',
  noun: ['deviation', 'deviations'],
  listPath: '/api/mdx/qms/deviations',
  grid: '120px minmax(0, 1fr) 96px 140px 110px 110px',
  columns: [
    { label: 'Deviation', cell: (r) => <span className="mono">{r.deviation_number}</span> },
    {
      label: 'What happened',
      cell: (r) => (
        <span title={r.description}>
          {r.title}
          {r.status === 'cancelled' && cancelReason(r) ? ` (cancelled: ${cancelReason(r)})` : null}
        </span>
      ),
    },
    { label: 'Class', cell: (r) => pill(CLASS_TONE[r.classification] ?? 'muted', DEVIATION_CLASS_LABEL[r.classification] ?? r.classification) },
    { label: 'Status', cell: (r) => pill(STATUS_TONE[r.status] ?? 'muted', DEVIATION_STATUS_LABEL[r.status] ?? r.status) },
    { label: 'Detected', cell: (r) => formatDate(r.detected_date) },
    { label: 'Target close', cell: (r) => formatDate(r.target_closure_date) },
  ],
  kpis: (rows, today) => {
    const open = rows.filter(isOpen);
    const cancelled = rows.filter((r) => r.status === 'cancelled').length;
    const critical = open.filter((r) => r.classification === 'critical').length;
    const late = open.filter((r) => isPast(r.target_closure_date, today)).length;
    return [
      { label: 'Open', val: String(open.length), sub: `${rows.length - open.length - cancelled} closed${cancelled ? `, ${cancelled} cancelled` : ''}` },
      { label: 'Critical, open', val: String(critical), sub: critical ? 'Not yet closed' : 'None', tone: critical ? 'err' : 'ok' },
      { label: 'Past target close', val: String(late), sub: late ? 'Target date has passed' : 'None past due', tone: late ? 'warn' : 'ok' },
    ];
  },
  createLabel: 'Record deviation',
  createForm: {
    eyebrow: 'Quality',
    title: 'Record a deviation',
    sub: 'Recorded as open. Investigate it from the register, and close it with your signature once it is approved.',
    governed: 'Recording a deviation writes an audit entry under your name.',
    submitLabel: 'Record deviation',
    fields: [
      { key: 'deviationNumber', label: 'Deviation number', type: 'text', required: true, half: true, placeholder: 'DEV-2026-001' },
      { key: 'detectedDate', label: 'Detected on', type: 'date', required: true, half: true },
      { key: 'title', label: 'What happened', type: 'text', required: true, placeholder: 'EM excursion, Grade B room 2' },
      { key: 'description', label: 'Description', type: 'textarea', rows: 3, required: true },
      { key: 'deviationType', label: 'Type', type: 'seg', required: true, options: optionsOf(DEVIATION_TYPE_LABEL), default: 'unplanned' },
      { key: 'classification', label: 'Class', type: 'seg', required: true, options: optionsOf(DEVIATION_CLASS_LABEL) },
      { key: 'category', label: 'Category', type: 'select', half: true, options: optionsOf(DEVIATION_CATEGORY_LABEL) },
      { key: 'location', label: 'Where', type: 'text', half: true },
      { key: 'productName', label: 'Product affected', type: 'text', half: true },
      { key: 'batchNumber', label: 'Batch or lot', type: 'text', half: true },
      { key: 'targetClosureDate', label: 'Target close', type: 'date', half: true },
    ],
  },
  create: async (v) => {
    const row = await createDeviation({
      deviationNumber: v.deviationNumber.trim(), detectedDate: v.detectedDate, title: v.title.trim(), description: v.description.trim(),
      deviationType: v.deviationType, classification: v.classification, category: v.category, location: v.location.trim(),
      productName: v.productName.trim(), batchNumber: v.batchNumber.trim(), targetClosureDate: v.targetClosureDate,
    });
    return `${row.deviation_number} was recorded as open.`;
  },
  rowActions: [INVESTIGATE, CLOSE, CANCEL, raiseCapaFrom<DeviationRow>({
    source: 'deviation',
    show: (r) => r.status !== 'cancelled',
    ref: (r) => ({ kind: CAPA_SOURCE_KIND.deviation, id: String(r.id), label: r.deviation_number }),
    title: (r) => `${r.deviation_number}: ${r.title}`.slice(0, 200),
    problem: (r) => [r.description, r.root_cause ? `Root cause: ${r.root_cause}` : null].filter(Boolean).join('\n'),
  })],
  capaSourceKind: CAPA_SOURCE_KIND.deviation,
  ask: 'Give me a read-out on deviations: which are open and how long, which are critical or past their target close, and which recur by area, category or root cause.',
  askRow: (r) => `Summarise deviation ${r.deviation_number}: what happened, its class, where its investigation stands and what it needs to close.`,
  facts: (r) => ({
    deviation: r.deviation_number, title: r.title, class: r.classification, status: r.status, category: r.category,
    detected: r.detected_date?.slice(0, 10) ?? null, targetClose: r.target_closure_date?.slice(0, 10) ?? null,
    rootCause: r.root_cause, closed: r.actual_closure_date?.slice(0, 10) ?? null, cancelledBecause: cancelReason(r),
  }),
};
