import React, { useEffect, useId, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { setEditorTarget } from '../editorTarget';
import { isWorkflowImportOrigin, type AuthoringImportSource, type AuthoringSourceImportData, type AuthoringSourceImportPreviewData } from '@shared/authoring/source-import';
import { createWorkflowImport, isWorkflowSource, previewWorkflowImport, workflowSourceKey } from '../authoringHandoff';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

export type ImportSource = AuthoringImportSource;
export type SourceImportResult = AuthoringSourceImportData;
const SOURCE_LABELS: Record<ImportSource['kind'], string> = { vault: 'Vault', 'data-room': 'Data room', protocol: 'Protocol', csr: 'CSR' };

/** Availability explanations follow the same recorded source state in each host. */
export function sourceImportUnavailableReason(source: {
  dataEligible?: boolean; isCurrent?: boolean; originalFileAvailable?: boolean; disposition?: string | null;
}): string | null {
  if (source.dataEligible === false || source.isCurrent === false
    || source.disposition === 'remove_data' || source.disposition === 'supersede') return 'This source is excluded from active data use.';
  if (source.originalFileAvailable === false) return 'The original file is unavailable, so a working copy cannot be created.';
  return null;
}

const REASON_LABEL = 'Reason for creating a working copy';
function validReason(reason: string): boolean {
  const length = reason.trim().length;
  return length >= GOVERNED_REASON_MIN && length <= GOVERNED_REASON_MAX;
}

function SourceReasonField({ id, value, busy, onChange, label = REASON_LABEL }: {
  id: string; value: string; busy: boolean; onChange: (value: string) => void; label?: string;
}) {
  return <div className="de-field">
    <label className="de-label" htmlFor={id}>{label}<span className="req" aria-hidden="true">*</span></label>
    <div className="de-desc" id={`${id}-note`}>Recorded with the working copy on the document’s audit trail. Use {GOVERNED_REASON_MIN}–{GOVERNED_REASON_MAX} characters.</div>
    <textarea id={id} className="c2c-input" aria-label={label} aria-required="true" aria-describedby={`${id}-note`}
      value={value} onChange={e => onChange(e.target.value)} disabled={busy} maxLength={GOVERNED_REASON_MAX} rows={3} />
  </div>;
}

function SourceImportIntro({ kind }: { kind: ImportSource['kind'] }) {
  return <div className="de-source-intro">
    <div className="de-gov">
      <span className="ico">{I.fileText}</span>
      <div className="de-gov-t">Creates a draft working copy in this project, linked to the source version. The original file stays in the {kind === 'vault' ? 'Vault' : 'data room'}.</div>
    </div>
    <p className="de-desc">Word documents retain supported headings, lists and tables. Other readable formats become extracted text; page layout, spreadsheet formulas, figures and form controls need review against the original.</p>
  </div>;
}

function sourceMatches(origin: SourceImportResult['origin'] | undefined, programId: string, source: ImportSource): boolean {
  if (!origin || isWorkflowSource(source) || isWorkflowImportOrigin(origin)) return false;
  const sourceId = source.kind === 'vault' ? source.documentId : String(source.sourceId);
  return origin.programId === programId && origin.kind === source.kind && String(origin.id) === sourceId
    && typeof origin.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(origin.sha256)
    && ['docx-structure', 'extracted-text'].includes(origin.conversion);
}

/** A binary success identifies the exact requested working copy and source. */
export function readSourceImportResult(body: unknown, programId: string, source: ImportSource): SourceImportResult | null {
  const envelope = body as { success?: unknown; data?: SourceImportResult } | null;
  const data = envelope?.data;
  if (envelope?.success !== true || !data || typeof data.doc?.id !== 'string' || !data.doc.id.trim()
    || typeof data.doc.title !== 'string' || !sourceMatches(data.origin, programId, source)
    || !Array.isArray(data.warnings) || !data.warnings.every(w => typeof w === 'string')
    || typeof data.reused !== 'boolean') return null;
  return data;
}

export function openImportedDocument(docId: string, programId: string, onNav: (id: string) => void, code?: string): void {
  setEditorTarget({ docType: null, docId, programId, ...(code ? { code } : {}) });
  onNav('document-authoring');
}

interface SourceImportDialogProps {
  programId: string;
  source: ImportSource;
  title: string;
  onClose: () => void;
  /** The editor supplies its unsaved-work guard; other surfaces deep-link by id. */
  onOpenDocument?: (docId: string, code?: string) => void;
  programName?: string;
  openBlocked?: boolean;
}

/** A source or project change cannot retain another source's saved copy. */
export function SourceImportDialog(props: SourceImportDialogProps) {
  const id = isWorkflowSource(props.source) ? workflowSourceKey(props.source)
    : props.source.kind === 'vault' ? props.source.documentId : props.source.sourceId;
  return <ScopedSourceImportDialog key={`${props.programId}:${props.source.kind}:${id}`} {...props} />;
}

async function readBinaryCopy(programId: string, source: ImportSource, reason: string) {
  const res = await apiRequest('POST', '/api/authoring/import/source', { programId, source, reason });
  const body = await res.json().catch(() => null);
  const data = res.ok ? readSourceImportResult(body, programId, source) : null;
  return data ? { ok: true as const, data } : { ok: false as const,
    message: serverMessage(body) ?? 'The server did not confirm this working copy. Reload before retrying.' };
}

function useSourceIntake(programId: string, source: ImportSource) {
  const [reason, setReason] = useState('');
  const [associationReason, setAssociationReason] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const [result, setResult] = useState<SourceImportResult | null>(null);
  const [preview, setPreview] = useState<AuthoringSourceImportPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = async () => {
    if (!isWorkflowSource(source) || busyRef.current) return;
    busyRef.current = true; setBusy(true); setPreview(null); setError(null);
    const reply = await previewWorkflowImport(programId, source);
    if (!alive.current) return;
    if (reply.ok) setPreview(reply.data); else setError(reply.message);
    busyRef.current = false; setBusy(false);
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => { void refreshRef.current(); }, []);
  const canCreate = validReason(reason) && (!isWorkflowSource(source) || (!!preview
    && (!preview.association.required || validReason(associationReason))));
  const pull = async () => {
    if (busyRef.current || result || !canCreate) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const reply = isWorkflowSource(source) && preview
        ? await createWorkflowImport(programId, source, preview, reason.trim(), associationReason.trim())
        : await readBinaryCopy(programId, source, reason.trim());
      if (!alive.current) return;
      if (reply.ok) setResult(reply.data);
      else { setError(reply.message); setPreview(null); }
    } catch (e) {
      if (alive.current) setError(redactInternals(e instanceof Error ? e.message : '', 'The source intake could not be reached. Reload before retrying.'));
    } finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  };
  return { reason, setReason, associationReason, setAssociationReason, busy, busyRef, alive, result, preview, error, canCreate, pull, refresh };
}

function WorkflowPreview({ preview }: { preview: AuthoringSourceImportPreviewData }) {
  return <div className="de-source-intro" data-testid="workflow-import-preview">
    <p>Saved source: {preview.origin.title} · version {preview.origin.version ?? 'not recorded'} · {preview.origin.sourceScope.level} scope.</p>
    <p className="de-desc">Snapshot fingerprint: <span className="source-import-hash">{preview.fingerprint}</span></p>
    <p>Creates an unbound draft. Source approval or signatures are not copied.</p>
    <ul>{preview.sections.map(s => <li key={s.code}>{s.code} · {s.title}</li>)}</ul>
    <ul>{preview.origin.sectionOrigins.map(s => <li key={s.code}>{s.code} · {s.originalAuthorship === 'unknown' ? 'Original authorship not recorded' : `${s.originalAuthorship} origin`}
      {s.model ? ` · Recorded model name: ${s.model}; qualification evidence not recorded` : ' · Model not recorded'}</li>)}</ul>
    {preview.gaps.length > 0 && <div><strong>Recorded gaps</strong><ul>{preview.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>}
    {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {preview.association.required && <p>This source has no recorded program association. An explicit association reason is required for this target.</p>}
  </div>;
}

function SourceImportReceipt({ result, onOpen, blocked }: { result: SourceImportResult; onOpen?: (code?: string) => void; blocked: boolean }) {
  const workflow = isWorkflowImportOrigin(result.origin);
  const sections = result.sections.filter(s => typeof s.code === 'string');
  const [code, setCode] = useState(String(sections[0]?.code ?? ''));
  return <div className="de-gov" role="status" data-testid="source-import-result">
    <span className="ico">{I.checkCircle}</span><div className="de-gov-t">
    <div>{result.reused ? 'Existing working copy ready' : 'Draft working copy saved'}: “{result.doc.title}”.</div>
    <div>{workflow ? 'Source fingerprint' : 'Source SHA-256'}: <span className="source-import-hash">{isWorkflowImportOrigin(result.origin) ? result.origin.fingerprint : result.origin.sha256}</span></div>
    {result.warnings.length > 0 && <ul className="source-import-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {workflow && <label>Section to open <select className="c2c-input" value={code} onChange={e => setCode(e.target.value)}>
      {sections.map(s => <option key={String(s.id)} value={String(s.code)}>{String(s.code)} · {String(s.title ?? '')}</option>)}
    </select></label>}
    {blocked && <p>Save or discard the source editor's unsaved changes before opening this copy.</p>}
    {onOpen ? <button className="de-btn primary" disabled={blocked} onClick={() => onOpen(workflow ? code : undefined)}>{I.penLine} Open working copy</button>
      : <div>Open document authoring in this project to find the saved working copy.</div>}
    </div>
  </div>;
}

function ScopedSourceImportDialog({ programId, source, title, onClose, onOpenDocument, programName, openBlocked = false }: SourceImportDialogProps) {
  const labelId = useId();
  const reasonId = useId();
  const associationId = useId();
  const intake = useSourceIntake(programId, source);
  const dialogRef = useDialog(() => { if (!intake.busyRef.current) onClose(); });
  const workflow = isWorkflowSource(source);
  const onOpen = onOpenDocument ? (code?: string) => {
    if (!intake.alive.current || openBlocked || !intake.result) return;
    onClose();
    if (code) onOpenDocument(intake.result.doc.id, code); else onOpenDocument(intake.result.doc.id);
  } : undefined;
  return <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget && !intake.busyRef.current) onClose(); }}>
    <div className="de de-source-import" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelId} data-testid="source-import-dialog">
      <div className="de-h"><div>
        <div className="de-h-eye">{SOURCE_LABELS[source.kind]} → document editor</div>
        <div className="de-h-t" id={labelId}>{workflow ? 'Open saved draft in editor' : 'Work on this document'}</div>
        <div className="de-h-s">{title}</div>
      </div><button className="de-x" onClick={onClose} disabled={intake.busy} aria-label="Close">{I.close}</button></div>
      <IntakeBody programId={programId} programName={programName} source={source} intake={intake}
        reasonId={reasonId} associationId={associationId} openBlocked={openBlocked} onOpen={onOpen} />
      <IntakeFooter intake={intake} workflow={workflow} onClose={onClose} />
    </div>
  </div>;
}

type SourceIntake = ReturnType<typeof useSourceIntake>;
function IntakeFields({ intake, reasonId, associationId }: { intake: SourceIntake; reasonId: string; associationId: string }) {
  if (intake.result) return null;
  return <>
    <SourceReasonField id={reasonId} value={intake.reason} onChange={intake.setReason} busy={intake.busy} />
    {intake.preview?.association.required && <SourceReasonField id={associationId} label="Reason for associating this source with the target project"
      value={intake.associationReason} onChange={intake.setAssociationReason} busy={intake.busy} />}
  </>;
}
function IntakeBody({ programId, programName, source, intake, reasonId, associationId, openBlocked, onOpen }: {
  programId: string; programName?: string; source: ImportSource; intake: SourceIntake; reasonId: string; associationId: string;
  openBlocked: boolean; onOpen?: (code?: string) => void;
}) {
  const workflow = isWorkflowSource(source);
  return <div className="de-body">
    <p className="de-gov-t">Target project: {programName || programId}</p>
    {!workflow && <SourceImportIntro kind={source.kind} />}
    {workflow && intake.busy && !intake.result && !intake.preview && <p>Reading saved source…</p>}
    {intake.preview && <WorkflowPreview preview={intake.preview} />}
    <IntakeFields intake={intake} reasonId={reasonId} associationId={associationId} />
    {intake.error && <div className="de-err" role="alert">{intake.error}</div>}
    {intake.result && <SourceImportReceipt result={intake.result} blocked={openBlocked} onOpen={onOpen} />}
  </div>;
}
function IntakeFooter({ intake, workflow, onClose }: { intake: SourceIntake; workflow: boolean; onClose: () => void }) {
  return <div className="de-f"><button className="de-btn ghost" onClick={onClose} disabled={intake.busy}>{intake.result ? 'Close' : 'Cancel'}</button>
    {workflow && !intake.preview && !intake.result && <button className="de-btn ghost" disabled={intake.busy} onClick={() => void intake.refresh()}>Reload source preview</button>}
    {!intake.result && <button className="de-btn primary" disabled={intake.busy || !intake.canCreate} onClick={() => void intake.pull()}>{intake.busy ? (workflow && !intake.preview ? 'Reading saved source…' : 'Creating working copy…') : 'Create working copy'}</button>}
  </div>;
}
