/**
 * Protocol development, IRB package tab: the IRB submission's own record.
 *
 * Split out of IrbPackage.tsx. That file reads the package manifest; this one
 * is the record the manifest is judged against, and the writes that existed on
 * `/api/irb` with no caller under `client/` (docs/design/IRB_SUBMISSION.md
 * steps 4 and 5):
 *
 *   POST  /api/irb/submissions                 record the submission
 *   PATCH /api/irb/submissions/:id/context     record or retract a study fact
 *   PATCH /api/irb/submissions/:id/status      where the submission stands
 *   PATCH /api/irb/submissions/:id/link        its Submission Center submission
 *   GET   /api/irb/submissions/:id/completeness   the record checks and the approval lifecycle
 *
 * What is on file for the submission (the board's determinations, sites,
 * consent documents, amendments, reportable events) is IrbSubmissionRegisters.tsx.
 *
 * Every write is a governed action with a reason, and this file appends
 * nothing locally: after a confirmed write the tab reads the record again.
 *
 * D3: a status is what a person records about a board they dealt with
 * elsewhere. Nothing here delivers anything to a board, and no word here says
 * it did. D4: the board's decision is a determination, recorded under "On
 * file" and never as a status a person picks; the engine's suggested review
 * pathway is not shown.
 *
 * A study fact has three answers: yes, no, and not recorded. "Not recorded" is
 * never sent as no.
 */
import React, { useEffect, useState } from 'react';
import * as PG from './ProtocolGov';
import { KV } from './ProtocolDevShared';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormFieldOption } from '../C2CForm';
import { apiRequest, errorCodeOf, serverMessage } from '@/lib/queryClient';
import { IrbRegisters, REASON_FIELD, governedWrite, reasonOf, type IrbFormProps } from './IrbSubmissionRegisters';

const str = (v: unknown): string => (v == null ? '' : String(v));
const tri = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);

/* ── The record ────────────────────────────────────────────────────────────── */

/** The facts `PATCH …/context` records, by the name the route takes. */
export const IRB_FACTS = [
  ['isIndStudy', 'is_ind_study', 'Runs under an IND'],
  ['involvesChildren', 'involves_children', 'Involves children'],
  ['usesPhi', 'uses_phi', 'Uses protected health information'],
  ['usesRecruitmentMaterial', 'uses_recruitment_material', 'Uses recruitment material'],
  ['involvesVulnerablePopulations', 'involves_vulnerable_populations', 'Involves vulnerable populations'],
] as const;

export type IrbFactKey = (typeof IRB_FACTS)[number][0];

export interface IrbRecord {
  id: number;
  protocolNumber: string;
  title: string;
  status: string;
  riskLevel: string;
  linkedSubmissionId: number | null;
  facts: Record<IrbFactKey, boolean | null>;
  /** The safeguards documented for vulnerable populations (45 CFR 46.111(b)), or '' when none is. */
  safeguards: string;
  consentWaiverRequested: boolean;
  singleIrb: boolean;
}

/** One row of `GET /api/irb/submissions`: raw columns, snake_case. */
export function toIrbRecord(raw: Record<string, unknown>): IrbRecord {
  const facts = {} as Record<IrbFactKey, boolean | null>;
  for (const [key, column] of IRB_FACTS) facts[key] = tri(raw[column]);
  return {
    id: Number(raw.id),
    protocolNumber: str(raw.protocol_number),
    title: str(raw.title),
    status: str(raw.status),
    riskLevel: str(raw.risk_level),
    linkedSubmissionId: raw.submission_id == null ? null : Number(raw.submission_id),
    facts,
    safeguards: str(raw.vulnerable_population_protections),
    consentWaiverRequested: raw.consent_waiver_requested === true,
    singleIrb: raw.is_single_irb === true,
  };
}

const answer = (v: boolean | null): string => (v === true ? 'yes' : v === false ? 'no' : 'not recorded');

const RISK_WORD: Record<string, string> = { minimal: 'minimal risk', greater_than_minimal: 'greater than minimal risk' };

/** The status in words. "submitted" is a person's record of what they did with the board, elsewhere. */
const STATUS_WORD: Record<string, string> = {
  draft: 'draft', submitted: 'recorded as submitted', under_review: 'under review',
  modifications_required: 'modifications required', approved: 'approved', deferred: 'deferred',
  disapproved: 'disapproved', suspended: 'suspended', closed: 'closed', expired: 'expired',
};

/* ── Writing ───────────────────────────────────────────────────────────────── */

/** Three answers. '' is "not recorded" and is sent as absent, never as no. */
const FACT_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Not recorded' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
];
const YES_NO: C2CFormFieldOption[] = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }];
const declared = (v: string | undefined): boolean | undefined => (v === 'yes' ? true : v === 'no' ? false : undefined);

/** The project's Submission Center submissions, for the link. A failed read is said, not drawn as none. */
interface SubmissionChoices { options: C2CFormFieldOption[]; note: string }

function useSubmissionChoices(programId: string | null, open: boolean): SubmissionChoices | null {
  const [choices, setChoices] = useState<SubmissionChoices | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    if (!programId) { setChoices({ options: [], note: 'No project is open, so its Submission Center submissions cannot be listed.' }); return undefined; }
    let live = true;
    setChoices(null);
    void (async () => {
      try {
        const res = await apiRequest('GET', `/api/submissions?programId=${encodeURIComponent(programId)}`);
        const json = (await res.json().catch(() => null)) as unknown;
        const rows = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown } | null)?.data) ? (json as { data: unknown[] }).data : null;
        if (!res.ok || !rows) throw new Error(serverMessage(json) ?? `HTTP ${res.status}`);
        const options = (rows as Array<Record<string, unknown>>).map((r) => ({ value: str(r.id), label: str(r.title) || `Submission ${str(r.id)}` }));
        if (live) setChoices({ options, note: options.length ? '' : 'This project has no Submission Center submission yet. Start one in Submission Center, then link it here.' });
      } catch (e) {
        if (live) setChoices({ options: [], note: `The project's submissions could not be read (${e instanceof Error ? e.message : String(e)}), so none can be chosen now.` });
      }
    })();
    return () => { live = false; };
  }, [programId, open]);
  return choices;
}

/* ── Record the submission ─────────────────────────────────────────────────── */

function createConfig(protocolNumber: string, title: string, choices: SubmissionChoices | null): C2CFormConfig {
  return {
    eyebrow: 'Protocol · IRB submission', title: 'Record the IRB submission',
    sub: `Against protocol number ${protocolNumber}. This records the submission and what the study involves, so the package a board expects can be worked out. It delivers nothing to a board. Recorded as a governed action.`,
    governed: true, submitLabel: 'Record submission',
    busy: choices ? undefined : 'Reading the project’s submissions…',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, default: title },
      /* No preselected risk level: a default here would be an assessment nobody made. */
      { key: 'riskLevel', label: 'Risk level', type: 'select', required: true, half: true,
        options: [{ value: 'minimal', label: 'Minimal risk' }, { value: 'greater_than_minimal', label: 'Greater than minimal risk' }] },
      { key: 'submissionId', label: 'Submission Center submission', type: 'select', half: true,
        options: choices?.options ?? [],
        desc: 'The submission that carries the package’s documents. Leave it unselected to link later; once linked it is not moved.',
        descStatus: choices?.note ?? '' },
      ...IRB_FACTS.map(([key, , label]) => ({ key, label: `${label}?`, type: 'seg' as const, options: FACT_OPTIONS, half: true })),
      { key: 'vulnerablePopulationProtections', label: 'Additional safeguards', type: 'textarea' as const,
        placeholder: 'The safeguards documented for vulnerable populations, if any (45 CFR 46.111(b))' },
      { key: 'isSingleIrb', label: 'One IRB of record for every site?', type: 'seg', options: YES_NO, default: 'no', half: true },
      { key: 'consentWaiverRequested', label: 'Consent waiver requested?', type: 'seg', options: YES_NO, default: 'no', half: true },
      REASON_FIELD,
    ],
  };
}

export function RecordIrbSubmissionForm({ protocolNumber, title, programId, onCancel, onDone, onError }: IrbFormProps & { protocolNumber: string; title: string; programId: string | null }) {
  const choices = useSubmissionChoices(programId, true);
  const submit = async (v: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = { protocolNumber, title: (v.title ?? '').trim(), riskLevel: v.riskLevel, reason: reasonOf(v) };
      if (v.submissionId) body.submissionId = Number(v.submissionId);
      for (const [key] of IRB_FACTS) {
        const value = declared(v[key]);
        if (value !== undefined) body[key] = value;
      }
      if ((v.vulnerablePopulationProtections ?? '').trim()) body.vulnerablePopulationProtections = v.vulnerablePopulationProtections.trim();
      body.isSingleIrb = v.isSingleIrb === 'yes';
      body.consentWaiverRequested = v.consentWaiverRequested === 'yes';
      const out = await governedWrite('POST', '/api/irb/submissions', body, 'record the IRB submission');
      onDone(`IRB submission ${str(out.id)} recorded.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return <C2CForm config={createConfig(protocolNumber, title, choices)} onCancel={onCancel} onSubmit={submit} />;
}

/* ── The three forms on an existing record ─────────────────────────────────── */

/** The statuses a person sets. A board's decision is a determination, not one of these. */
const SETTABLE_STATUSES = ['draft', 'submitted', 'under_review', 'suspended', 'closed', 'expired'] as const;

const KEEP = 'keep';

function factsConfig(record: IrbRecord): C2CFormConfig {
  return {
    eyebrow: 'Protocol · IRB submission', title: 'Record study facts',
    sub: 'Each fact decides which documents a board expects. "Not recorded" takes an answer back; it is not the same as No. Recorded as a governed action.',
    governed: true, submitLabel: 'Record facts',
    fields: [
      ...IRB_FACTS.map(([key, , label]) => ({
        key, label: `${label}?`, type: 'seg' as const, default: KEEP,
        options: [{ value: KEEP, label: `Leave as it is (${answer(record.facts[key])})` }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unrecord', label: 'Not recorded' }],
      })),
      { key: 'vulnerablePopulationProtections', label: 'Additional safeguards', type: 'textarea' as const, default: record.safeguards,
        desc: 'The safeguards documented for vulnerable populations (45 CFR 46.111(b)). Clear it to take it back.' },
      REASON_FIELD,
    ],
  };
}

function statusConfig(record: IrbRecord): C2CFormConfig {
  return {
    eyebrow: 'Protocol · IRB submission', title: 'Change status',
    sub: `Now ${STATUS_WORD[record.status] ?? record.status}. This records where the submission stands with the board, which you deal with in its own portal or inbox: nothing is delivered from here. A board's decision (approved, modifications required, deferred, disapproved) is recorded as a determination under "On file", not here. Recorded as a governed action.`,
    governed: true, submitLabel: 'Record status',
    fields: [
      { key: 'status', label: 'Status', type: 'select', required: true,
        options: SETTABLE_STATUSES.filter((s) => s !== record.status).map((s) => ({ value: s, label: PG.inWords(STATUS_WORD[s]) })) },
      REASON_FIELD,
    ],
  };
}

function linkConfig(choices: SubmissionChoices | null): C2CFormConfig {
  return {
    eyebrow: 'Protocol · IRB submission', title: 'Link to a Submission Center submission',
    sub: 'The package is the documents that submission carries at its IRB slots. Once linked, the link is not moved. Recorded as a governed action.',
    governed: true, submitLabel: 'Link submission',
    busy: choices ? undefined : 'Reading the project’s submissions…',
    notice: choices?.note || undefined,
    fields: [
      { key: 'submissionId', label: 'Submission Center submission', type: 'select', required: true, options: choices?.options ?? [] },
      REASON_FIELD,
    ],
  };
}

export type IrbRecordFormKind = 'facts' | 'status' | 'link';

export function IrbRecordForm({ kind, record, programId, onCancel, onDone, onError }: IrbFormProps & { kind: IrbRecordFormKind; record: IrbRecord; programId: string | null }) {
  const choices = useSubmissionChoices(programId, kind === 'link');
  const base = `/api/irb/submissions/${record.id}`;
  const submit = async (v: Record<string, string>) => {
    try {
      const reason = reasonOf(v);
      if (kind === 'status') {
        await governedWrite('PATCH', `${base}/status`, { status: v.status, reason }, 'record the status');
        return onDone(`Status recorded: ${STATUS_WORD[v.status] ?? v.status}.`);
      }
      if (kind === 'link') {
        await governedWrite('PATCH', `${base}/link`, { submissionId: Number(v.submissionId), reason }, 'link the submission');
        return onDone('Linked to the Submission Center submission.');
      }
      /* Only the facts the person changed are sent: absent leaves a fact as it
         was, and null takes an answer back to not recorded. */
      const body: Record<string, unknown> = { reason };
      for (const [key] of IRB_FACTS) {
        if (v[key] === 'yes') body[key] = true;
        else if (v[key] === 'no') body[key] = false;
        else if (v[key] === 'unrecord') body[key] = null;
      }
      /* The safeguards text is sent only when the person changed it; cleared, it is taken back as null. */
      const safeguards = (v.vulnerablePopulationProtections ?? '').trim();
      if (safeguards !== record.safeguards.trim()) body.vulnerablePopulationProtections = safeguards || null;
      if (Object.keys(body).length === 1) throw new Error('Nothing was changed: every fact was left as it is.');
      await governedWrite('PATCH', `${base}/context`, body, 'record the study facts');
      return onDone('Study facts recorded.');
    } catch (e) {
      return onError(e instanceof Error ? e.message : String(e));
    }
  };
  const config = kind === 'facts' ? factsConfig(record) : kind === 'status' ? statusConfig(record) : linkConfig(choices);
  return <C2CForm config={config} onCancel={onCancel} onSubmit={submit} />;
}

/* ── What the record supports: the engines' own findings ───────────────────── */

interface CompletenessView {
  findings: Array<{ severity: string; message: string; basis: string }>;
  flag: string;
  checksRun: string[];
  notAssessed: string[];
}
interface LifecycleView {
  approval: string;
  continuingReview: string;
  expirationDate: string | null;
  expirationSource: string;
  daysToExpiration: number | null;
  findings: Array<{ code: string; severity: string; message: string; remediation: string; basis: string }>;
}
type StandingState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; completeness: CompletenessView; lifecycle: LifecycleView };

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

async function readStanding(id: number): Promise<StandingState> {
  const res = await apiRequest('GET', `/api/irb/submissions/${id}/completeness`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) return { kind: 'failed', message: serverMessage(json) ?? errorCodeOf(json) ?? `HTTP ${res.status}` };
  const c = (json.completeness ?? {}) as Record<string, unknown>;
  const l = (json.lifecycle ?? {}) as Record<string, unknown>;
  return {
    kind: 'ready',
    completeness: { findings: list(c.findings), flag: str(c.riskLevel), checksRun: list(c.checksRun), notAssessed: list(c.notAssessed) },
    lifecycle: {
      approval: str(l.approval), continuingReview: str(l.continuingReview),
      expirationDate: l.expirationDate == null ? null : str(l.expirationDate), expirationSource: str(l.expirationSource),
      daysToExpiration: typeof l.daysToExpiration === 'number' ? l.daysToExpiration : null,
      findings: list(l.findings),
    },
  };
}

/** The checks' overall reading, as the engine flags it. Never a figure. */
const FLAG_MEANS: Record<string, string> = {
  high: 'A critical finding is open.',
  medium: 'A major finding is open; no critical one.',
  low: 'Every check ran and none raised a critical or major finding.',
  undetermined: 'No critical finding, but a check that could raise one did not run. This is not a clean result.',
};
const APPROVAL_WORD: Record<string, string> = {
  not_approved: 'not approved', current: 'approved, current', expiring_soon: 'approved, expiring soon',
  expired: 'approval expired', unknown: 'not known from this record',
};
const CONTINUING_WORD: Record<string, string> = { required: 'required', not_required: 'not required', unknown: 'not known from this record' };

function expirationWords(l: LifecycleView): string {
  if (!l.expirationDate) return 'none recorded';
  const source = l.expirationSource === 'recorded' ? 'the board’s date' : 'computed from the approval date';
  return `${l.expirationDate} (${source})`;
}

function FindingRows({ findings }: { findings: Array<{ severity: string; message: string; basis: string; remediation?: string }> }) {
  return (
    <ul className="pg-findings" style={{ marginTop: 8 }}>
      {findings.map((f) => (
        <li key={f.message} data-sev={f.severity}>
          <span className="pg-find-dot" data-tone={PG.SEV_TONE[f.severity] || 'idle'} />
          <span className="pg-find-sev">{PG.inWords(f.severity)}</span>
          <span className="pg-find-msg">
            {f.message}
            {f.remediation && <span>{` ${f.remediation}`}</span>}
            <span className="pde-basis" style={{ display: 'block', marginTop: 2 }}>{f.basis}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Standing({ state }: { state: StandingState }) {
  if (state.kind === 'loading') return <div role="status" className="scaf-note">Reading the record checks…</div>;
  if (state.kind === 'failed') {
    return (
      <div className="pde-refusal" role="alert">
        {`The record checks and the approval lifecycle could not be read: ${state.message}. `}
        Neither is shown. This is a failed read, not a record with no findings.
      </div>
    );
  }
  const { completeness: c, lifecycle: l } = state;
  return (
    <>
      <section className="pj-card" style={{ padding: 12, marginTop: 10 }} role="group" aria-label="Record checks">
        <div className="pj-card-h"><span className="t">Record checks</span><span className="s">{`${c.checksRun.length} ran, ${c.notAssessed.length} could not`}</span></div>
        <div className="pd-pane-s">{FLAG_MEANS[c.flag] ?? 'The checks returned no overall reading.'}</div>
        {c.findings.length > 0 && <FindingRows findings={c.findings} />}
        {c.notAssessed.length > 0 && (
          <div className="pde-note" role="group" aria-label="Checks that could not run">
            <div>Could not run, because the record does not say:</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>{c.notAssessed.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {c.checksRun.length > 0 && (
          <div className="pde-basis">{`Ran: ${c.checksRun.join('; ')}.`}</div>
        )}
      </section>
      <section className="pj-card" style={{ padding: 12, marginTop: 10 }} role="group" aria-label="Approval">
        <div className="pj-card-h"><span className="t">Approval</span><span className="s">From the record, as of today.</span></div>
        <KV k="Approval" v={APPROVAL_WORD[l.approval] ?? 'not known from this record'} />
        <KV k="Continuing review" v={CONTINUING_WORD[l.continuingReview] ?? 'not known from this record'} />
        <KV k="Expiration" v={expirationWords(l)} />
        {l.daysToExpiration != null && <KV k="Days to expiration" v={String(l.daysToExpiration)} />}
        {l.findings.length > 0 && <FindingRows findings={l.findings} />}
      </section>
    </>
  );
}

/* ── The record card ───────────────────────────────────────────────────────── */

export interface IrbSubmissionRecordProps {
  record: IrbRecord;
  canWrite: boolean;
  programId: string | null;
  /** Called after a confirmed write: the tab reads the record again. */
  onChanged: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}

export function IrbSubmissionRecord({ record, canWrite, programId, onChanged, onError, onToast }: IrbSubmissionRecordProps) {
  const [form, setForm] = useState<IrbRecordFormKind | null>(null);
  const [standing, setStanding] = useState<StandingState>({ kind: 'loading' });
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    setStanding({ kind: 'loading' });
    void readStanding(record.id)
      .then((s) => { if (live) setStanding(s); })
      .catch((e: unknown) => { if (live) setStanding({ kind: 'failed', message: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [record.id, reads]);

  const done = (message: string) => { setForm(null); onToast(message); setReads((n) => n + 1); onChanged(); };
  const linked = record.linkedSubmissionId;

  return (
    <>
      <section className="pj-card" style={{ padding: 12 }} role="group" aria-label="IRB submission record">
        <div className="pj-card-h">
          <span className="t">{`IRB submission ${record.id}`}</span>
          <PG.StatusBadge status={record.status} label={STATUS_WORD[record.status] ?? record.status} />
        </div>
        <div className="pd-pane-s">{record.title || 'No title recorded.'}</div>
        <KV k="Protocol number" v={record.protocolNumber} />
        <KV k="Risk level" v={RISK_WORD[record.riskLevel] ?? 'not recorded'} />
        <KV k="Submission Center submission" v={linked == null ? 'not linked' : `submission ${linked}`} />
        {IRB_FACTS.map(([key, , label]) => <KV key={key} k={label} v={answer(record.facts[key])} />)}
        {record.safeguards && <div className="pde-note">{`Additional safeguards: ${record.safeguards}`}</div>}
        <KV k="One IRB of record for every site" v={record.singleIrb ? 'yes' : 'no'} />
        <KV k="Consent waiver requested" v={record.consentWaiverRequested ? 'yes' : 'no'} />
        {canWrite && (
          <div className="pde-actions" style={{ marginTop: 10 }}>
            <PG.Btn icon="penLine" variant="outline" onClick={() => setForm('facts')}>Record study facts</PG.Btn>
            <PG.Btn icon="penLine" variant="outline" onClick={() => setForm('status')}>Change status</PG.Btn>
            {linked == null && <PG.Btn icon="plus" variant="outline" onClick={() => setForm('link')}>Link to a submission</PG.Btn>}
          </div>
        )}
      </section>
      <IrbRegisters
        submissionId={record.id} title={record.title} canWrite={canWrite} reads={reads}
        onChanged={done} onError={onError}
      />
      <Standing state={standing} />
      {form && (
        <IrbRecordForm kind={form} record={record} programId={programId} onCancel={() => setForm(null)} onDone={done} onError={onError} />
      )}
    </>
  );
}
