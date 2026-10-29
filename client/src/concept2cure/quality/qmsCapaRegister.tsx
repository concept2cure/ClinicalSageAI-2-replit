/**
 * The CAPA register's configuration, and the Raise CAPA every quality record
 * takes (QmsRecords.tsx; server/routes/capa-mdr.ts).
 *
 * @module client/src/concept2cure/quality/qmsCapaRegister
 */
import * as React from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { formatDate } from './data';
import { CapaActions } from './CapaActions';
import { shellProgramId } from '../v2/shellProject';
import { type C2CFormConfig } from '../v2/C2CForm';
import {
  CAPA_ACTION_TYPE_LABEL, CAPA_SOURCE_LABEL, CAPA_STATE_LABEL, CAPA_TYPE_LABEL, RISK_LABEL, addCapaAction, capaMoves, createCapa, isCapaClosed, transitionCapa, type CapaRow, type CapaSourceRef, isPast,
} from './qmsRecordData';
import { type PillTone, type RowAction, type RegisterConfig, optionsOf, pill, Refused } from './qmsRegisterKit';

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
export function raiseCapaFrom<R>(o: {
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

export const CAPAS: RegisterConfig<CapaRow> = {
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

