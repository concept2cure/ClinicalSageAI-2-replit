/** Reach the existing IND sponsor registry and record its explicit program binding. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
import { mutateVerbatim, type MutateResult } from './SubmissionSeqWorkspaces';
import type { FireToast } from '../toast';

interface AuditOutcome { persisted: boolean; chained?: boolean; code?: string }
export interface IndSponsorRecord {
  id: string;
  name: string;
  duns: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  revision: string;
}
export interface IndProgramFacts {
  id: string;
  code: string | null;
  name: string | null;
  programType: string | null;
  primaryAgency?: string | null;
  sponsorName: string | null;
  productName: string | null;
  indication: string | null;
  applicationNumber: string | null;
  sponsorAddress?: string | null;
  indType?: string | null;
  applicantSponsorId?: string | null;
  boundSponsor?: IndSponsorRecord | null;
  factsVersion?: string;
  formMetadata: Record<string, unknown>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const versioned = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
export function isIndSponsorRecord(value: unknown): value is IndSponsorRecord {
  return object(value) && typeof value.id === 'string' && UUID.test(value.id) && typeof value.name === 'string' && value.name.trim() !== ''
    && versioned(value.revision) && ['duns', 'contactName', 'contactPhone', 'contactEmail', 'signatoryName', 'signatoryTitle'].every(key => nullableText(value[key]));
}
export function isIndProgramFacts(value: unknown): value is IndProgramFacts {
  if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id) || !object(value.formMetadata)) return false;
  if (!['code', 'name', 'programType', 'sponsorName', 'productName', 'indication', 'applicationNumber'].every(key => nullableText(value[key]))) return false;
  if (!['sponsorAddress', 'indType', 'primaryAgency'].every(key => value[key] === undefined || nullableText(value[key]))) return false;
  if (value.factsVersion !== undefined && !versioned(value.factsVersion)) return false;
  if (value.applicantSponsorId != null && (typeof value.applicantSponsorId !== 'string' || !UUID.test(value.applicantSponsorId))) return false;
  return value.boundSponsor == null || isIndSponsorRecord(value.boundSponsor);
}
function auditOutcome(value: unknown): value is AuditOutcome {
  return object(value) && (value.persisted === true && typeof value.chained === 'boolean' || value.persisted === false && value.code === 'AUDIT_ROW_NOT_PERSISTED');
}
function auditSentence(value: AuditOutcome, subject: string): string {
  if (!value.persisted) return ` The ${subject} was saved, but its audit entry could not be confirmed. Review the audit history before retrying.`;
  if (!value.chained) return ` The ${subject} audit entry is not confirmed in retrievable history. Follow up before treating this as a complete governed change.`;
  return '';
}
const clearable = (value: string): string | null => value.trim() || null;
const reasonValid = (value: string) => value.trim().length >= GOVERNED_REASON_MIN && value.trim().length <= GOVERNED_REASON_MAX;
function uncertainAnswer(result: MutateResult<unknown>): boolean {
  return result.unconfirmed === true || result.status === 204 || result.data != null || typeof result.status === 'number' && result.status >= 200 && result.status < 300;
}
function Reason({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label style={{ display: 'block', fontSize: 12, margin: '8px 0' }}>{label}
    <textarea className="c2c-input" aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} maxLength={GOVERNED_REASON_MAX} rows={2} />
    <span style={{ display: 'block', color: 'var(--text-400)' }}>Required, {GOVERNED_REASON_MIN}–{GOVERNED_REASON_MAX} characters. Recorded with this change.</span>
  </label>;
}

type SponsorValues = Pick<IndSponsorRecord, 'name' | 'duns' | 'contactName' | 'contactPhone' | 'contactEmail' | 'signatoryName' | 'signatoryTitle'>;
const emptySponsor = (): SponsorValues => ({ name: '', duns: '', contactName: '', contactPhone: '', contactEmail: '', signatoryName: '', signatoryTitle: '' });
const sponsorFields: Array<{ key: keyof SponsorValues; label: string; max: number; type?: string }> = [
  { key: 'name', label: 'Sponsor legal name', max: 200 }, { key: 'duns', label: 'DUNS number', max: 16 },
  { key: 'contactName', label: 'Regulatory contact name', max: 200 }, { key: 'contactPhone', label: 'Regulatory contact telephone', max: 40, type: 'tel' },
  { key: 'contactEmail', label: 'Regulatory contact email', max: 254, type: 'email' },
  { key: 'signatoryName', label: 'Authorized representative name', max: 200 },
  { key: 'signatoryTitle', label: 'Authorized representative title', max: 200 },
];
function sponsorWriteFields(values: SponsorValues): SponsorValues {
  return Object.fromEntries(sponsorFields.map(field => [field.key, field.key === 'name' ? values.name.trim() : clearable(values[field.key] ?? '')])) as SponsorValues;
}
function matchesSponsorReceipt(row: unknown, editing: IndSponsorRecord | null, fields: SponsorValues): row is IndSponsorRecord & { auditTrail: AuditOutcome } {
  if (!isIndSponsorRecord(row) || !object(row) || !auditOutcome(row.auditTrail)) return false;
  if (editing && (row.id !== editing.id || row.revision === editing.revision)) return false;
  return sponsorFields.every(field => row[field.key] === fields[field.key]);
}
function SponsorEditor({ editing, isCurrent, onRecorded, onClose, onBusy, onHold, locked }: {
  editing: IndSponsorRecord | null; isCurrent: () => boolean; onRecorded: (row: IndSponsorRecord) => void; onClose: () => void; onBusy: (busy: boolean) => void; onHold: () => void; locked: boolean;
}) {
  const [values, setValues] = useState<SponsorValues>(() => editing ? Object.fromEntries(sponsorFields.map(field => [field.key, editing[field.key] ?? ''])) as SponsorValues : emptySponsor());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && isCurrent();
  const save = async () => {
    if (![current(), !locked, !pending.current, !unconfirmed, Boolean(values.name.trim()), reasonValid(reason)].every(Boolean)) return;
    pending.current = true; setBusy(true); onBusy(true); setMessage(null);
    const fields = sponsorWriteFields(values);
    try {
      const result = await mutateVerbatim<IndSponsorRecord & { auditTrail: AuditOutcome }>(editing ? 'PATCH' : 'POST', `/api/ind-master-data/sponsors${editing ? `/${editing.id}` : ''}`, {
        ...fields, reason: reason.trim(), ...(editing ? { expectedRevision: editing.revision } : {}),
      });
      if (!current()) return;
      const row = result.data;
      if (!matchesSponsorReceipt(row, editing, fields)) {
        const unknown = uncertainAnswer(result);
        setUnconfirmed(unknown);
        if (unknown) onHold();
        setMessage(unknown ? 'We could not confirm whether the sponsor record was saved. Reload sponsor records and review them before recording another change.' : result.error ?? 'The sponsor record change was refused.');
        return;
      }
      onRecorded(row);
      setMessage(`Sponsor record saved${editing ? '.' : ' — it is not bound to this project. Select it and save the project facts to bind it.'}${auditSentence(row.auditTrail, 'sponsor record')}`);
      setReason('');
      // Keep this receipt visible; another write requires an explicit editor open.
      setUnconfirmed(true);
    } finally { if (current()) { pending.current = false; setBusy(false); onBusy(false); } }
  };
  return <fieldset aria-label="Sponsor registry record" style={{ border: '1px solid var(--border)', padding: 12, margin: '10px 0' }}>
    <legend>{editing ? 'Edit sponsor record' : 'Record a sponsor'}</legend>
    {editing && <p style={{ fontSize: 12 }}>Every project bound to this sponsor uses changes to this shared record. Saving this record does not change which sponsor this project selects.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
      {sponsorFields.map(field => <label key={field.key} style={{ fontSize: 12 }}>{field.label}<input className="c2c-input" type={field.type ?? 'text'} value={values[field.key] ?? ''} maxLength={field.max} disabled={busy || unconfirmed || locked} onChange={event => setValues(old => ({ ...old, [field.key]: event.target.value }))} /></label>)}
    </div>
    <p style={{ fontSize: 12, color: 'var(--text-400)' }}>DUNS is nine digits. FDA packaging requires a recorded DUNS and complete regulatory contact; incomplete sponsor records can be saved for completion. The authorized representative fields fill the forms; recording them does not sign a form.</p>
    <Reason label="Reason for sponsor record change" value={reason} onChange={setReason} disabled={busy || unconfirmed || locked} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="nda-open" disabled={busy || unconfirmed || locked || !values.name.trim() || !reasonValid(reason)} onClick={() => void save()}>{busy ? 'Saving sponsor…' : 'Save sponsor record'}</button>
      <button className="nda-open" disabled={busy} onClick={onClose}>Close sponsor editor</button>
    </div>
    {message && <p role="status" style={{ fontSize: 12 }}>{message}</p>}
  </fieldset>;
}

interface ProgramWriteFields { applicationNumber: string | null; applicantSponsorId: string | null; sponsorAddress: string | null; indType: string | null }
function recordedFields(program: IndProgramFacts): ProgramWriteFields {
  return { applicationNumber: program.applicationNumber ?? null, applicantSponsorId: program.applicantSponsorId ?? null, sponsorAddress: program.sponsorAddress ?? null, indType: program.indType ?? null };
}
function normalizedProgramFields(fields: ProgramWriteFields): ProgramWriteFields {
  return { ...fields, applicationNumber: clearable(fields.applicationNumber ?? ''), sponsorAddress: clearable(fields.sponsorAddress ?? '') };
}
function matchesProgramReceipt(row: unknown, program: IndProgramFacts, expected: ProgramWriteFields): row is ProgramWriteFields & { programId: string; factsVersion: string; boundSponsor: IndSponsorRecord | null; sponsorName: string | null; auditTrail: AuditOutcome } {
  if (!object(row) || row.programId !== program.id || !versioned(row.factsVersion) || row.factsVersion === program.factsVersion || !auditOutcome(row.auditTrail) || !nullableText(row.sponsorName)) return false;
  if (!Object.entries(expected).every(([key, value]) => row[key] === value)) return false;
  return expected.applicantSponsorId === null ? row.boundSponsor === null : isIndSponsorRecord(row.boundSponsor) && row.boundSponsor.id === expected.applicantSponsorId && row.sponsorName === row.boundSponsor.name;
}
interface IdentityProps {
  program: IndProgramFacts; projectIdent: string; indTypes: string[]; isCurrent: () => boolean;
  onReload: () => Promise<IndProgramFacts | null>; onRecorded: (program: IndProgramFacts) => void; note: FireToast; busy: boolean;
}
function sponsorOptionsFor(program: IndProgramFacts, sponsors: IndSponsorRecord[]): IndSponsorRecord[] {
  const bound = program.boundSponsor;
  return isIndSponsorRecord(bound) && !sponsors.some(row => row.id === bound.id) ? [bound, ...sponsors] : sponsors;
}
function useApplicantIdentity({ program, projectIdent, isCurrent, onReload, onRecorded, note, busy: panelBusy }: IdentityProps) {
  const baseline = recordedFields(program);
  const [fields, setFields] = useState(baseline);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<IndSponsorRecord[]>([]);
  const [registryBusy, setRegistryBusy] = useState(false);
  const [registryHold, setRegistryHold] = useState(false);
  const [registryState, setRegistryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [editor, setEditor] = useState<{ row: IndSponsorRecord | null; serial: number } | null>(null);
  const pending = useRef(false);
  const readGeneration = useRef(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; readGeneration.current += 1; }; }, []);
  const current = useCallback(() => active.current && isCurrent(), [isCurrent]);
  useEffect(() => {
    setFields({ applicationNumber: program.applicationNumber ?? null, applicantSponsorId: program.applicantSponsorId ?? null, sponsorAddress: program.sponsorAddress ?? null, indType: program.indType ?? null });
    setReason('');
  }, [program.id, program.factsVersion, program.applicationNumber, program.applicantSponsorId, program.sponsorAddress, program.indType]);
  const loadSponsors = useCallback(async () => {
    const generation = ++readGeneration.current;
    if (!current()) return;
    setRegistryState('loading');
    try {
      const res = await apiRequest('GET', '/api/ind-master-data/sponsors');
      const body: unknown = await res.json();
      if (!current() || generation !== readGeneration.current) return;
      if (!res.ok || !Array.isArray(body) || !body.every(isIndSponsorRecord)) { setRegistryState('error'); return; }
      setSponsors(body); setRegistryState('ready'); setEditor(null); setRegistryHold(false);
    } catch { if (current() && generation === readGeneration.current) setRegistryState('error'); }
  }, [current]);
  useEffect(() => { void loadSponsors(); }, [loadSponsors]);
  const dirty = Object.entries(fields).some(([key, value]) => value !== baseline[key as keyof ProgramWriteFields]);
  const indProgram = (program.programType ?? '').toUpperCase() === 'IND';
  const selected = sponsors.find(row => row.id === fields.applicantSponsorId);
  const sponsorOptions = sponsorOptionsFor(program, sponsors);
  const blocked = [busy, panelBusy, unconfirmed, registryBusy, registryHold].some(Boolean);
  const save = async () => {
    if (!current() || pending.current || blocked || !dirty || !reasonValid(reason) || !versioned(program.factsVersion)) return;
    pending.current = true; setBusy(true); setMessage(null);
    const expected = normalizedProgramFields(fields);
    try {
      const result = await mutateVerbatim<unknown>('PUT', '/api/ind-forms/program-facts', {
        projectIdent, expectedFactsVersion: program.factsVersion, reason: reason.trim(), applicationNumber: expected.applicationNumber,
        applicantSponsorId: expected.applicantSponsorId, sponsorAddress: expected.sponsorAddress, ...(indProgram ? { indType: expected.indType } : {}),
      });
      if (!current()) return;
      if (!matchesProgramReceipt(result.data, program, expected)) {
        const unknown = uncertainAnswer(result);
        setUnconfirmed(unknown);
        setMessage(unknown ? 'We could not confirm whether the project facts were saved. Reload recorded project facts before making another change.' : result.error ?? 'The project facts change was refused.');
        return;
      }
      const row = result.data;
      onRecorded({ ...program, ...row, id: program.id });
      const warning = auditSentence(row.auditTrail, 'project facts');
      setMessage(`Project facts saved.${warning}`); setReason('');
      if (warning) note(`Project facts saved.${warning}`, 'error'); else note('Project facts saved to the project record.');
    } finally { if (current()) { pending.current = false; setBusy(false); } }
  };
  const reload = async () => {
    if (!current() || busy || panelBusy || registryBusy) return;
    setBusy(true);
    try {
      const next = await onReload();
      if (!current()) return;
      if (!next || next.id !== program.id || !versioned(next.factsVersion)) { setMessage('The recorded project facts could not be verified. Reload before making another change.'); return; }
      setFields(recordedFields(next)); setReason(''); setUnconfirmed(false); setMessage('Recorded project facts reloaded. Review them before saving another change.');
    } finally { if (current()) setBusy(false); }
  };
  const openEditor = (row: IndSponsorRecord | null) => setEditor({ row, serial: ++readGeneration.current });
  const sponsorRecorded = (row: IndSponsorRecord) => {
    if (!current()) return;
    setSponsors(old => [row, ...old.filter(item => item.id !== row.id)]);
    if (row.id === program.applicantSponsorId) onRecorded({ ...program, sponsorName: row.name, boundSponsor: row });
  };
  return { fields, setFields, reason, setReason, busy, unconfirmed, message, sponsors, registryBusy, registryHold, registryState, editor, setEditor, setRegistryBusy, setRegistryHold, current, loadSponsors, dirty, indProgram, selected, sponsorOptions, blocked, save, reload, openEditor, sponsorRecorded };
}
type IdentityModel = ReturnType<typeof useApplicantIdentity>;
function ProgramFactFields({ model, indTypes }: { model: IdentityModel; indTypes: string[] }) {
  const { fields, setFields, blocked, registryState, sponsorOptions, indProgram } = model;
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
    <label style={{ fontSize: 12 }}>Agency application number<input className="c2c-input" value={fields.applicationNumber ?? ''} disabled={blocked} onChange={event => setFields(old => ({ ...old, applicationNumber: event.target.value || null }))} /></label>
    <label style={{ fontSize: 12 }}>Applicant sponsor record<select aria-label="Applicant sponsor record" className="c2c-input" value={fields.applicantSponsorId ?? ''} disabled={blocked || registryState !== 'ready'} onChange={event => setFields(old => ({ ...old, applicantSponsorId: event.target.value || null }))}>
      <option value="">No sponsor bound</option>{sponsorOptions.map(row => <option key={row.id} value={row.id}>{row.name}{row.duns ? ` · DUNS ${row.duns}` : ' · DUNS not recorded'}</option>)}
    </select></label>
    <label style={{ fontSize: 12 }}>Sponsor address<input className="c2c-input" value={fields.sponsorAddress ?? ''} disabled={blocked} onChange={event => setFields(old => ({ ...old, sponsorAddress: event.target.value || null }))} /></label>
    {indProgram && <label style={{ fontSize: 12 }}>IND type<select aria-label="IND type" className="c2c-input" value={fields.indType ?? ''} disabled={blocked} onChange={event => setFields(old => ({ ...old, indType: event.target.value || null }))}><option value="">Not stated — choose</option>{indTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>}
  </div>;
}
function RecordedSponsor({ program }: { program: IndProgramFacts }) {
  const row = program.boundSponsor;
  if (!row) return program.applicantSponsorId ? <p role="status">The bound sponsor record could not be verified. Reload recorded project facts before saving.</p> : null;
  return <p style={{ fontSize: 12 }}>Recorded sponsor: {row.name}. DUNS: {row.duns ?? 'not recorded'}. Regulatory contact: {row.contactName ?? 'not recorded'} · {row.contactPhone ?? 'telephone not recorded'} · {row.contactEmail ?? 'email not recorded'}. Authorized representative: {row.signatoryName ?? 'name not recorded'} · {row.signatoryTitle ?? 'title not recorded'}.</p>;
}
function IdentityStatus({ model, program }: { model: IdentityModel; program: IndProgramFacts }) {
  return <>
    {model.registryState === 'loading' && <p role="status">Reading sponsor records…</p>}
    {model.registryState === 'error' && <p role="status">Sponsor records could not be read. Reload sponsor records before selecting or editing a sponsor.</p>}
    {model.registryState === 'ready' && model.sponsors.length === 0 && <p>No sponsor records have been recorded.</p>}
    {model.dirty && <p role="status" style={{ fontSize: 12 }}>Not saved. Forms and packages continue to read the recorded project facts until you save.</p>}
    {!versioned(program.factsVersion) && <p role="status">The project revision was not reported. Reload recorded project facts before saving.</p>}
    {model.registryHold && <p role="status">The sponsor change could not be confirmed. Reload sponsor records and review them before making another change.</p>}
    {model.message && <p role="status" style={{ fontSize: 12 }}>{model.message}</p>}
  </>;
}
function IdentityActions({ model, program, panelBusy }: { model: IdentityModel; program: IndProgramFacts; panelBusy: boolean }) {
  const canSave = [!model.blocked, model.dirty, reasonValid(model.reason), versioned(program.factsVersion), model.fields.applicantSponsorId === null || Boolean(model.selected) || program.boundSponsor?.id === model.fields.applicantSponsorId].every(Boolean);
  const readingBlocked = [model.busy, panelBusy, model.registryBusy].some(Boolean);
  const registryBlocked = model.blocked || model.registryState !== 'ready';
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <button className="nda-open" disabled={!canSave} onClick={() => void model.save()}>{model.busy ? 'Saving…' : 'Save to project'}</button>
    <button className="nda-open" disabled={readingBlocked} onClick={() => void model.reload()}>Reload recorded project facts</button>
    <button className="nda-open" disabled={registryBlocked} onClick={() => model.openEditor(null)}>Record a sponsor</button>
    <button className="nda-open" disabled={registryBlocked || !model.selected} onClick={() => model.selected && model.openEditor(model.selected)}>Edit selected sponsor</button>
    <button className="nda-open" disabled={readingBlocked} onClick={() => void model.loadSponsors()}>Reload sponsor records</button>
  </div>;
}
export function IndApplicantIdentity(props: IdentityProps) {
  const model = useApplicantIdentity(props);
  const { program } = props;
  return <section aria-label="Recorded applicant identity" style={{ border: '1px solid var(--border)', padding: 12, marginBottom: 12 }}>
    <h4 style={{ margin: '0 0 8px' }}>Recorded applicant identity</h4>
    <p style={{ fontSize: 12 }}>The project selects an existing sponsor record. Forms and sequence packaging read that recorded selection; edits below apply only after saving.</p>
    <ProgramFactFields model={model} indTypes={props.indTypes} />
    <p style={{ fontSize: 12, color: 'var(--text-400)' }}>For FDA, record the six-digit number assigned by the agency. Leave it blank until assigned. The sponsor address remains a project fact.</p>
    <RecordedSponsor program={program} />
    <Reason label="Reason for project facts change" value={model.reason} onChange={model.setReason} disabled={model.blocked} />
    <IdentityStatus model={model} program={program} />
    <IdentityActions model={model} program={program} panelBusy={props.busy} />
    {model.editor && <SponsorEditor key={`${model.editor.row?.id ?? 'create'}:${model.editor.serial}`} editing={model.editor.row} isCurrent={model.current}
      locked={[model.busy, props.busy, model.unconfirmed, model.registryHold].some(Boolean)} onBusy={model.setRegistryBusy} onHold={() => model.setRegistryHold(true)}
      onClose={() => model.setEditor(null)} onRecorded={model.sponsorRecorded} />}
  </section>;
}
