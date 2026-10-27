import React, { useId, useRef, useState } from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { setEditorTarget } from '../editorTarget';
import { isWorkflowImportOrigin, type AuthoringImportSource, type AuthoringSourceImportData, type AuthoringSourceImportPreviewData } from '@shared/authoring/source-import';
import { isWorkflowSource, workflowSourceKey } from '../authoringHandoff';
import { AuthoringRecoveryNotice } from '../AuthoringRecoveryNotice';
import { useSourceIntake } from './useSourceIntake';
export { readSourceImportResult } from '../authoringHandoff';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

export type ImportSource = AuthoringImportSource;
export type SourceImportResult = AuthoringSourceImportData;
const SOURCE_LABELS: Record<ImportSource['kind'], string> = { vault: 'Vault', 'data-room': 'Data room', protocol: 'Protocol', csr: 'CSR', 'ivd-assessment': 'IVD assessment', 'ivd-document': 'IVD generated document', 'study-design-crf': 'Blank CRFs', 'agency-response': 'Agency response' };

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
  /** Prefer an actual saved section while retaining the user's section choice. */
  initialSectionCode?: string;
  programName?: string;
  openBlocked?: boolean;
}

/** A source or project change cannot retain another source's saved copy. */
export function SourceImportDialog(props: SourceImportDialogProps) {
  const id = isWorkflowSource(props.source) ? workflowSourceKey(props.source)
    : props.source.kind === 'vault' ? props.source.documentId : props.source.sourceId;
  return <ScopedSourceImportDialog key={`${props.programId}:${props.source.kind}:${id}`} {...props} />;
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
    {preview.association.required && <p>This source has no recorded project association. An explicit association reason is required for this target.</p>}
  </div>;
}

function SourceImportReceipt({ result, onOpen, blocked, initialSectionCode }: { result: SourceImportResult; onOpen?: (code?: string) => void; blocked: boolean; initialSectionCode?: string }) {
  const workflow = isWorkflowImportOrigin(result.origin);
  const sections = result.sections;
  const [code, setCode] = useState(() => String(sections.find(section => section.code === initialSectionCode)?.code ?? sections[0]?.code ?? ''));
  return <div className="de-gov" role="status" data-testid="source-import-result">
    <span className="ico">{I.checkCircle}</span><div className="de-gov-t">
    <div>{result.reused ? 'Existing working copy ready' : 'Draft working copy saved'}: “{result.doc.title}”.</div>
    <div>{workflow ? 'Source fingerprint' : 'Source SHA-256'}: <span className="source-import-hash">{isWorkflowImportOrigin(result.origin) ? result.origin.fingerprint : result.origin.sha256}</span></div>
    {result.warnings.length > 0 && <ul className="source-import-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {workflow && sections.length > 0 && <label>Section to open <select className="c2c-input" value={code} onChange={e => setCode(e.target.value)}>
      {sections.map(s => <option key={String(s.id)} value={String(s.code)}>{String(s.code)} · {String(s.title ?? '')}</option>)}
    </select></label>}
    {sections.length === 0 && <p>This working copy currently has no saved sections. Open it to continue drafting.</p>}
    {blocked && <p>Save or discard the source editor's unsaved changes before opening this copy.</p>}
    {onOpen ? <button className="de-btn primary" disabled={blocked} onClick={() => onOpen(workflow && code ? code : undefined)}>{I.penLine} Open working copy</button>
      : <div>Open document authoring in this project to find the saved working copy.</div>}
    </div>
  </div>;
}

function ScopedSourceImportDialog({ programId, source, title, onClose, onOpenDocument, initialSectionCode, programName, openBlocked = false }: SourceImportDialogProps) {
  const labelId = useId();
  const reasonId = useId();
  const associationId = useId();
  const intake = useSourceIntake(programId, source);
  const host = useRef({ onClose, onOpenDocument, openBlocked });
  host.current = { onClose, onOpenDocument, openBlocked };
  const close = () => { if (intake.canClose()) host.current.onClose(); };
  const dialogRef = useDialog(close);
  const workflow = isWorkflowSource(source);
  const onOpen = onOpenDocument ? (code?: string) => {
    if (!intake.current() || host.current.openBlocked || !intake.result
      || (code !== undefined && !intake.result.sections.some(section => section.code === code))) return;
    const latest = host.current;
    const savedId = intake.result.doc.id;
    latest.onClose();
    if (!intake.contextCurrent() || host.current.openBlocked) return;
    if (code) host.current.onOpenDocument?.(savedId, code); else host.current.onOpenDocument?.(savedId);
  } : undefined;
  return <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="de de-source-import" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelId} data-testid="source-import-dialog">
      <div className="de-h"><div>
        <div className="de-h-eye">{SOURCE_LABELS[source.kind]} → document editor</div>
        <div className="de-h-t" id={labelId}>{workflow ? 'Open saved draft in editor' : 'Work on this document'}</div>
        <div className="de-h-s">{intake.retired ? 'Source intake closed to further work' : title}</div>
      </div><button className="de-x" onClick={close} disabled={intake.busy} aria-label="Close">{I.close}</button></div>
      <IntakeBody programId={programId} programName={programName} source={source} intake={intake}
        reasonId={reasonId} associationId={associationId} openBlocked={openBlocked} onOpen={onOpen} initialSectionCode={initialSectionCode} />
      <IntakeFooter intake={intake} workflow={workflow} onClose={close} />
    </div>
  </div>;
}

type SourceIntake = ReturnType<typeof useSourceIntake>;
function IntakeFields({ intake, reasonId, associationId }: { intake: SourceIntake; reasonId: string; associationId: string }) {
  if (intake.result) return null;
  return <>
    <SourceReasonField id={reasonId} value={intake.reason} onChange={intake.setReason} busy={intake.busy || intake.held} />
    {intake.preview?.association.required && <SourceReasonField id={associationId} label="Reason for associating this source with the target project"
      value={intake.associationReason} onChange={intake.setAssociationReason} busy={intake.busy || intake.held} />}
  </>;
}
function IntakeBody({ programId, programName, source, intake, reasonId, associationId, openBlocked, onOpen, initialSectionCode }: {
  programId: string; programName?: string; source: ImportSource; intake: SourceIntake; reasonId: string; associationId: string;
  openBlocked: boolean; onOpen?: (code?: string) => void; initialSectionCode?: string;
}) {
  const workflow = isWorkflowSource(source);
  if (intake.retired) return <div className="de-body"><AuthoringRecoveryNotice role="alert" message={intake.retirementMessage} /></div>;
  return <div className="de-body">
    <p className="de-gov-t">Target project: {programName || programId}</p>
    {!workflow && <SourceImportIntro kind={source.kind} />}
    {workflow && intake.busy && !intake.result && !intake.preview && <p>Reading saved source…</p>}
    {intake.preview && <WorkflowPreview preview={intake.preview} />}
    <IntakeFields intake={intake} reasonId={reasonId} associationId={associationId} />
    <IntakeRecovery intake={intake} />
    {intake.error && <div className="de-err" role="alert">{intake.error}</div>}
    {intake.result && <SourceImportReceipt result={intake.result} blocked={openBlocked} onOpen={onOpen} initialSectionCode={initialSectionCode} />}
  </div>;
}
function IntakeRecovery({ intake }: { intake: SourceIntake }) {
  if (!intake.recoveryMessage) return null;
  return <AuthoringRecoveryNotice role={intake.checked ? 'status' : 'alert'} message={intake.recoveryMessage}
    actions={intake.checked ? [] : [{ label: 'Check working documents', disabled: intake.busy, onClick: () => void intake.check() }]}>
    {intake.inventory && (intake.inventory.length ? <ul>{intake.inventory.map(row => <li key={row.id}>{row.title}</li>)}</ul>
      : <p>No working documents were returned. This does not prove that the earlier save did not commit.</p>)}
  </AuthoringRecoveryNotice>;
}
const intakeActionLabel = (intake: SourceIntake) => {
  if (intake.activity === 'checking') return 'Checking working documents…';
  if (intake.activity === 'previewing') return 'Reading saved source…';
  return intake.busy ? 'Creating working copy…' : 'Create working copy';
};
const intakeCloseLabel = (intake: SourceIntake) => intake.result || intake.held || intake.retired || intake.checked ? 'Close' : 'Cancel';
function IntakeFooter({ intake, workflow, onClose }: { intake: SourceIntake; workflow: boolean; onClose: () => void }) {
  return <div className="de-f"><button className="de-btn ghost" onClick={onClose} disabled={intake.busy}>{intakeCloseLabel(intake)}</button>
    {workflow && !intake.retired && !intake.held && !intake.preview && !intake.result && <button className="de-btn ghost" disabled={intake.busy} onClick={() => void intake.refresh()}>Reload source preview</button>}
    {!intake.retired && !intake.result && <button className="de-btn primary" disabled={intake.busy || !intake.canCreate} onClick={() => void intake.pull()}>{intakeActionLabel(intake)}</button>}
  </div>;
}
