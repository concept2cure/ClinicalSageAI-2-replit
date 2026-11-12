/**
 * Quality's complaint and MDR registers (P-122, 2026-11-10): the configurations QmsRecords.tsx renders under the
 * Complaints and MDR tab, over the existing /api/capa-mdr routes (server/routes/capa-mdr.ts, capaMdr.service.ts).
 *
 * The routes were built with the device QMS: complaint intake and lifecycle (21 CFR 820.198), MDR and vigilance
 * reports with the reporting clock the server computes from the decision date (21 CFR 803, EU MDR Article 87), and
 * each record's vigilance timeline. Until P-122 only AnA (server/services/ana/capaMdrTools.ts) and the CER's
 * read-only complaint list reached them. Every write is the server's audited one, under the person; the moves are
 * the server's lifecycle (shared/constants/capa-lifecycle.ts); the preliminary reportability is the rules engine's,
 * computed at intake (server/services/capa-mdr/triageEngine.ts), and an unstated fact is said, never read as no.
 * A complaint and an MDR report belong to a project, as a CAPA does.
 *
 * @module client/src/concept2cure/quality/qmsComplaintRegisters
 */
import * as React from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { COMPLAINT_TRANSITIONS, MDR_TRANSITIONS } from '@shared/constants/capa-lifecycle';
import type { ComplaintState, MdrState } from '@shared/schema/capa-mdr';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { shellProgramId, shellProgramName } from '../v2/shellProject';
import { type C2CFormConfig } from '../v2/C2CForm';
import { formatDate } from './data';
import { listOf } from './qmsList';
import { capaWrite } from './qmsWrites';
import { type PillTone, type RegisterConfig, type RowAction, optionsOf, pill, Refused } from './qmsRegisterKit';

/* ─── Rows, as the routes return them ─────────────────────────────────────── */

interface Classification { fdaReportable?: boolean | null; mdrEuReportable?: boolean | null; determinationComplete?: boolean; missingFacts?: string[] }
export interface ComplaintRow {
  id: string; programId: string; complaintCode: string; source: string; channel: string; receivedAt: string;
  eventNarrative: string; patientHarm: string; severityAssessment: string; triageState: ComplaintState;
  deviceModel?: string | null; deviceLot?: string | null;
  preliminaryClassification?: Classification | null; linkedMdrEventId?: string | null; linkedCapaId?: string | null;
}
export interface MdrEventRow {
  id: string; programId: string; mdrCode: string; sourceComplaintId?: string | null; jurisdiction: string;
  usFdaReportType?: string | null; euMdrSeverity?: string | null; decisionDate: string; reportDueAt?: string | null;
  eventNarrative: string; state: MdrState; fdaReportNumber?: string | null; euReportNumber?: string | null;
}

/* ─── Labels ──────────────────────────────────────────────────────────────── */

export const COMPLAINT_SOURCE_LABEL: Record<string, string> = {
  customer: 'Customer', distributor: 'Distributor', clinical_trial: 'Clinical trial', internal: 'Internal', regulator: 'Regulator',
  literature: 'Literature', service: 'Service', other: 'Other',
};
export const COMPLAINT_CHANNEL_LABEL: Record<string, string> = {
  phone: 'Phone', email: 'Email', web_form: 'Web form', service_call: 'Service call', salesforce: 'Salesforce',
  servicenow: 'ServiceNow', mail: 'Mail', in_person: 'In person', other: 'Other',
};
export const HARM_LABEL: Record<string, string> = {
  none: 'No harm', malfunction: 'Malfunction', injury: 'Injury', serious_injury: 'Serious injury', death: 'Death',
};
export const SEVERITY_LABEL: Record<string, string> = { negligible: 'Negligible', minor: 'Minor', serious: 'Serious', critical: 'Critical' };
export const COMPLAINT_STATE_LABEL: Record<ComplaintState, string> = {
  new: 'New', triaged: 'Triaged', investigation: 'Investigation', resolved: 'Resolved', closed: 'Closed',
  escalated_capa: 'Escalated to CAPA', escalated_mdr: 'Escalated to MDR',
};
export const JURISDICTION_LABEL: Record<string, string> = { us_fda: 'FDA', eu_mdr: 'EU MDR', both: 'FDA and EU MDR', other: 'Other' };
export const FDA_REPORT_LABEL: Record<string, string> = {
  initial_5day: 'FDA 5-day', initial_30day: 'FDA 30-day', supplemental: 'FDA supplemental', followup: 'FDA follow-up',
  annual: 'FDA annual', not_reportable: 'Not reportable to FDA',
};
export const EU_SEVERITY_LABEL: Record<string, string> = {
  life_threatening_2day: 'EU 2-day', death_or_serious_10day: 'EU 10-day', other_serious_15day: 'EU 15-day', not_reportable: 'Not reportable in the EU',
};
export const MDR_STATE_LABEL: Record<MdrState, string> = {
  open: 'Open', preparing: 'Preparing', filed: 'Filed', acknowledged: 'Acknowledged', followup_required: 'Follow-up required', closed: 'Closed',
};
const VIGILANCE_KIND_LABEL: Record<string, string> = {
  complaint_received: 'Complaint received', complaint_triaged: 'Complaint triaged', complaint_state_changed: 'Complaint moved',
  mdr_opened: 'MDR decision recorded', mdr_clock_computed: 'Reporting clock computed', mdr_filed: 'Report filed',
  mdr_acknowledged: 'Report acknowledged', mdr_state_changed: 'MDR report moved', capa_opened: 'CAPA raised',
  capa_state_changed: 'CAPA moved', capa_action_added: 'CAPA action added', capa_action_completed: 'CAPA action completed',
  capa_effectiveness_verified: 'CAPA effectiveness verified', capa_closed: 'CAPA closed', note: 'Note',
};
const COMPLAINT_TONE: Partial<Record<ComplaintState, PillTone>> = { new: 'draft', closed: 'muted', escalated_mdr: 'warn', escalated_capa: 'warn' };
const MDR_TONE: Partial<Record<MdrState, PillTone>> = { open: 'draft', filed: 'effective', acknowledged: 'effective', followup_required: 'warn', closed: 'muted' };
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/** The rules engine's preliminary reportability, as computed at intake: yes, no, or not determined (a fact unstated). */
export function reportabilityOf(c: Classification | null | undefined): string {
  if (!c) return 'Not classified';
  const say = (v: boolean | null | undefined) => (v === true ? 'reportable' : v === false ? 'not reportable' : 'not determined');
  return `FDA: ${say(c.fdaReportable)} · EU: ${say(c.mdrEuReportable)}`;
}
/** An MDR report past its due day and not yet filed: the server's rule (capaMdr.service.ts getTriageQueueTx). */
export function isMdrOverdue(r: MdrEventRow, now = Date.now()): boolean {
  return !!r.reportDueAt && new Date(r.reportDueAt).getTime() < now && !['filed', 'acknowledged', 'closed'].includes(r.state);
}
const reportOf = (r: { usFdaReportType?: string | null; euMdrSeverity?: string | null; jurisdiction: string }) =>
  [r.usFdaReportType ? FDA_REPORT_LABEL[r.usFdaReportType] ?? r.usFdaReportType : null,
    r.euMdrSeverity ? EU_SEVERITY_LABEL[r.euMdrSeverity] ?? r.euMdrSeverity : null].filter(Boolean).join(' · ') || '—';

/* ─── Where a new record goes: the open project, said before the form is filled (as Raise CAPA, J5-04) ─── */

function whereIn(noun: string, rest: string): string {
  if (!shellProgramId()) return `No project is open. ${noun} belongs to a project: open one from Projects first; nothing here is recorded until then.`;
  const name = shellProgramName();
  return name ? `Recorded in ${name}, the project you have open, ${rest}` : `Recorded in the project you have open, ${rest}`;
}
const openProject = (noun: string): string => {
  const id = shellProgramId();
  if (!id) throw new Refused(`open a project first. ${noun} belongs to a project.`);
  return id;
};
const fact = (v: string | undefined): boolean => v === 'yes';

/* ─── Writes, through the audited routes (server/routes/capa-mdr.ts) ─────── */

const MDR_DECISION_FIELDS = (narrative?: string): C2CFormConfig['fields'] => [
  { key: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, half: true, options: optionsOf(JURISDICTION_LABEL) },
  { key: 'decisionDate', label: 'Decided on', type: 'date', required: true, half: true, desc: 'The reporting clock runs from this day.' },
  { key: 'usFdaReportType', label: 'FDA report type', type: 'select', half: true, options: optionsOf(FDA_REPORT_LABEL) },
  { key: 'euMdrSeverity', label: 'EU severity class', type: 'select', half: true, options: optionsOf(EU_SEVERITY_LABEL) },
  { key: 'eventNarrative', label: 'What happened', type: 'textarea', rows: 4, required: true, ...(narrative ? { default: narrative } : {}) },
];
async function recordMdrDecision(programId: string, v: Record<string, string>, from?: ComplaintRow): Promise<string> {
  const row = await capaWrite<MdrEventRow>('mdr-events', {
    programId, jurisdiction: v.jurisdiction, decisionDate: v.decisionDate, eventNarrative: v.eventNarrative.trim(),
    ...(v.usFdaReportType ? { usFdaReportType: v.usFdaReportType } : {}), ...(v.euMdrSeverity ? { euMdrSeverity: v.euMdrSeverity } : {}),
    ...(from ? { sourceComplaintId: from.id } : {}),
  });
  return from ? `${row.mdrCode} was recorded from ${from.complaintCode}.` : `${row.mdrCode} was recorded.`;
}

/** A lifecycle move: the server's next states, a reason, and what the move needs. */
function moveAction<R extends { id: string }, S extends string>(o: {
  name: (r: R) => string; state: (r: R) => S; moves: Record<S, readonly S[]>; labels: Record<S, string>; path: string;
  extra?: (to: S | null) => C2CFormConfig['fields'];
  body?: (v: Record<string, string>) => Record<string, unknown>;
}): RowAction<R> {
  return {
    label: 'Move',
    title: 'Move this record to its next lifecycle state, with a reason',
    show: (r) => o.moves[o.state(r)].length > 0,
    form: (r) => ({
      eyebrow: 'Quality',
      title: `Move ${o.name(r)}`,
      sub: `Currently ${o.labels[o.state(r)] ?? o.state(r)}.`,
      governed: 'The move and its reason are written to the audit trail under your name.',
      submitLabel: 'Record the move',
      fields: [
        { key: 'to', label: 'Move to', type: 'select', required: true, options: o.moves[o.state(r)].map((m) => ({ value: m, label: o.labels[m] })) },
        { key: 'reason', label: 'Reason for this move', type: 'textarea', rows: 3, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` },
        ...(o.extra?.(null) ?? []),
      ],
    }),
    submit: async (r, v) => {
      const reason = v.reason.trim();
      if (reason.length < GOVERNED_REASON_MIN) throw new Refused(`a reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
      const to = v.to as S;
      await capaWrite(`${o.path}/${encodeURIComponent(r.id)}/transition`, { to, reason, ...(o.body?.(v) ?? {}) });
      return `${o.name(r)} moved to ${o.labels[to] ?? to}.`;
    },
  };
}

/* ─── The vigilance timeline: a record's events, as the server recorded them ─── */

export function VigilanceTimeline({ programId, entityType, entityId }: { programId: string; entityType: 'complaint' | 'mdr_event'; entityId: string }) {
  const path = `/api/capa-mdr/vigilance?program_id=${encodeURIComponent(programId)}&entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`;
  const read = useFetchJson<unknown>(path);
  const rows = listOf<{ id: string; kind: string; occurredAt?: string; actor?: string | null; reason?: string | null }>(read.data);
  if (!read.loading && (read.error != null || (read.data != null && rows === null))) {
    return <ErrorState title="The vigilance timeline could not be read" message={read.error ?? 'The server did not return a list.'}
      retry={read.refresh} read={read.failure} readWhat="the vigilance timeline" testId="qms-vigilance-failed" />;
  }
  if (!rows) return <EmptyState title="Reading the vigilance timeline…" busy />;
  if (rows.length === 0) return <EmptyState title="No vigilance event is recorded for this record yet." />;
  return (
    <>
      <div className="qcc-detail-head"><span className="qcc-detail-title">Vigilance timeline</span></div>
      <ul className="qms-vigilance">
        {rows.map((e) => (
          <li key={e.id}>
            <span>{VIGILANCE_KIND_LABEL[e.kind] ?? e.kind}</span>
            <span className="qms-when">{formatDate(e.occurredAt ?? null)}</span>
            {e.reason && <span className="qms-vigilance-why">{e.reason}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ─── The two registers ──────────────────────────────────────────────────── */

const COMPLAINT_FIELDS: C2CFormConfig['fields'] = [
  { key: 'source', label: 'Source', type: 'select', required: true, half: true, options: optionsOf(COMPLAINT_SOURCE_LABEL) },
  { key: 'channel', label: 'Channel', type: 'select', required: true, half: true, options: optionsOf(COMPLAINT_CHANNEL_LABEL) },
  { key: 'receivedAt', label: 'Received', type: 'date', required: true, half: true },
  { key: 'eventLocationCountry', label: 'Country of the event', type: 'text', required: true, half: true, placeholder: 'US', desc: 'Two-letter country code: it decides EU reportability.' },
  { key: 'eventNarrative', label: 'What happened', type: 'textarea', rows: 4, required: true },
  { key: 'patientHarm', label: 'Patient harm', type: 'select', required: true, half: true, options: optionsOf(HARM_LABEL) },
  { key: 'severityAssessment', label: 'Severity', type: 'select', required: true, half: true, options: optionsOf(SEVERITY_LABEL) },
  { key: 'isMalfunction', label: 'Malfunction', type: 'select', required: true, half: true, options: YES_NO },
  { key: 'anticipatesCorrection', label: 'Correction or removal expected', type: 'select', required: true, half: true, options: YES_NO },
  { key: 'trendThresholdCrossed', label: 'Trend threshold crossed', type: 'select', required: true, half: true, options: YES_NO },
  { key: 'deviceModel', label: 'Device model', type: 'text', half: true },
  { key: 'deviceLot', label: 'Lot', type: 'text', half: true },
];

/** 100 most recently received: the list route's default limit (capaMdr.service.ts listComplaintsTx). */
const COMPLAINT_READ_CAP = 100;

export const COMPLAINTS: RegisterConfig<ComplaintRow> = {
  title: 'Complaints',
  sub:
    'Complaints received about a product (21 CFR 820.198): each recorded with the preliminary FDA and EU reportability ' +
    'the server computes at intake, then triaged, investigated, escalated to an MDR report or a CAPA, and closed. ' +
    'Each move is recorded with its reason under your name. A complaint belongs to a project.',
  noun: ['complaint', 'complaints'],
  listPath: '/api/capa-mdr/complaints',
  readCap: { rows: COMPLAINT_READ_CAP, order: 'most recently received' },
  projectKept: true,
  name: (r) => r.complaintCode,
  columns: [
    { label: 'Number', cell: (r) => <span className="mono">{r.complaintCode}</span> },
    { label: 'What happened', text: true, cell: (r) => <span title={r.eventNarrative}>{r.eventNarrative}</span> },
    { label: 'Received', cell: (r) => formatDate(r.receivedAt) },
    { label: 'Harm', cell: (r) => (['serious_injury', 'death'].includes(r.patientHarm) ? pill('err', HARM_LABEL[r.patientHarm]) : HARM_LABEL[r.patientHarm] ?? r.patientHarm) },
    { label: 'Reportability', cell: (r) => reportabilityOf(r.preliminaryClassification) },
    { label: 'State', cell: (r) => pill(COMPLAINT_TONE[r.triageState] ?? 'review', COMPLAINT_STATE_LABEL[r.triageState] ?? r.triageState) },
  ],
  kpis: (rows) => {
    const open = rows.filter((r) => r.triageState !== 'closed');
    const serious = open.filter((r) => ['serious_injury', 'death'].includes(r.patientHarm)).length;
    const undetermined = open.filter((r) => r.preliminaryClassification?.determinationComplete === false).length;
    return [
      { label: 'Open', val: String(open.length), detail: `${rows.length - open.length} closed` },
      { label: 'Serious injury or death, open', val: String(serious), tone: serious ? 'err' : 'ok' },
      { label: 'Reportability not determined', val: String(undetermined), tone: undetermined ? 'warn' : 'ok' },
    ];
  },
  createLabel: 'Record complaint',
  createForm: () => ({
    eyebrow: 'Quality',
    title: 'Record a complaint',
    sub: whereIn('A complaint', 'as new. Its number and its preliminary reportability are the server’s.'),
    governed: 'Recording a complaint writes an audit entry under your name.',
    submitLabel: 'Record complaint',
    fields: COMPLAINT_FIELDS,
  }),
  create: async (v) => {
    const programId = openProject('A complaint');
    const row = await capaWrite<ComplaintRow>('complaints', {
      programId, source: v.source, channel: v.channel, receivedAt: v.receivedAt, eventNarrative: v.eventNarrative.trim(),
      patientHarm: v.patientHarm, severityAssessment: v.severityAssessment, eventLocationCountry: v.eventLocationCountry.trim().toUpperCase(),
      isMalfunction: fact(v.isMalfunction), anticipatesCorrection: fact(v.anticipatesCorrection), trendThresholdCrossed: fact(v.trendThresholdCrossed),
      ...(v.deviceModel?.trim() ? { deviceModel: v.deviceModel.trim() } : {}), ...(v.deviceLot?.trim() ? { deviceLot: v.deviceLot.trim() } : {}),
    });
    return `${row.complaintCode} was recorded.`;
  },
  rowActions: [
    moveAction<ComplaintRow, ComplaintState>({
      name: (r) => r.complaintCode, state: (r) => r.triageState, moves: COMPLAINT_TRANSITIONS, labels: COMPLAINT_STATE_LABEL,
      path: 'complaints',
      extra: () => [{ key: 'closureReason', label: 'Closure reason (needed to close)', type: 'textarea', rows: 2 }],
      body: (v) => ({
        ...(v.to === 'triaged' ? { triageDecision: { rationale: v.reason.trim() } } : {}),
        ...(v.to === 'closed' ? { closureReason: v.closureReason?.trim() || v.reason.trim() } : {}),
      }),
    }),
    {
      label: 'Record MDR decision',
      title: 'Record the reportability decision for this complaint as an MDR or vigilance report, linked to it',
      show: (r) => r.triageState !== 'closed' && !r.linkedMdrEventId,
      form: (r) => ({
        eyebrow: 'Quality',
        title: `Record the MDR decision for ${r.complaintCode}`,
        sub: `In the complaint's project. Preliminary reportability: ${reportabilityOf(r.preliminaryClassification)}.`,
        governed: 'Recording the decision writes an audit entry under your name; the server computes the reporting clock.',
        submitLabel: 'Record MDR decision',
        fields: MDR_DECISION_FIELDS(r.eventNarrative),
      }),
      submit: (r, v) => recordMdrDecision(r.programId, v, r),
    },
  ],
  detail: {
    label: 'Show the vigilance timeline',
    render: (r) => <VigilanceTimeline programId={r.programId} entityType="complaint" entityId={r.id} />,
  },
  ask: 'Give me a read-out on complaints and MDR reports: which complaints may be reportable and are not yet decided, which MDR reports are due or overdue, and what each needs next.',
  askRow: (r) => `Summarise complaint ${r.complaintCode}: what happened, its preliminary reportability, its triage and what it needs next.`,
  facts: (r) => ({
    register: 'complaints', complaint: r.complaintCode, received: r.receivedAt?.slice(0, 10) ?? null, harm: r.patientHarm,
    severity: r.severityAssessment, reportability: reportabilityOf(r.preliminaryClassification), state: r.triageState,
  }),
};

/** 100 soonest due: the list route's default limit and order (capaMdr.service.ts listMdrEventsTx). */
const MDR_READ_CAP = 100;

export const MDR_EVENTS: RegisterConfig<MdrEventRow> = {
  title: 'MDR and vigilance reports',
  sub:
    'Reportability decisions and their reports to FDA (21 CFR 803) and EU competent authorities (MDR Article 87), with the ' +
    'reporting clock the server computes from the decision date. An MDR report belongs to a project.',
  noun: ['MDR and vigilance report', 'MDR and vigilance reports'],
  listPath: '/api/capa-mdr/mdr-events',
  readCap: { rows: MDR_READ_CAP, order: 'soonest due' },
  projectKept: true,
  name: (r) => r.mdrCode,
  columns: [
    { label: 'Number', cell: (r) => <span className="mono">{r.mdrCode}</span> },
    { label: 'What happened', text: true, cell: (r) => <span title={r.eventNarrative}>{r.eventNarrative}</span> },
    { label: 'Jurisdiction', cell: (r) => JURISDICTION_LABEL[r.jurisdiction] ?? r.jurisdiction },
    { label: 'Report', cell: (r) => reportOf(r) },
    { label: 'Decided', cell: (r) => formatDate(r.decisionDate) },
    {
      label: 'Report due',
      cell: (r) => (r.reportDueAt ? (
        <span className="qms-when">{formatDate(r.reportDueAt)}{isMdrOverdue(r) && <> <span className="rd-chip tone-err">Overdue</span></>}</span>
      ) : '—'),
    },
    { label: 'State', cell: (r) => pill(MDR_TONE[r.state] ?? 'review', MDR_STATE_LABEL[r.state] ?? r.state) },
  ],
  kpis: (rows) => {
    const open = rows.filter((r) => r.state !== 'closed');
    const overdue = rows.filter((r) => isMdrOverdue(r)).length;
    return [
      { label: 'Open', val: String(open.length), detail: `${rows.length - open.length} closed` },
      { label: 'Overdue, not filed', val: String(overdue), tone: overdue ? 'err' : 'ok' },
      { label: 'Filed', val: String(rows.filter((r) => r.state === 'filed' || r.state === 'acknowledged').length) },
    ];
  },
  createLabel: 'Record MDR decision',
  createForm: () => ({
    eyebrow: 'Quality',
    title: 'Record an MDR decision',
    sub: whereIn('An MDR report', 'as open. Its number and its reporting clock are the server’s.'),
    governed: 'Recording the decision writes an audit entry under your name.',
    submitLabel: 'Record MDR decision',
    fields: MDR_DECISION_FIELDS(),
  }),
  create: (v) => recordMdrDecision(openProject('An MDR report'), v),
  rowActions: [
    moveAction<MdrEventRow, MdrState>({
      name: (r) => r.mdrCode, state: (r) => r.state, moves: MDR_TRANSITIONS, labels: MDR_STATE_LABEL, path: 'mdr-events',
      extra: () => [
        { key: 'fdaReportNumber', label: 'FDA report number (when filed)', type: 'text', half: true },
        { key: 'euReportNumber', label: 'EU report number (when filed)', type: 'text', half: true },
      ],
      body: (v) => ({
        ...(v.fdaReportNumber?.trim() ? { fdaReportNumber: v.fdaReportNumber.trim() } : {}),
        ...(v.euReportNumber?.trim() ? { euReportNumber: v.euReportNumber.trim() } : {}),
      }),
    }),
  ],
  detail: {
    label: 'Show the vigilance timeline',
    render: (r) => <VigilanceTimeline programId={r.programId} entityType="mdr_event" entityId={r.id} />,
  },
  ask: 'Give me a read-out on MDR and vigilance reports: which are due or overdue, which are filed and awaiting acknowledgement, and what each needs next.',
  askRow: (r) => `Summarise MDR report ${r.mdrCode}: its jurisdiction, report type, reporting clock and what it needs next.`,
  facts: (r) => ({
    register: 'MDR and vigilance reports', mdr: r.mdrCode, jurisdiction: r.jurisdiction, report: reportOf(r),
    decided: r.decisionDate?.slice(0, 10) ?? null, due: r.reportDueAt?.slice(0, 10) ?? null, overdue: isMdrOverdue(r) ? 'yes' : 'no', state: r.state,
  }),
};
