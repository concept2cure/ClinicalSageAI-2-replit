import React, { useRef, useState } from 'react';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { useLiveData } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { SourceImportDialog, openImportedDocument } from '../editor/SourceImportDialog';
import type { WorkflowImportSource } from '@shared/authoring/source-import';
import { assessmentRequest, RecordedSnapshot, requireSavedIdentity, savedRecordFields } from './AssessmentWorkbenchKit';

interface SavedAssessment { id: string; program_id: string | null; title: string | null; assessment_type: string; inputs: unknown; result: unknown; verdict: string | null }
interface SavedDocument { id: string; program_id: string | null; title: string | null; doc_type: string; payload: unknown; status: string }
const BOOLEAN_FACTS = [
  ['isSelfTest', 'Self-test'], ['isNearPatient', 'Near-patient test'], ['isCompanionDiagnostic', 'Companion diagnostic'],
  ['detectsTransmissibleAgent', 'Detects a transmissible agent'], ['bloodScreening', 'Screens blood, tissues or organs for donation'],
  ['detectsCancer', 'Detects cancer'], ['prenatalScreening', 'Prenatal screening'], ['isGeneticTest', 'Genetic test'],
] as const;
const CLASSIFICATION: C2CFormConfig = {
  eyebrow: 'IVD · Annex VIII', title: 'Assess and save IVDR classification', governed: true,
  sub: 'Answer each intended-purpose question explicitly. The server applies the existing classification rules and records their trace. This result does not establish conformity.',
  submitLabel: 'Assess and save draft', fields: [...savedRecordFields,
    { key: 'deviceName', label: 'Device name', type: 'text', required: true },
    { key: 'intendedPurpose', label: 'Intended purpose', type: 'textarea', required: true },
    { key: 'analytes', label: 'Analytes (comma separated)', type: 'text' },
    ...BOOLEAN_FACTS.map(([key, label]) => ({ key, label, type: 'select' as const, required: true, options: ['Yes', 'No'], half: true })),
  ],
};
const FSN: C2CFormConfig = {
  eyebrow: 'IVD · post-market', title: 'Create a Field Safety Notice draft', governed: true,
  sub: 'Generate and save a draft from the recorded action facts. Review and sign a working copy in Authoring before any controlled use. This action sends no notice.',
  submitLabel: 'Generate and save draft', fields: [...savedRecordFields,
    { key: 'manufacturerName', label: 'Manufacturer', type: 'text', required: true },
    { key: 'deviceName', label: 'Affected device', type: 'text', required: true },
    { key: 'affectedLots', label: 'Affected lots (comma separated)', type: 'textarea', required: true },
    { key: 'actionType', label: 'Field action', type: 'select', required: true, options: ['recall','software_update','advisory','modification','return'] },
    { key: 'reasonForAction', label: 'Reason for the field action', type: 'textarea', required: true },
    { key: 'riskToHealth', label: 'Risk to health', type: 'textarea', required: true },
    { key: 'recommendedUserAction', label: 'Recommended user action', type: 'textarea', required: true },
    { key: 'contactDetails', label: 'Contact details', type: 'textarea', required: true },
  ],
};
const split = (text: string) => text.split(',').map(value => value.trim()).filter(Boolean);
export function enteredIvdrFacts(values: Record<string, string>) {
  const facts: Record<string, unknown> = { deviceName: values.deviceName, intendedPurpose: values.intendedPurpose,
    ...(values.analytes?.trim() ? { analytes: split(values.analytes) } : {}) };
  for (const [key, label] of BOOLEAN_FACTS) {
    if (values[key] !== 'Yes' && values[key] !== 'No') throw new Error(`Answer “${label}” explicitly.`);
    facts[key] = values[key] === 'Yes';
  }
  return facts;
}

export function IvdAssessmentWorkbench({ onNav }: { onNav?: (id: string) => void }) {
  const programId = shellProgramId(useShellProject());
  return programId ? <ProgramIvdWorkbench key={programId} programId={programId} onNav={onNav} />
    : <section><h2>Saved IVD evidence</h2><p>Open a program to assess and save IVD evidence.</p></section>;
}

function ProgramIvdWorkbench({ programId, onNav }: { programId: string; onNav?: (id: string) => void }) {
  const [epoch, setEpoch] = useState(0);
  const [form, setForm] = useState<'classification' | 'fsn' | null>(null);
  const [selected, setSelected] = useState('');
  const [source, setSource] = useState<WorkflowImportSource | null>(null);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const path = `/api/ivd-assessments?program_id=${encodeURIComponent(programId)}`;
  const docsPath = `/api/ivd-assessments/documents?program_id=${encodeURIComponent(programId)}`;
  const assessments = useLiveData<{ rows: SavedAssessment[] }>(path, [path, epoch], (value): value is { rows: SavedAssessment[] } => !!value && Array.isArray((value as {rows?:unknown}).rows));
  const documents = useLiveData<{ rows: SavedDocument[] }>(docsPath, [docsPath, epoch], (value): value is { rows: SavedDocument[] } => !!value && Array.isArray((value as {rows?:unknown}).rows));
  const records = selectedIvdRecords(assessments, documents, selected, programId);
  const { assessment, document, loading, error, title } = records;

  async function refresh() {
    try {
      const [a, d] = await Promise.all([assessmentRequest('GET', path), assessmentRequest('GET', docsPath)]);
      if (!Array.isArray(a.rows) || !Array.isArray(d.rows)) throw new Error('Saved records were not confirmed.');
      setUncertain(false); setEpoch(value => value + 1); setNotice('Saved records refreshed. Check them before creating another record.');
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Saved records could not be refreshed.'); }
  }
  async function save(values: Record<string, string>) {
    if (uncertain) throw new Error('Refresh and check saved records before submitting again.');
    const isClassification = form === 'classification';
    const facts = isClassification ? enteredIvdrFacts(values) : { manufacturerName: values.manufacturerName,
      deviceName: values.deviceName, affectedLots: split(values.affectedLots), actionType: values.actionType,
      reasonForAction: values.reasonForAction, riskToHealth: values.riskToHealth, recommendedUserAction: values.recommendedUserAction, contactDetails: values.contactDetails };
    try {
      const saved = await assessmentRequest('POST', isClassification ? '/api/ivd-assessments/classification' : '/api/ivd-assessments/documents/fsn',
        { programId, title: values.title, reason: values.reason, facts });
      const id = requireSavedIdentity(saved, programId);
      setSelected(`${isClassification ? 'assessment' : 'document'}:${id}`); setEpoch(value => value + 1); setForm(null);
      setNotice('Draft saved. Read the recorded inputs and result, then create a verified working copy for review and signing in Authoring.');
    } catch (failure) { setUncertain(true); setNotice('Save was not confirmed. Refresh and check saved records before another attempt.'); throw failure; }
  }
  function submit(values: Record<string, string>) {
    if (running.current) return;
    running.current = true; setBusy(true); setFormError('');
    void save(values).catch(error => setFormError(error instanceof Error ? error.message : 'Save was not confirmed.'))
      .finally(() => { running.current = false; setBusy(false); });
  }
  return <section className="reg-card" aria-label="IVD assessment workbench">
    <h2>Assess, save and review IVD evidence</h2>
    <p>Classification and generated documents are saved snapshots. A verified working copy opens the existing Authoring review and signature workflow; its approval does not transfer from the source.</p>
    <button className="nda-open" onClick={() => setForm('classification')}>Assess IVDR classification</button>{' '}
    <button className="nda-open" onClick={() => setForm('fsn')}>Draft Field Safety Notice</button>{' '}
    <button className="nda-open" onClick={refresh}>Refresh saved IVD records</button>
    {notice && <p role="status">{notice}</p>}
    <IvdSavedRecords loading={loading} error={error} assessments={records.assessments} documents={records.documents} selected={selected} onSelect={setSelected} />
    {selected && !loading && !error && <IvdSavedSnapshot assessment={assessment} document={document} title={title} canOpen={!!onNav} onOpen={setSource} />}
    {form && <C2CForm config={{ ...(form === 'classification' ? CLASSIFICATION : FSN), notice: formError || undefined, busy: busy ? 'Saving governed draft…' : undefined }} onCancel={() => setForm(null)} onSubmit={submit} />}
    {source && <SourceImportDialog programId={programId} source={source} title={title} onClose={() => setSource(null)}
      onOpenDocument={onNav ? docId => openImportedDocument(docId, programId, onNav) : undefined} />}
  </section>;
}

function IvdSavedRecords({ loading, error, assessments, documents, selected, onSelect }: { loading: boolean; error?: string | null; assessments: SavedAssessment[]; documents: SavedDocument[]; selected: string; onSelect: (id: string) => void }) {
  if (loading) return <p role="status">Loading saved IVD evidence…</p>;
  if (error) return <p role="alert">{error}</p>;
  return <><label htmlFor="ivd-saved-record">Saved IVD record</label><select id="ivd-saved-record" value={selected} onChange={event => onSelect(event.target.value)}>
    <option value="">Choose saved evidence</option>{assessments.map(row => <option key={row.id} value={`assessment:${row.id}`}>{row.title || row.assessment_type} · {row.verdict || 'no verdict'}</option>)}
    {documents.map(row => <option key={row.id} value={`document:${row.id}`}>{row.title || row.doc_type} · {row.status}</option>)}
  </select>{!assessments.length && !documents.length && <p>No IVD records are saved for this program.</p>}</>;
}
function IvdSavedSnapshot({ assessment, document, title, canOpen, onOpen }: { assessment?: SavedAssessment; document?: SavedDocument; title: string; canOpen: boolean; onOpen: (source: WorkflowImportSource) => void }) {
  if (!assessment && !document) return <p role="alert">The selected IVD record is unavailable in the open program.</p>;
  const source: WorkflowImportSource = assessment ? { kind: 'ivd-assessment', documentId: assessment.id } : { kind: 'ivd-document', documentId: document!.id };
  return <div><h3>{title}</h3>
    {assessment ? <><RecordedSnapshot title="Recorded device facts" value={assessment.inputs} /><RecordedSnapshot title="Saved assessment result" value={assessment.result} /></>
      : <><p>Saved document status: {document?.status}</p><RecordedSnapshot title="Saved document payload" value={document?.payload} /></>}
    <button className="nda-open" disabled={!canOpen} onClick={() => onOpen(source)}>Create working copy for review and signing</button>
  </div>;
}

function selectedIvdRecords(assessments: {data: {rows: SavedAssessment[]} | null;loading:boolean;error?:string}, documents: {data: {rows: SavedDocument[]} | null;loading:boolean;error?:string}, selected: string, programId: string) {
  const assessmentRows=assessments.data?.rows || [];const documentRows=documents.data?.rows || [];
  const assessment=assessmentRows.find(row=>`assessment:${row.id}`===selected&&row.program_id===programId);
  const document=documentRows.find(row=>`document:${row.id}`===selected&&row.program_id===programId);
  return {assessment,document,assessments:assessmentRows,documents:documentRows,loading:assessments.loading||documents.loading,
    error:assessments.error||documents.error,title:assessment?.title||document?.title||'Saved IVD record'};
}
