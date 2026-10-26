import React, { useRef, useState } from 'react';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { useLiveData } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { EsignModal } from '../../_shared/components/EsignModal';
import { assessmentRequest, enteredMeasurements, RecordedSnapshot, requireSavedIdentity, savedRecordFields } from './AssessmentWorkbenchKit';

import { nativeBlaForm, enteredNativeBlaInput, type NativeBlaEngine } from './BlaAssessmentInputs';

interface Assessment { id: string; program_id: string | null; title: string; kind: string; verdict: string | null; status: string }
const COMPARABILITY: C2CFormConfig = {
  eyebrow: 'Biologics · Q5E', title: 'Assess manufacturing comparability', governed: true,
  sub: 'Compute and save a draft from measured pre-change and post-change lot values. Missing evidence stays a finding; review the result before signing.',
  submitLabel: 'Compute and save draft', fields: [
    ...savedRecordFields,
    { key: 'changeDescription', label: 'Manufacturing change', type: 'textarea', required: true },
    { key: 'attribute', label: 'Quality attribute', type: 'text', required: true },
    { key: 'criticality', label: 'Attribute criticality', type: 'select', required: true, options: ['high','moderate','low'], half: true },
    { key: 'unit', label: 'Measurement unit', type: 'text', half: true },
    { key: 'preChange', label: 'Pre-change lot measurements', type: 'textarea', required: true },
    { key: 'postChange', label: 'Post-change lot measurements', type: 'textarea', required: true },
  ],
};
const SCIENCE_INPUT: C2CFormConfig = {
  eyebrow: 'Biologics · science engine', title: 'Assess entered scientific inputs', governed: true,
  sub: 'Provide the existing engine’s complete JSON input. No example measurements are inserted. The server computes the result and saves its exact inputs as a draft.',
  submitLabel: 'Compute and save draft', fields: [...savedRecordFields,
    { key: 'engine', label: 'Science engine', type: 'select', required: true, options: ['analytical-similarity','comparability','immunogenicity','filing-risk'] },
    { key: 'input', label: 'Scientific inputs (JSON object)', type: 'textarea', required: true },
  ],
};

export function BlaAssessmentWorkbench() {
  const programId = shellProgramId(useShellProject());
  return programId ? <ProgramBlaWorkbench key={programId} programId={programId} /> : <p>Open a project to assess and save biologics evidence.</p>;
}

function ProgramBlaWorkbench({ programId }: { programId: string }) {
  const [epoch, setEpoch] = useState(0);
  const [form, setForm] = useState<'q5e' | 'science' | NativeBlaEngine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sign, setSign] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const path = `/api/biopharma/bla/assessments?programId=${encodeURIComponent(programId)}`;
  const list = useLiveData<{ assessments: Assessment[]; pendingStore?: boolean }>(path, [path, epoch], (value): value is { assessments: Assessment[]; pendingStore?: boolean } => !!value && Array.isArray((value as {assessments?:unknown}).assessments));
  const detailPath = selected ? `/api/biopharma/bla/assessments/${encodeURIComponent(selected)}` : null;
  const detail = useLiveData<Assessment & { input: unknown; result: unknown }>(detailPath, [detailPath, epoch]);
  const record = detail.data?.id === selected && detail.data.program_id === programId ? detail.data : null;

  async function save(values: Record<string, string>) {
    if (uncertain) throw new Error('Refresh and check saved records before submitting again.');
    let engine = 'comparability'; let inputs: Record<string, unknown>;
    if (form === 'q5e') inputs = { changeDescription: values.changeDescription, attributes: [{ name: values.attribute,
      criticality: values.criticality, unit: values.unit || undefined, preChange: enteredMeasurements(values.preChange), postChange: enteredMeasurements(values.postChange) }] };
    else if (form && form !== 'science') { engine = form; inputs = enteredNativeBlaInput(form, values); }
    else {
      engine = values.engine;
      try { inputs = JSON.parse(values.input); } catch { throw new Error('Scientific inputs must be valid JSON.'); }
      if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new Error('Scientific inputs must be a JSON object.');
    }
    try {
      const response = await assessmentRequest('POST', `/api/biopharma/bla/${engine}`, { ...inputs, programId, title: values.title, reason: values.reason, persist: true });
      const id = requireSavedIdentity(response.assessment, programId);
      setSelected(id); setEpoch(value => value + 1); setForm(null); setNotice('Draft saved. Read its recorded inputs and result before signing.');
    } catch (error) { setUncertain(true); setNotice('Save was not confirmed. Refresh and check saved records before another attempt.'); throw error; }
  }
  async function signRecord(input: Parameters<React.ComponentProps<typeof EsignModal>['onSign']>[0]) {
    if (!record || record.status === 'signed') throw new Error('Read an unsigned saved assessment first.');
    const result = await assessmentRequest('POST', `/api/biopharma/bla/assessments/${record.id}/sign`, { ...input, mfaToken: input.totp });
    if (result.id !== record.id || result.status !== 'signed' || typeof result.signedAt !== 'string' || !result.signatureId || !result.sha256Chain) throw new Error('The server did not confirm this signature. Refresh this record.');
    setEpoch(value => value + 1);
    return { meaning: input.meaning, reason: input.reason, signedAt: result.signedAt, hash: result.sha256Chain };
  }
  async function refresh() {
    try {
      const result = await assessmentRequest('GET', path);
      if (!Array.isArray(result.assessments) || result.pendingStore) throw new Error('The saved assessment store is unavailable.');
      setUncertain(false); setEpoch(value => value + 1); setNotice('Saved records refreshed. Check them before creating another record.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Saved records could not be refreshed.'); }
  }
  function submit(values: Record<string, string>) {
    if (running.current) return;
    running.current = true; setBusy(true); setFormError('');
    void save(values).catch(error => setFormError(error instanceof Error ? error.message : 'Save was not confirmed.'))
      .finally(() => { running.current = false; setBusy(false); });
  }
  return <section aria-label="Biologics assessment workbench" className="reg-card reg-pad">
    <p>Save measured evidence as a draft, inspect its complete stored inputs and result, then sign the saved assessment with the declared meaning. A computation or saved draft is not approval.</p>
    <button className="nda-open" onClick={() => setForm('q5e')}>Assess Q5E comparability</button>{' '}
    <button className="nda-open" onClick={() => setForm('analytical-similarity')}>Assess analytical similarity</button>{' '}
    <button className="nda-open" onClick={() => setForm('immunogenicity')}>Assess immunogenicity</button>{' '}
    <button className="nda-open" onClick={() => setForm('filing-risk')}>Assess BLA filing risk</button>{' '}
    <button className="nda-open" onClick={() => setForm('science')}>Assess complete scientific input</button>{' '}
    <button className="nda-open" onClick={refresh}>Refresh saved records</button>
    {notice && <p role="status">{notice}</p>}
    <BlaSavedRecords list={list} selected={selected} onSelect={id => { setSelected(id); setSign(false); }} />
    {selected && <BlaSavedSnapshot detail={detail} record={record} onSign={() => setSign(true)} />}
    {form && <C2CForm config={{ ...(form === 'q5e' ? COMPARABILITY : form === 'science' ? SCIENCE_INPUT : nativeBlaForm(form)), notice: formError || undefined, busy: busy ? 'Saving governed draft…' : undefined }} onCancel={() => setForm(null)} onSubmit={submit} />}
    <EsignModal open={sign && !!record} action="Sign biologics assessment" target={record?.title || 'Saved assessment'} defaultMeaning="review"
      meanings={['review','approval','responsibility']} onClose={() => setSign(false)} onSign={signRecord} />
  </section>;
}

type Read<T> = { loading: boolean; data: T | null; error?: string | null };
function BlaSavedRecords({ list, selected, onSelect }: { list: Read<{ assessments: Assessment[]; pendingStore?: boolean }>; selected: string | null; onSelect: (id: string | null) => void }) {
  if (list.loading) return <p role="status">Loading saved biologics assessments…</p>;
  if (list.error) return <p role="alert">{list.error}</p>;
  if (list.data?.pendingStore) return <p role="alert">The assessment store is unavailable; no saved count is established.</p>;
  return <><label htmlFor="bla-saved-record">Saved assessment</label><select id="bla-saved-record" value={selected ?? ''} onChange={event => onSelect(event.target.value || null)}>
    <option value="">Choose a saved record</option>{list.data?.assessments.map(row => <option key={row.id} value={row.id}>{row.title || row.kind} · {row.status} · {row.verdict || 'no verdict'}</option>)}
  </select>{!list.data?.assessments.length && <p>No assessments are saved for this project.</p>}</>;
}
function BlaSavedSnapshot({ detail, record, onSign }: { detail: Read<Assessment & { input: unknown; result: unknown }>; record: (Assessment & { input: unknown; result: unknown }) | null; onSign: () => void }) {
  if (detail.loading) return <p role="status">Loading the saved snapshot…</p>;
  if (detail.error || !record) return <p role="alert">{detail.error || 'This saved assessment is unavailable in the open project.'}</p>;
  return <div><h3>{record.title}</h3><p>Saved status: {record.status} · {record.verdict || 'No verdict recorded'}</p>
    <RecordedSnapshot title="Recorded scientific inputs" value={record.input} /><RecordedSnapshot title="Saved science-engine result" value={record.result} />
    <button className="nda-open" disabled={record.status === 'signed'} onClick={onSign}>Review and sign saved assessment</button>
  </div>;
}
